from app.services.platform import record
import asyncio
import hashlib
import json
import secrets
import time
import uuid
from datetime import timezone

from fastapi import (
    APIRouter,
    Depends,
    Header,
    HTTPException,
    Query,
    WebSocket,
    WebSocketDisconnect,
)
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import valkey
from app.config import FRONTEND_ORIGINS
from app.database import Session
from app.dependencies import current_user, db_session, verify_token
from app.models import Conversation, ConversationMember, Message, Notification, User
from app.participation import invite
from app.routes.games import create_game_record
from app.schemas import GameInput, MessageInput, ReadInput
from app.social import (
    active_member_ids,
    access,
    backfill_rooms,
    describe_room,
    emit,
    message_dict,
    notify,
)

router = APIRouter(prefix="/api/v1")


async def close_socket(websocket, code):
    try:
        await websocket.close(code=code)
    except (WebSocketDisconnect, RuntimeError):
        # The browser may close while access is being revoked.
        pass


@router.get("/conversations")
async def conversations(
    user: User = Depends(current_user), db: AsyncSession = Depends(db_session)
):
    await backfill_rooms(db, user.id)
    await db.commit()
    rows = (
        (
            await db.execute(
                select(Conversation)
                .join(ConversationMember)
                .where(
                    ConversationMember.user_id == user.id,
                )
                .order_by(Conversation.created_at.desc())
                .limit(100)
            )
        )
        .scalars()
        .all()
    )
    result = []
    for conversation in rows:
        try:
            await access(db, conversation.id, user.id)
        except HTTPException:
            continue
        result.append(await describe_room(db, conversation, user.id))
    return sorted(
        result,
        key=lambda item: (
            item["last_message"]["created_at"]
            if item["last_message"]
            else item["created_at"]
        ),
        reverse=True,
    )


@router.get("/conversations/{id}")
async def conversation(
    id: str, user: User = Depends(current_user), db: AsyncSession = Depends(db_session)
):
    return await describe_room(db, await access(db, id, user.id), user.id)


@router.get("/conversations/{id}/messages")
async def messages(
    id: str,
    before: int | None = Query(None, ge=1),
    limit: int = Query(40, ge=1, le=100),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(db_session),
):
    await access(db, id, user.id)
    query = (
        select(Message, User.name)
        .join(User, User.id == Message.sender_id)
        .where(Message.conversation_id == id)
    )
    if before is not None:
        query = query.where(Message.id < before)
    rows = (await db.execute(query.order_by(Message.id.desc()).limit(limit + 1))).all()
    has_more = len(rows) > limit
    selected = rows[:limit]
    return {
        "messages": [message_dict(row[0], row[1]) for row in reversed(selected)],
        "next_before": selected[-1][0].id if has_more else None,
    }


@router.post("/conversations/{id}/messages")
async def send_message(
    id: str,
    data: MessageInput,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(db_session),
):
    conversation = await access(db, id, user.id, lock=True)
    existing = await db.scalar(
        select(Message).where(
            Message.conversation_id == id,
            Message.sender_id == user.id,
            Message.client_id == str(data.client_id),
        )
    )
    if existing:
        if existing.body != data.body:
            raise HTTPException(409, "This message identifier has already been used")
        return message_dict(existing, user.name)
    message = Message(
        conversation_id=id,
        sender_id=user.id,
        body=data.body,
        client_id=str(data.client_id),
    )
    db.add(message)
    await db.flush()
    members = await active_member_ids(db, conversation)
    for user_id in members:
        try:
            await access(db, id, user_id)
        except HTTPException:
            continue
        notify(
            db,
            user_id,
            "message",
            f"{user.name}: {data.body[:120]}",
            f"/messages?conversation={id}",
            actor=user,
            conversation_id=id,
            message_id=message.id,
        )
    record(db, user.id, "message_sent", "conversation", id)
    await db.commit()
    await emit(
        id, {"type": "message.created", "conversation_id": id, "message_id": message.id}
    )
    return message_dict(message, user.name)


@router.patch("/conversations/{id}/read")
async def mark_read(
    id: str,
    data: ReadInput,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(db_session),
):
    await access(db, id, user.id, lock=True)
    message = await db.get(Message, data.last_read_message_id)
    if not message or message.conversation_id != id:
        raise HTTPException(422, "Choose a message in this conversation")
    member = await db.get(ConversationMember, (id, user.id))
    member.last_read_message_id = max(member.last_read_message_id, message.id)
    await db.execute(
        update(Notification)
        .where(
            Notification.user_id == user.id,
            Notification.kind == "message",
            Notification.payload["conversation_id"].as_string() == id,
            Notification.payload["message_id"].as_integer()
            <= member.last_read_message_id,
        )
        .values(is_read=True)
    )
    await db.commit()
    return {"last_read_message_id": member.last_read_message_id}


@router.post("/conversations/{id}/games")
async def schedule_game(
    id: str,
    data: GameInput,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(db_session),
):
    conversation = await access(db, id, user.id, lock=True)
    if conversation.kind != "direct":
        raise HTTPException(
            422, "Schedule from a player conversation, or host a game from Games"
        )
    game = await create_game_record(data, user, db)
    peer_id = next(
        part for part in conversation.direct_key.split(":") if part != user.id
    )
    invitation = await invite(db, game, user, peer_id)
    starts_label = game.starts_at.astimezone(timezone.utc).strftime(
        "%a, %d %b %Y at %H:%M UTC"
    )
    # The invitation is a request, not automatic participation.
    message = Message(
        conversation_id=id,
        sender_id=user.id,
        client_id=str(uuid.uuid4()),
        body=f"Invited you to {game.title} at {game.venue}, {starts_label}. Open Requests to respond.",
    )
    db.add(message)
    await db.commit()
    await emit(id, {"type": "message.created", "conversation_id": id})
    return {"game_id": game.id, "invitation_id": invitation.id}


@router.post("/conversations/{id}/ticket")
async def socket_ticket(
    id: str,
    authorization: str = Header(...),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(db_session),
):
    await access(db, id, user.id)
    # Verify again rather than trusting an unsigned expiry extracted from a token.
    claims = await asyncio.to_thread(verify_token, authorization.split(" ", 1)[1])
    expires_at = min(int(claims["exp"]), int(time.time()) + 60)
    ttl = expires_at - int(time.time())
    if ttl <= 0:
        raise HTTPException(401, "Session expired")
    ticket = secrets.token_urlsafe(32)
    key = hashlib.sha256(ticket.encode()).hexdigest()
    try:
        await valkey.set(
            f"ws-ticket:{key}",
            json.dumps(
                {"user_id": user.id, "conversation_id": id, "expires_at": expires_at}
            ),
            ex=ttl,
        )
    except Exception:
        raise HTTPException(
            503, "Live updates are reconnecting. Messages remain available by refresh."
        )
    return {"ticket": ticket, "expires_at": expires_at}


@router.websocket("/ws/conversations/{id}")
async def conversation_socket(websocket: WebSocket, id: str):
    if websocket.headers.get("origin") not in FRONTEND_ORIGINS:
        await close_socket(websocket, 4403)
        return
    await websocket.accept()
    pubsub = None
    receive_task = None
    event_task = None
    try:
        hello = await asyncio.wait_for(websocket.receive_json(), timeout=5)
        ticket = hello.get("ticket", "")
        if (
            hello.get("type") != "authenticate"
            or not isinstance(ticket, str)
            or len(ticket) > 128
        ):
            await close_socket(websocket, 4401)
            return
        key = hashlib.sha256(ticket.encode()).hexdigest()
        raw = await valkey.getdel(f"ws-ticket:{key}")
        if not raw:
            await close_socket(websocket, 4401)
            return
        identity = json.loads(raw)
        if identity["conversation_id"] != id or identity["expires_at"] <= time.time():
            await close_socket(websocket, 4401)
            return
        user_id = identity["user_id"]
        async with Session() as db:
            await access(db, id, user_id)
        pubsub = valkey.pubsub()
        await pubsub.subscribe(f"conversation:{id}")
        await websocket.send_json({"type": "ready", "conversation_id": id})
        receive_task = asyncio.create_task(websocket.receive_json())
        event_task = asyncio.create_task(
            pubsub.get_message(ignore_subscribe_messages=True, timeout=1)
        )
        while time.time() < identity["expires_at"]:
            done, _ = await asyncio.wait(
                [receive_task, event_task],
                timeout=min(10, max(0.1, identity["expires_at"] - time.time())),
                return_when=asyncio.FIRST_COMPLETED,
            )
            if receive_task in done:
                receive_task.result()  # Raises immediately on disconnect.
                receive_task = asyncio.create_task(websocket.receive_json())
            if event_task in done:
                event = event_task.result()
                event_task = asyncio.create_task(
                    pubsub.get_message(ignore_subscribe_messages=True, timeout=1)
                )
                if event and event["type"] == "message":
                    async with Session() as db:
                        await access(db, id, user_id)
                    await websocket.send_text(event["data"])
            if not done:
                async with Session() as db:
                    await access(db, id, user_id)
                await websocket.send_json({"type": "heartbeat"})
        await close_socket(websocket, 4401)
    except HTTPException:
        await close_socket(websocket, 4403)
    except (WebSocketDisconnect, asyncio.TimeoutError):
        pass
    except Exception:
        try:
            await close_socket(websocket, 1011)
        except RuntimeError:
            pass
    finally:
        for task in (receive_task, event_task):
            if task:
                task.cancel()
                try:
                    await task
                except (asyncio.CancelledError, Exception):
                    pass
        if pubsub:
            await pubsub.aclose()
