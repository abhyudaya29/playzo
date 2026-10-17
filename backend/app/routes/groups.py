from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import current_user, db_session
from app.models import (
    Conversation,
    Group,
    GroupMember,
    Location,
    MembershipRequest,
    User,
)
from app.participation import join_request
from app.social import room
from app.schemas import GroupInput

router = APIRouter(prefix="/api/v1/groups")


@router.get("")
async def groups(
    user: User = Depends(current_user),
    db: AsyncSession = Depends(db_session),
) -> list[dict]:
    rows = (
        (await db.execute(select(Group).order_by(Group.name).limit(100)))
        .scalars()
        .all()
    )
    result = []
    for group in rows:
        members = (
            (
                await db.execute(
                    select(GroupMember).where(GroupMember.group_id == group.id)
                )
            )
            .scalars()
            .all()
        )
        result.append(
            {
                "id": group.id,
                "name": group.name,
                "description": group.description,
                "sport": group.sport,
                "locality": group.locality,
                "owner_id": group.owner_id,
                "member_count": len(members),
                "is_member": any(member.user_id == user.id for member in members),
                "request_status": await db.scalar(
                    select(MembershipRequest.status).where(
                        MembershipRequest.group_id == group.id,
                        MembershipRequest.user_id == user.id,
                    )
                ),
                "conversation_id": (
                    await db.scalar(
                        select(Conversation.id).where(Conversation.group_id == group.id)
                    )
                    if any(member.user_id == user.id for member in members)
                    else None
                ),
            }
        )
    return result


@router.post("")
async def create_group(
    data: GroupInput,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(db_session),
) -> dict:
    loc = await db.get(Location, user.id)
    group = Group(
        owner_id=user.id,
        name=data.name,
        description=data.description,
        sport=data.sport,
        locality=loc.locality if loc else "",
    )
    db.add(group)
    await db.flush()
    db.add(GroupMember(group_id=group.id, user_id=user.id, role="owner"))
    conversation = await room(db, "group", [user.id], group_id=group.id)
    await db.commit()
    return {"id": group.id, "conversation_id": conversation.id}


@router.post("/{id}/join")
async def join_group(
    id: str, user: User = Depends(current_user), db: AsyncSession = Depends(db_session)
):
    group = await db.scalar(select(Group).where(Group.id == id).with_for_update())
    if not group:
        raise HTTPException(404, "Group not found")
    if await db.get(GroupMember, (id, user.id)):
        raise HTTPException(409, "Already joined")
    entry = await join_request(db, group, user)
    await db.commit()
    return {"request_id": entry.id, "status": entry.status}
