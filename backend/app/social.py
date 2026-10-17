"""Shared transaction and authorization helpers for requests and conversations."""

import json
import logging
import uuid

from fastapi import HTTPException
from sqlalchemy import and_, func, or_, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import valkey
from app.models import (
    Connection,
    Conversation,
    ConversationMember,
    Game,
    GameParticipant,
    Group,
    GroupMember,
    Message,
    Notification,
    User,
    UserBlock,
)

logger = logging.getLogger(__name__)


def pair_key(first: str, second: str) -> str:
    return ":".join(sorted((first, second)))


async def pair_lock(db: AsyncSession, first: str, second: str) -> None:
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
        {"key": pair_key(first, second)},
    )


async def blocked(db: AsyncSession, first: str, second: str) -> bool:
    return bool(
        await db.scalar(
            select(UserBlock.blocker_id)
            .where(
                or_(
                    and_(UserBlock.blocker_id == first, UserBlock.blocked_id == second),
                    and_(UserBlock.blocker_id == second, UserBlock.blocked_id == first),
                )
            )
            .limit(1)
        )
    )


async def allowed_pair(db: AsyncSession, first: str, second: str) -> None:
    if await blocked(db, first, second):
        raise HTTPException(
            403, "This interaction is unavailable because a player is blocked"
        )


async def room(
    db: AsyncSession, kind: str, members: list[str], *, group_id=None, game_id=None
) -> Conversation:
    key = (
        "direct_key"
        if kind == "direct"
        else "group_id" if kind == "group" else "game_id"
    )
    value = (
        pair_key(*members)
        if kind == "direct"
        else group_id if kind == "group" else game_id
    )
    values = {"id": str(uuid.uuid4()), "kind": kind, key: value}
    await db.execute(
        insert(Conversation)
        .values(**values)
        .on_conflict_do_nothing(index_elements=[key])
    )
    conversation = (
        await db.execute(
            select(Conversation).where(getattr(Conversation, key) == value)
        )
    ).scalar_one()
    for user_id in set(members):
        await db.execute(
            insert(ConversationMember)
            .values(
                conversation_id=conversation.id,
                user_id=user_id,
                last_read_message_id=0,
            )
            .on_conflict_do_nothing()
        )
    return conversation


async def active_member_ids(db, conversation):
    if conversation.kind == "group":
        query = select(GroupMember.user_id).where(
            GroupMember.group_id == conversation.group_id
        )
    elif conversation.kind == "game":
        query = select(GameParticipant.user_id).where(
            GameParticipant.game_id == conversation.game_id
        )
    else:
        query = select(ConversationMember.user_id).where(
            ConversationMember.conversation_id == conversation.id
        )
    return list((await db.execute(query)).scalars())


async def access(db: AsyncSession, conversation_id: str, user_id: str, *, lock=False):
    query = (
        select(Conversation)
        .join(ConversationMember)
        .where(
            Conversation.id == conversation_id,
            ConversationMember.user_id == user_id,
        )
    )
    if lock:
        query = query.with_for_update(of=Conversation)
    conversation = (await db.execute(query)).scalar_one_or_none()
    if not conversation:
        raise HTTPException(404, "Conversation not found")
    if conversation.kind == "group" and not await db.get(
        GroupMember, (conversation.group_id, user_id)
    ):
        raise HTTPException(404, "Conversation not found")
    if conversation.kind == "game" and not await db.get(
        GameParticipant, (conversation.game_id, user_id)
    ):
        raise HTTPException(404, "Conversation not found")
    members = await active_member_ids(db, conversation)
    has_block = await db.scalar(
        select(UserBlock.blocker_id)
        .where(
            or_(
                and_(
                    UserBlock.blocker_id == user_id, UserBlock.blocked_id.in_(members)
                ),
                and_(
                    UserBlock.blocked_id == user_id, UserBlock.blocker_id.in_(members)
                ),
            )
        )
        .limit(1)
    )
    if has_block:
        raise HTTPException(404, "Conversation not found")
    if conversation.kind == "direct":
        first, second = conversation.direct_key.split(":")
        accepted = await db.scalar(
            select(Connection.id)
            .where(
                Connection.status == "accepted",
                or_(
                    and_(
                        Connection.requester_id == first,
                        Connection.receiver_id == second,
                    ),
                    and_(
                        Connection.requester_id == second,
                        Connection.receiver_id == first,
                    ),
                ),
            )
            .limit(1)
        )
        if not accepted:
            raise HTTPException(404, "Conversation not found")
    return conversation


def notify(
    db: AsyncSession,
    user_id: str,
    kind: str,
    title: str,
    href: str,
    *,
    actor: User,
    **payload,
) -> None:
    if user_id == actor.id:
        return
    db.add(
        Notification(
            user_id=user_id,
            kind=kind,
            payload={
                "title": title,
                "href": href,
                "actor_id": actor.id,
                **payload,
            },
        )
    )


async def emit(conversation_id: str, event: dict) -> None:
    try:
        await valkey.publish(f"conversation:{conversation_id}", json.dumps(event))
    except Exception:
        # Messages and notifications are already committed. Clients also refresh
        # their REST history, so a transient Pub/Sub outage cannot lose a message.
        logger.warning(
            "Conversation event delivery unavailable; REST refresh remains available"
        )


async def backfill_rooms(db: AsyncSession, user_id: str) -> None:
    connections = (
        (
            await db.execute(
                select(Connection).where(
                    Connection.status == "accepted",
                    or_(
                        Connection.requester_id == user_id,
                        Connection.receiver_id == user_id,
                    ),
                )
            )
        )
        .scalars()
        .all()
    )
    for connection in connections:
        await room(db, "direct", [connection.requester_id, connection.receiver_id])
    group_ids = (
        (
            await db.execute(
                select(GroupMember.group_id).where(GroupMember.user_id == user_id)
            )
        )
        .scalars()
        .all()
    )
    for group_id in group_ids:
        members = list(
            (
                await db.execute(
                    select(GroupMember.user_id).where(GroupMember.group_id == group_id)
                )
            ).scalars()
        )
        await room(db, "group", members, group_id=group_id)
    game_ids = (
        (
            await db.execute(
                select(GameParticipant.game_id).where(
                    GameParticipant.user_id == user_id
                )
            )
        )
        .scalars()
        .all()
    )
    for game_id in game_ids:
        members = list(
            (
                await db.execute(
                    select(GameParticipant.user_id).where(
                        GameParticipant.game_id == game_id
                    )
                )
            ).scalars()
        )
        await room(db, "game", members, game_id=game_id)


async def describe_room(
    db: AsyncSession, conversation: Conversation, user_id: str
) -> dict:
    ids = await active_member_ids(db, conversation)
    members = (
        (await db.execute(select(User).where(User.id.in_(ids)).order_by(User.name)))
        .scalars()
        .all()
    )
    own = await db.get(ConversationMember, (conversation.id, user_id))
    latest = (
        await db.execute(
            select(Message, User.name)
            .join(User, User.id == Message.sender_id)
            .where(
                Message.conversation_id == conversation.id,
            )
            .order_by(Message.id.desc())
            .limit(1)
        )
    ).first()
    unread = await db.scalar(
        select(func.count())
        .select_from(Message)
        .where(
            Message.conversation_id == conversation.id,
            Message.id > own.last_read_message_id,
            Message.sender_id != user_id,
        )
    )
    if conversation.kind == "direct":
        title = next(
            (member.name for member in members if member.id != user_id), "Player"
        )
    elif conversation.kind == "group":
        title = (await db.get(Group, conversation.group_id)).name
    else:
        title = (await db.get(Game, conversation.game_id)).title
    return {
        "id": conversation.id,
        "kind": conversation.kind,
        "title": title,
        "group_id": conversation.group_id,
        "game_id": conversation.game_id,
        "members": [{"id": member.id, "name": member.name} for member in members],
        "unread_count": unread,
        "created_at": conversation.created_at,
        "last_message": message_dict(latest[0], latest[1]) if latest else None,
    }


def message_dict(message: Message, name: str) -> dict:
    return {
        "id": message.id,
        "conversation_id": message.conversation_id,
        "sender_id": message.sender_id,
        "sender_name": name,
        "body": message.body,
        "client_id": message.client_id,
        "created_at": message.created_at,
    }
