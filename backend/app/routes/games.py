from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import current_user, db_session
from app.models import (
    Conversation,
    Game,
    GameParticipant,
    Location,
    MembershipRequest,
    User,
)
from app.schemas import InvitationInput
from app.participation import add_to_game, available_game, invite, join_request
from app.social import allowed_pair, room
from app.schemas import GameInput

router = APIRouter(prefix="/api/v1/games")


@router.get("")
async def games(
    user: User = Depends(current_user),
    db: AsyncSession = Depends(db_session),
) -> list[dict]:
    rows = (
        (
            await db.execute(
                select(Game)
                .where(Game.starts_at >= datetime.now(timezone.utc))
                .order_by(Game.starts_at)
                .limit(100)
            )
        )
        .scalars()
        .all()
    )
    result = []
    for game in rows:
        participants = (
            (
                await db.execute(
                    select(GameParticipant).where(GameParticipant.game_id == game.id)
                )
            )
            .scalars()
            .all()
        )
        result.append(
            {
                "id": game.id,
                "title": game.title,
                "sport": game.sport,
                "venue": game.venue,
                "locality": game.locality,
                "starts_at": game.starts_at,
                "capacity": game.capacity,
                "participant_count": len(participants),
                "is_joined": any(
                    participant.user_id == user.id for participant in participants
                ),
                "status": game.status,
                "approval_required": game.approval_required,
                "host_id": game.host_id,
                "request_status": await db.scalar(
                    select(MembershipRequest.status).where(
                        MembershipRequest.game_id == game.id,
                        MembershipRequest.user_id == user.id,
                    )
                ),
                "conversation_id": (
                    await db.scalar(
                        select(Conversation.id).where(Conversation.game_id == game.id)
                    )
                    if any(
                        participant.user_id == user.id for participant in participants
                    )
                    else None
                ),
            }
        )
    return result


@router.post("")
async def create_game(
    data: GameInput,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(db_session),
) -> dict:
    game = await create_game_record(data, user, db)
    await db.commit()
    return {"id": game.id}


async def create_game_record(data, user, db):
    if data.starts_at.tzinfo is None or data.starts_at <= datetime.now(timezone.utc):
        raise HTTPException(422, "Start time must be in the future with a timezone")

    loc = await db.get(Location, user.id)
    game = Game(
        host_id=user.id,
        title=data.title,
        sport=data.sport,
        venue=data.venue,
        locality=loc.locality if loc else "",
        starts_at=data.starts_at,
        capacity=data.capacity,
        approval_required=data.approval_required,
    )
    db.add(game)
    await db.flush()
    db.add(GameParticipant(game_id=game.id, user_id=user.id))
    await room(db, "game", [user.id], game_id=game.id)
    return game


@router.post("/{id}/join")
async def join_game(
    id: str, user: User = Depends(current_user), db: AsyncSession = Depends(db_session)
):
    if await db.get(GameParticipant, (id, user.id)):
        raise HTTPException(409, "Already joined")
    game = await available_game(db, id)
    await allowed_pair(db, user.id, game.host_id)
    if game.approval_required:
        entry = await join_request(db, game, user)
        await db.commit()
        return {"status": entry.status, "request_id": entry.id}
    conversation = await add_to_game(db, game, user.id)
    await db.commit()
    return {"joined": True, "conversation_id": conversation.id}


@router.post("/{id}/invitations")
async def invite_player(
    id: str,
    data: InvitationInput,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(db_session),
):
    game = await available_game(db, id)
    invitation = await invite(db, game, user, data.receiver_id)
    await db.commit()
    return {"id": invitation.id, "status": invitation.status}
