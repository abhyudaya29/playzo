from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import current_user, db_session
from app.models import (
    Conversation,
    Group,
    GroupMember,
    Location,
    MembershipRequest,
    User,
    UserBlock,
    Sport,
)
from app.participation import join_request
from app.social import room
from app.schemas import GroupInput

from app.services.platform import record, require_player, settings, validate_sports

router = APIRouter(prefix="/api/v1/groups")


@router.get("")
async def groups(
    user: User = Depends(current_user), db: AsyncSession = Depends(db_session),
    sport: str | None = None, nearby: bool = False,
    page: int = Query(1, ge=1), page_size: int = Query(100, ge=1, le=100),
) -> list[dict]:
    counts = select(GroupMember.group_id, func.count().label("n")).group_by(GroupMember.group_id).subquery()
    mine = select(GroupMember).where(GroupMember.user_id == user.id).subquery()
    query = (select(Group, counts.c.n, mine.c.role, MembershipRequest.status, Conversation.id)
        .join(User, User.id == Group.owner_id).outerjoin(counts, counts.c.group_id == Group.id)
        .outerjoin(mine, mine.c.group_id == Group.id)
        .outerjoin(MembershipRequest, and_(MembershipRequest.group_id == Group.id, MembershipRequest.user_id == user.id))
        .outerjoin(Conversation, Conversation.group_id == Group.id)
        .where(User.account_status == "active", or_(Group.visibility == "public", mine.c.user_id.is_not(None)),
            Group.owner_id.not_in(select(UserBlock.blocked_id).where(UserBlock.blocker_id == user.id)),
            Group.owner_id.not_in(select(UserBlock.blocker_id).where(UserBlock.blocked_id == user.id))))
    if sport: query = query.where(Group.sport == sport)
    if nearby:
        loc = await db.get(Location, user.id)
        if not loc: return []
        query = query.where(Group.locality == loc.locality, Group.sport.in_(select(Sport.sport).where(Sport.user_id == user.id)))
    rows = (await db.execute(query.order_by(Group.name, Group.id).offset((page-1)*page_size).limit(page_size))).all()
    return [{"id": group.id, "name": group.name, "description": group.description, "sport": group.sport,
        "locality": group.locality, "owner_id": group.owner_id, "member_count": count or 0,
        "is_member": role is not None, "my_role": role, "request_status": status,
        "visibility": group.visibility, "capacity": group.capacity,
        "conversation_id": conversation if role else None} for group, count, role, status, conversation in rows]


@router.post("")
async def create_group(
    data: GroupInput,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(db_session),
) -> dict:
    require_player(user)
    await validate_sports(db, [data.sport])
    loc = await db.get(Location, user.id)
    group = Group(
        owner_id=user.id,
        name=data.name,
        description=data.description,
        visibility=data.visibility,
        capacity=data.capacity or (await settings(db))["group_capacity"],
        sport=data.sport,
        locality=loc.locality if loc else "",
    )
    db.add(group)
    await db.flush()
    db.add(GroupMember(group_id=group.id, user_id=user.id, role="owner"))
    conversation = await room(db, "group", [user.id], group_id=group.id)
    record(db, user.id, "group_created", "group", group.id, sport=group.sport)
    await db.commit()
    return {"id": group.id, "conversation_id": conversation.id}


@router.post("/{id}/join")
async def join_group(
    id: str, user: User = Depends(current_user), db: AsyncSession = Depends(db_session)
):
    require_player(user)
    group = await db.scalar(select(Group).where(Group.id == id).with_for_update())
    if not group:
        raise HTTPException(404, "Group not found")
    if group.visibility == "private":
        raise HTTPException(403, "This group requires an invitation")
    if await db.get(GroupMember, (id, user.id)):
        raise HTTPException(409, "Already joined")
    entry = await join_request(db, group, user)
    record(db, user.id, "group_membership_requested", "group", group.id, sport=group.sport)
    await db.commit()
    return {"request_id": entry.id, "status": entry.status}
