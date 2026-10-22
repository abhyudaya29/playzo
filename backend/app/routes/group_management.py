from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, delete, func, or_, select
from app.dependencies import current_user, db_session
from app.models import Connection, Conversation, Group, GroupInvitation, GroupMember, MembershipRequest, User
from app.schemas import GroupRoleInput, GroupSettingsInput, InvitationInput
from app.services.platform import person, record, require_player
from app.participation import group_admin
from app.social import allowed_pair, notify, room

router = APIRouter(prefix="/api/v1/groups")


@router.get("/{id}/members")
async def members(id: str, user=Depends(current_user), db=Depends(db_session)):
    if not await db.get(GroupMember, (id, user.id)):
        raise HTTPException(404, "Group not found")
    rows = (await db.execute(select(User, GroupMember.role).join(GroupMember).where(GroupMember.group_id == id).order_by(User.name).limit(1000))).all()
    return [{**person(p), "role": role} for p, role in rows]


@router.patch("/{id}/settings")
async def update(id: str, data: GroupSettingsInput, user=Depends(current_user), db=Depends(db_session)):
    group = await db.get(Group, id, with_for_update=True)
    if not group or group.owner_id != user.id:
        raise HTTPException(404, "Group not found")
    count = await db.scalar(select(func.count()).select_from(GroupMember).where(GroupMember.group_id == id))
    if data.capacity < count: raise HTTPException(409, "Capacity is smaller than current membership")
    group.visibility, group.capacity = data.visibility, data.capacity
    await db.commit()
    return {"success": True}


@router.patch("/{id}/members/{member_id}")
async def role(id: str, member_id: str, data: GroupRoleInput, user=Depends(current_user), db=Depends(db_session)):
    group = await db.get(Group, id, with_for_update=True)
    if not group or group.owner_id != user.id: raise HTTPException(404, "Group not found")
    if member_id == group.owner_id: raise HTTPException(422, "The owner role cannot be changed here")
    member = await db.get(GroupMember, (id, member_id))
    if not member: raise HTTPException(404, "Member not found")
    member.role = data.role
    await db.commit()
    return {"role": member.role}


@router.delete("/{id}/members/me")
async def leave(id: str, user=Depends(current_user), db=Depends(db_session)):
    group = await db.get(Group, id, with_for_update=True)
    if not group: raise HTTPException(404, "Group not found")
    if group.owner_id == user.id: raise HTTPException(409, "Group owners cannot leave their own group")
    member = await db.get(GroupMember, (id, user.id))
    if member:
        await db.delete(member)
        # Leaving must allow a later request/invitation instead of retaining an
        # accepted request that would make rejoining impossible.
        await db.execute(delete(MembershipRequest).where(MembershipRequest.group_id == id, MembershipRequest.user_id == user.id))
        await db.execute(delete(GroupInvitation).where(GroupInvitation.group_id == id, GroupInvitation.receiver_id == user.id))
        record(db, user.id, "group_left", "group", id)
    await db.commit()
    return {"success": True}


@router.post("/{id}/invitations")
async def invite(id: str, data: InvitationInput, user=Depends(current_user), db=Depends(db_session)):
    group = await db.get(Group, id, with_for_update=True)
    if not group or not await group_admin(db, id, user.id): raise HTTPException(404, "Group not found")
    receiver = await db.get(User, data.receiver_id)
    if not receiver: raise HTTPException(404, "Player not found")
    require_player(receiver)
    await allowed_pair(db, user.id, data.receiver_id)
    connected = await db.scalar(select(Connection.id).where(Connection.status == "accepted", or_(
        and_(Connection.requester_id == user.id, Connection.receiver_id == data.receiver_id),
        and_(Connection.receiver_id == user.id, Connection.requester_id == data.receiver_id))))
    if not connected: raise HTTPException(403, "Invite an accepted connection")
    if await db.get(GroupMember, (id, data.receiver_id)): raise HTTPException(409, "Player is already a member")
    old = await db.scalar(select(GroupInvitation).where(GroupInvitation.group_id == id, GroupInvitation.receiver_id == data.receiver_id))
    if old: raise HTTPException(409, "An invitation already exists")
    invitation = GroupInvitation(group_id=id, sender_id=user.id, receiver_id=data.receiver_id)
    db.add(invitation)
    await db.flush()
    notify(db, receiver.id, "group_invitation", f"{user.name} invited you to {group.name}.", "/requests", actor=user)
    await db.commit()
    return {"id": invitation.id, "status": invitation.status}


async def respond_group_invitation(db, id, decision, user):
    invitation = await db.get(GroupInvitation, id, with_for_update=True)
    if not invitation or invitation.receiver_id != user.id: raise HTTPException(404, "Invitation not found")
    if invitation.status not in {"pending", decision}: raise HTTPException(409, "Invitation is already closed")
    group = await db.get(Group, invitation.group_id, with_for_update=True)
    await allowed_pair(db, user.id, group.owner_id)
    await allowed_pair(db, user.id, invitation.sender_id)
    if not await group_admin(db, group.id, invitation.sender_id): raise HTTPException(409, "Inviter is no longer a group organizer")
    conversation = None
    if decision == "accepted":
        require_player(user)
        member = await db.get(GroupMember, (group.id, user.id))
        if not member:
            count = await db.scalar(select(func.count()).select_from(GroupMember).where(GroupMember.group_id == group.id))
            if count >= group.capacity: raise HTTPException(409, "Group is full")
            db.add(GroupMember(group_id=group.id, user_id=user.id))
            record(db, user.id, "group_joined", "group", group.id, sport=group.sport)
            await db.flush()
        ids = list((await db.execute(select(GroupMember.user_id).where(GroupMember.group_id == group.id))).scalars())
        conversation = await room(db, "group", ids, group_id=group.id)
    invitation.status = decision
    await db.commit()
    return {"status": decision, "conversation_id": conversation.id if conversation else None}
