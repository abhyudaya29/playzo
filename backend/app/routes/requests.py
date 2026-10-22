from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import current_user, db_session
from app.models import (
    Conversation,
    Game,
    GameInvitation,
    GroupInvitation,
    Group,
    GroupMember,
    MembershipRequest,
    User,
)
from app.social import blocked
from app.participation import respond_invitation, respond_membership
from app.routes.connections import list_connections, respond

from app.services.platform import person as public_person

router = APIRouter(prefix="/api/v1/requests")


async def all_requests(user, db):
    result = await list_connections(user, db)
    admin_groups = select(GroupMember.group_id).where(
        GroupMember.user_id == user.id, GroupMember.role.in_(["owner", "admin"])
    )
    hosted_games = select(Game.id).where(Game.host_id == user.id)
    rows = (
        (
            await db.execute(
                select(MembershipRequest)
                .where(
                    or_(
                        MembershipRequest.user_id == user.id,
                        MembershipRequest.group_id.in_(admin_groups),
                        MembershipRequest.game_id.in_(hosted_games),
                    )
                )
                .order_by(MembershipRequest.created_at.desc())
                .limit(200)
            )
        )
        .scalars()
        .all()
    )
    for entry in rows:
        kind = "group" if entry.group_id else "game"
        resource = await db.get(
            Group if kind == "group" else Game, entry.group_id or entry.game_id
        )
        outgoing = entry.user_id == user.id
        person = await db.get(
            User,
            (
                (resource.owner_id if kind == "group" else resource.host_id)
                if outgoing
                else entry.user_id
            ),
        )
        conversation_id = (
            await db.scalar(
                select(Conversation.id).where(
                    (
                        (Conversation.group_id == resource.id)
                        if kind == "group"
                        else (Conversation.game_id == resource.id)
                    ),
                )
            )
            if entry.status == "accepted"
            else None
        )
        result.append(
            {
                "id": entry.id,
                "kind": kind,
                "status": entry.status,
                "direction": "outgoing" if outgoing else "incoming",
                "person": public_person(person),
                "title": resource.name if kind == "group" else resource.title,
                "sport": resource.sport,
                "created_at": entry.created_at,
                "conversation_id": conversation_id,
                "resource_id": resource.id,
                "can_respond": not outgoing and entry.status == "pending",
            }
        )
    invitations = (
        (
            await db.execute(
                select(GameInvitation)
                .where(
                    or_(
                        GameInvitation.sender_id == user.id,
                        GameInvitation.receiver_id == user.id,
                    )
                )
                .order_by(GameInvitation.created_at.desc())
                .limit(200)
            )
        )
        .scalars()
        .all()
    )
    for invitation in invitations:
        game = await db.get(Game, invitation.game_id)
        outgoing = invitation.sender_id == user.id
        person = await db.get(
            User, invitation.receiver_id if outgoing else invitation.sender_id
        )
        conversation_id = (
            await db.scalar(
                select(Conversation.id).where(Conversation.game_id == game.id)
            )
            if invitation.status == "accepted"
            else None
        )
        result.append(
            {
                "id": invitation.id,
                "kind": "invitation",
                "status": invitation.status,
                "direction": "outgoing" if outgoing else "incoming",
                "person": public_person(person),
                "title": game.title,
                "sport": game.sport,
                "created_at": invitation.created_at,
                "conversation_id": conversation_id,
                "resource_id": game.id,
                "can_respond": not outgoing and invitation.status == "pending",
                "venue": game.venue,
                "starts_at": game.starts_at,
            }
        )
    group_invites = (await db.execute(select(GroupInvitation).where(or_(GroupInvitation.sender_id == user.id,
        GroupInvitation.receiver_id == user.id)).order_by(GroupInvitation.created_at.desc()).limit(200))).scalars()
    for entry in group_invites:
        group = await db.get(Group, entry.group_id)
        outgoing = entry.sender_id == user.id
        person = await db.get(User, entry.receiver_id if outgoing else entry.sender_id)
        conversation_id = await db.scalar(select(Conversation.id).where(Conversation.group_id == group.id)) if entry.status == "accepted" else None
        result.append({"id": entry.id, "kind": "group_invitation", "status": entry.status,
            "direction": "outgoing" if outgoing else "incoming", "person": public_person(person), "title": group.name,
            "sport": group.sport, "created_at": entry.created_at, "conversation_id": conversation_id,
            "resource_id": group.id, "can_respond": not outgoing and entry.status == "pending"})
    visible = []
    for item in result:
        if not await blocked(db, user.id, item["person"]["id"]):
            visible.append(item)
    return sorted(visible, key=lambda item: item["created_at"], reverse=True)


@router.get("")
async def requests(
    user: User = Depends(current_user), db: AsyncSession = Depends(db_session)
):
    return await all_requests(user, db)


@router.patch("/{kind}/{id}/{action}")
async def respond_request(
    kind: str,
    id: str,
    action: str,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(db_session),
):
    if action not in ("accept", "decline"):
        raise HTTPException(422, "Choose accept or decline")
    decision = "accepted" if action == "accept" else "declined"
    if kind == "group_invitation":
        from app.routes.group_management import respond_group_invitation
        return await respond_group_invitation(db, id, decision, user)
    if kind == "connection":
        return await respond(id, decision, user, db)
    if kind in ("group", "game"):
        return await respond_membership(db, id, kind, decision, user)
    if kind == "invitation":
        return await respond_invitation(db, id, decision, user)
    raise HTTPException(404, "Request not found")
