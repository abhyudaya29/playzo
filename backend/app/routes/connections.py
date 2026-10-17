from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import current_user, db_session
from app.models import Connection, Conversation, User
from app.schemas import ConnectionInput
from app.social import blocked, allowed_pair, notify, pair_key, pair_lock, room

router = APIRouter(prefix="/api/v1/connections")


@router.post("")
async def connect(
    data: ConnectionInput,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(db_session),
):
    if data.receiver_id == user.id:
        raise HTTPException(400, "Cannot connect to yourself")
    if not await db.get(User, data.receiver_id):
        raise HTTPException(404, "Player not found")
    await pair_lock(db, user.id, data.receiver_id)
    await allowed_pair(db, user.id, data.receiver_id)
    existing = await db.scalar(
        select(Connection.id)
        .where(
            or_(
                and_(
                    Connection.requester_id == user.id,
                    Connection.receiver_id == data.receiver_id,
                ),
                and_(
                    Connection.receiver_id == user.id,
                    Connection.requester_id == data.receiver_id,
                ),
            )
        )
        .limit(1)
    )
    if existing:
        raise HTTPException(
            409, "A request already exists. You can view it in Requests."
        )
    connection = Connection(
        requester_id=user.id,
        receiver_id=data.receiver_id,
        introduction=(data.introduction or "").strip() or None,
        sport=data.sport,
    )
    db.add(connection)
    await db.flush()
    notify(
        db,
        data.receiver_id,
        "connection_request",
        f"{user.name} wants to connect"
        + (f" for {data.sport}." if data.sport else "."),
        "/requests",
        actor=user,
        request_id=connection.id,
    )
    await db.commit()
    return {"id": connection.id, "status": connection.status}


async def list_connections(user, db):
    rows = (
        (
            await db.execute(
                select(Connection)
                .where(
                    or_(
                        Connection.requester_id == user.id,
                        Connection.receiver_id == user.id,
                    )
                )
                .order_by(Connection.created_at.desc())
                .limit(200)
            )
        )
        .scalars()
        .all()
    )
    result = []
    for connection in rows:
        other_id = (
            connection.receiver_id
            if connection.requester_id == user.id
            else connection.requester_id
        )
        if await blocked(db, user.id, other_id):
            continue
        other = await db.get(User, other_id)
        conversation = None
        if connection.status == "accepted":
            conversation = await room(
                db, "direct", [connection.requester_id, connection.receiver_id]
            )
        result.append(
            {
                "id": connection.id,
                "kind": "connection",
                "requester_id": connection.requester_id,
                "receiver_id": connection.receiver_id,
                "status": connection.status,
                "direction": (
                    "outgoing" if connection.requester_id == user.id else "incoming"
                ),
                "person": {"id": other.id, "name": other.name},
                "title": "Player connection",
                "introduction": connection.introduction,
                "sport": connection.sport,
                "created_at": connection.created_at,
                "conversation_id": conversation.id if conversation else None,
                "can_respond": connection.receiver_id == user.id
                and connection.status == "pending",
            }
        )
    await db.commit()
    return result


@router.get("")
@router.get("/requests")
async def connections(
    user: User = Depends(current_user), db: AsyncSession = Depends(db_session)
):
    return await list_connections(user, db)


async def respond(id, decision, user, db):
    connection = (
        await db.execute(
            select(Connection).where(Connection.id == id).with_for_update()
        )
    ).scalar_one_or_none()
    if not connection or connection.receiver_id != user.id:
        raise HTTPException(404, "Request not found")
    await allowed_pair(db, connection.requester_id, user.id)
    if connection.status != "pending" and connection.status != decision:
        raise HTTPException(409, "This request has already been closed")
    conversation = None
    changed = connection.status == "pending"
    connection.status = decision
    if decision == "accepted":
        conversation = await room(
            db, "direct", [connection.requester_id, connection.receiver_id]
        )
    if changed:
        notify(
            db,
            connection.requester_id,
            f"connection_{decision}",
            f"{user.name} {decision} your connection request.",
            (
                f"/messages?conversation={conversation.id}"
                if conversation
                else "/requests"
            ),
            actor=user,
            request_id=connection.id,
        )
    await db.commit()
    return {
        "status": decision,
        "conversation_id": conversation.id if conversation else None,
    }


@router.patch("/{id}/accept")
async def accept(
    id: str, user: User = Depends(current_user), db: AsyncSession = Depends(db_session)
):
    return await respond(id, "accepted", user, db)


@router.patch("/{id}/decline")
async def decline(
    id: str, user: User = Depends(current_user), db: AsyncSession = Depends(db_session)
):
    return await respond(id, "declined", user, db)


@router.patch("/{id}")
async def legacy_respond(
    id: str,
    status: str = Query(...),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(db_session),
):
    if status not in ("accepted", "rejected", "declined"):
        raise HTTPException(422, "Invalid status")
    return await respond(id, "declined" if status == "rejected" else status, user, db)
