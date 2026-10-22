from app.services.platform import record, require_player, settings
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, select

from app.models import (
    Game,
    GameInvitation,
    GameParticipant,
    Group,
    GroupMember,
    MembershipRequest,
    User,
)
from app.social import allowed_pair, notify, room


async def group_admin(db, group_id, user_id):
    membership = await db.get(GroupMember, (group_id, user_id))
    return bool(membership and membership.role in ("owner", "admin"))


async def join_request(db, resource, user):
    is_group = isinstance(resource, Group)
    owner_id = resource.owner_id if is_group else resource.host_id
    await allowed_pair(db, user.id, owner_id)
    column = MembershipRequest.group_id if is_group else MembershipRequest.game_id
    existing = await db.scalar(
        select(MembershipRequest).where(
            column == resource.id, MembershipRequest.user_id == user.id
        )
    )
    if existing:
        return existing
    entry = MembershipRequest(
        user_id=user.id, **{"group_id" if is_group else "game_id": resource.id}
    )
    db.add(entry)
    await db.flush()
    title = resource.name if is_group else resource.title
    notify(
        db,
        owner_id,
        "membership_request",
        f"{user.name} requested to join {title}.",
        "/requests",
        actor=user,
        request_id=entry.id,
    )
    return entry


async def available_game(db, game_id):
    game = await db.scalar(select(Game).where(Game.id == game_id).with_for_update())
    if not game:
        raise HTTPException(404, "Game not found")
    if game.status != "open" or game.starts_at <= datetime.now(timezone.utc):
        raise HTTPException(409, "This game is no longer open")
    count = await db.scalar(
        select(func.count())
        .select_from(GameParticipant)
        .where(GameParticipant.game_id == game_id)
    )
    if count >= game.capacity:
        raise HTTPException(409, "This game is full")
    return game


async def add_to_game(db, game, user_id):
    require_player(await db.get(User, user_id))
    if not await db.get(GameParticipant, (game.id, user_id)):
        db.add(GameParticipant(game_id=game.id, user_id=user_id))
        record(db, user_id, "game_joined", "game", game.id, sport=game.sport)
        await db.flush()
    ids = list(
        (
            await db.execute(
                select(GameParticipant.user_id).where(
                    GameParticipant.game_id == game.id
                )
            )
        ).scalars()
    )
    return await room(db, "game", ids, game_id=game.id)


async def invite(db, game, sender, receiver_id):
    if game.host_id != sender.id:
        raise HTTPException(403, "Only the host can invite players")
    if receiver_id == sender.id or not await db.get(User, receiver_id):
        raise HTTPException(422, "Choose another player")
    await allowed_pair(db, sender.id, receiver_id)
    if await db.get(GameParticipant, (game.id, receiver_id)):
        raise HTTPException(409, "This player has already joined")
    existing = await db.scalar(
        select(GameInvitation).where(
            GameInvitation.game_id == game.id, GameInvitation.receiver_id == receiver_id
        )
    )
    if existing:
        return existing
    invitation = GameInvitation(
        game_id=game.id, sender_id=sender.id, receiver_id=receiver_id
    )
    db.add(invitation)
    await db.flush()
    notify(
        db,
        receiver_id,
        "game_invitation",
        f"{sender.name} invited you to {game.title}.",
        "/requests",
        actor=sender,
        invitation_id=invitation.id,
        game_id=game.id,
    )
    return invitation


async def respond_membership(db, request_id, kind, decision, user):
    entry = await db.scalar(
        select(MembershipRequest)
        .where(MembershipRequest.id == request_id)
        .with_for_update()
    )
    if not entry or (kind == "group") != bool(entry.group_id):
        raise HTTPException(404, "Request not found")
    resource = await db.get(
        Group if kind == "group" else Game, entry.group_id or entry.game_id, with_for_update=True
    )
    authorized = (
        await group_admin(db, resource.id, user.id)
        if kind == "group"
        else resource.host_id == user.id
    )
    if not authorized:
        raise HTTPException(404, "Request not found")
    await allowed_pair(db, entry.user_id, user.id)
    if entry.status not in ("pending", decision):
        raise HTTPException(409, "This request has already been closed")
    changed = entry.status == "pending"
    conversation = None
    if decision == "accepted":
        if kind == "group":
            if not await db.get(GroupMember, (resource.id, entry.user_id)):
                require_player(await db.get(User, entry.user_id))
                count = await db.scalar(select(func.count()).select_from(GroupMember).where(GroupMember.group_id == resource.id))
                if count >= resource.capacity:
                    raise HTTPException(409, "This group is full")
                db.add(GroupMember(group_id=resource.id, user_id=entry.user_id))
                record(db, entry.user_id, "group_joined", "group", resource.id, sport=resource.sport)
                await db.flush()
            ids = list(
                (
                    await db.execute(
                        select(GroupMember.user_id).where(
                            GroupMember.group_id == resource.id
                        )
                    )
                ).scalars()
            )
            conversation = await room(db, "group", ids, group_id=resource.id)
        else:
            if not await db.get(GameParticipant, (resource.id, entry.user_id)):
                await available_game(db, resource.id)
            conversation = await add_to_game(db, resource, entry.user_id)
    entry.status = decision
    if changed:
        title = resource.name if kind == "group" else resource.title
        notify(
            db,
            entry.user_id,
            f"membership_{decision}",
            f"Your request to join {title} was {decision}.",
            (
                f"/messages?conversation={conversation.id}"
                if conversation
                else "/requests"
            ),
            actor=user,
        )
    await db.commit()
    return {
        "status": decision,
        "conversation_id": conversation.id if conversation else None,
    }


async def respond_invitation(db, invitation_id, decision, user):
    invitation = await db.scalar(
        select(GameInvitation)
        .where(GameInvitation.id == invitation_id)
        .with_for_update()
    )
    if not invitation or invitation.receiver_id != user.id:
        raise HTTPException(404, "Invitation not found")
    await allowed_pair(db, invitation.sender_id, user.id)
    if invitation.status not in ("pending", decision):
        raise HTTPException(409, "This invitation has already been closed")
    changed = invitation.status == "pending"
    game = await db.get(Game, invitation.game_id)
    conversation = None
    if decision == "accepted":
        if not await db.get(GameParticipant, (game.id, user.id)):
            await available_game(db, game.id)
        conversation = await add_to_game(db, game, user.id)
    invitation.status = decision
    if changed:
        notify(
            db,
            invitation.sender_id,
            f"invitation_{decision}",
            f"{user.name} {decision} your invitation to {game.title}.",
            (
                f"/messages?conversation={conversation.id}"
                if conversation
                else "/requests"
            ),
            actor=user,
        )
    await db.commit()
    return {
        "status": decision,
        "conversation_id": conversation.id if conversation else None,
    }
