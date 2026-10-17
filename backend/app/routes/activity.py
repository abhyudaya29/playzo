from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import current_user, db_session
from app.models import (
    Conversation,
    ConversationMember,
    Message,
    Notification,
    User,
    UserBlock,
)
from app.routes.requests import all_requests
from app.schemas import BlockInput
from app.social import access, emit, pair_lock

router = APIRouter(prefix="/api/v1")


async def excluded_actors(db, user_id):
    rows = (
        (
            await db.execute(
                select(UserBlock).where(
                    or_(
                        UserBlock.blocker_id == user_id, UserBlock.blocked_id == user_id
                    )
                )
            )
        )
        .scalars()
        .all()
    )
    return [
        entry.blocked_id if entry.blocker_id == user_id else entry.blocker_id
        for entry in rows
    ]


@router.get("/notifications")
async def notifications(
    user: User = Depends(current_user), db: AsyncSession = Depends(db_session)
):
    excluded = await excluded_actors(db, user.id)
    query = select(Notification).where(Notification.user_id == user.id)
    if excluded:
        query = query.where(
            Notification.payload["actor_id"].as_string().not_in(excluded)
        )
    entries = (
        (await db.execute(query.order_by(Notification.created_at.desc()).limit(60)))
        .scalars()
        .all()
    )
    return [
        {
            "id": entry.id,
            "kind": entry.kind,
            "payload": entry.payload,
            "is_read": entry.is_read,
            "created_at": entry.created_at,
        }
        for entry in entries
    ]


@router.patch("/notifications/read")
async def notifications_read(
    user: User = Depends(current_user), db: AsyncSession = Depends(db_session)
):
    await db.execute(
        update(Notification).where(Notification.user_id == user.id).values(is_read=True)
    )
    await db.commit()
    return {"success": True}


@router.patch("/notifications/{id}/read")
async def notification_read(
    id: str, user: User = Depends(current_user), db: AsyncSession = Depends(db_session)
):
    entry = await db.get(Notification, id)
    if not entry or entry.user_id != user.id:
        raise HTTPException(404, "Notification not found")
    entry.is_read = True
    await db.commit()
    return {"success": True}


@router.get("/activity")
async def activity(
    user: User = Depends(current_user), db: AsyncSession = Depends(db_session)
):
    entries = await all_requests(user, db)
    excluded = await excluded_actors(db, user.id)
    incoming = sum(
        entry["can_respond"] and entry["person"]["id"] not in excluded
        for entry in entries
    )
    ids = list(
        (
            await db.execute(
                select(ConversationMember.conversation_id).where(
                    ConversationMember.user_id == user.id
                )
            )
        ).scalars()
    )
    accessible = []
    for id in ids:
        try:
            await access(db, id, user.id)
            accessible.append(id)
        except HTTPException:
            pass
    unread = await db.scalar(
        select(func.count())
        .select_from(Message)
        .join(
            ConversationMember,
            and_(
                ConversationMember.conversation_id == Message.conversation_id,
                ConversationMember.user_id == user.id,
            ),
        )
        .where(
            Message.conversation_id.in_(accessible),
            Message.id > ConversationMember.last_read_message_id,
            Message.sender_id != user.id,
        )
    )
    notice_query = (
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user.id, Notification.is_read.is_(False))
    )
    if excluded:
        notice_query = notice_query.where(
            Notification.payload["actor_id"].as_string().not_in(excluded)
        )
    return {
        "requests": incoming,
        "messages": unread,
        "notifications": await db.scalar(notice_query),
    }


@router.get("/blocks")
async def blocks(
    user: User = Depends(current_user), db: AsyncSession = Depends(db_session)
):
    rows = (
        (
            await db.execute(
                select(User)
                .join(UserBlock, UserBlock.blocked_id == User.id)
                .where(UserBlock.blocker_id == user.id)
            )
        )
        .scalars()
        .all()
    )
    return [{"id": player.id, "name": player.name} for player in rows]


@router.post("/blocks")
async def block(
    data: BlockInput,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(db_session),
):
    if data.blocked_id == user.id or not await db.get(User, data.blocked_id):
        raise HTTPException(422, "Choose another player")
    await pair_lock(db, user.id, data.blocked_id)
    # Serialize with message writes before changing access. Always lock in ID order.
    shared = select(ConversationMember.conversation_id).where(
        ConversationMember.user_id == data.blocked_id
    )
    rows = list(
        (
            await db.execute(
                select(Conversation)
                .join(ConversationMember)
                .where(
                    ConversationMember.user_id == user.id,
                    Conversation.id.in_(shared),
                )
                .order_by(Conversation.id)
                .with_for_update(of=Conversation)
            )
        ).scalars()
    )
    if not await db.get(UserBlock, (user.id, data.blocked_id)):
        db.add(UserBlock(blocker_id=user.id, blocked_id=data.blocked_id))
    await db.commit()
    for conversation in rows:
        await emit(
            conversation.id,
            {"type": "access.changed", "conversation_id": conversation.id},
        )
    return {"blocked": True}


@router.delete("/blocks/{id}")
async def unblock(
    id: str, user: User = Depends(current_user), db: AsyncSession = Depends(db_session)
):
    await pair_lock(db, user.id, id)
    entry = await db.get(UserBlock, (user.id, id))
    if entry:
        await db.delete(entry)
    await db.commit()
    return {"blocked": False}
