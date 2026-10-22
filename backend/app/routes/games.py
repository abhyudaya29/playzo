from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import current_user, db_session
from app.models import (
    Conversation,
    Game,
    GameParticipant,
    Location,
    MembershipRequest,
    User,
    UserBlock,
    Sport,
)
from app.schemas import InvitationInput
from app.participation import add_to_game, available_game, invite, join_request
from app.social import allowed_pair, room
from app.schemas import GameInput, GameTransitionInput

from app.services.platform import record, require_player, validate_sports

router = APIRouter(prefix="/api/v1/games")


@router.get("")
async def games(
    user: User = Depends(current_user), db: AsyncSession = Depends(db_session),
    sport: str | None = None, nearby: bool = False,
    page: int = Query(1, ge=1), page_size: int = Query(100, ge=1, le=100),
) -> list[dict]:
    counts = select(GameParticipant.game_id, func.count().label("n")).group_by(GameParticipant.game_id).subquery()
    mine = select(GameParticipant).where(GameParticipant.user_id == user.id).subquery()
    query = (select(Game, counts.c.n, mine.c.user_id, MembershipRequest.status, Conversation.id)
        .join(User, User.id == Game.host_id).outerjoin(counts, counts.c.game_id == Game.id)
        .outerjoin(mine, mine.c.game_id == Game.id)
        .outerjoin(MembershipRequest, and_(MembershipRequest.game_id == Game.id, MembershipRequest.user_id == user.id))
        .outerjoin(Conversation, Conversation.game_id == Game.id)
        .where(or_(Game.starts_at >= datetime.now(timezone.utc), mine.c.user_id.is_not(None), Game.host_id == user.id), Game.status == "open", User.account_status == "active",
            Game.host_id.not_in(select(UserBlock.blocked_id).where(UserBlock.blocker_id == user.id)),
            Game.host_id.not_in(select(UserBlock.blocker_id).where(UserBlock.blocked_id == user.id))))
    if sport: query = query.where(Game.sport == sport)
    if nearby:
        loc = await db.get(Location, user.id)
        if not loc: return []
        query = query.where(Game.starts_at >= datetime.now(timezone.utc), Game.locality == loc.locality, Game.sport.in_(select(Sport.sport).where(Sport.user_id == user.id)))
    rows = (await db.execute(query.order_by(Game.starts_at, Game.id).offset((page-1)*page_size).limit(page_size))).all()
    return [{"id": game.id, "title": game.title, "sport": game.sport, "venue": game.venue,
        "locality": game.locality, "starts_at": game.starts_at, "capacity": game.capacity,
        "participant_count": count or 0, "is_joined": member is not None,
        "status": game.status, "approval_required": game.approval_required, "host_id": game.host_id,
        "request_status": status, "conversation_id": conversation if member else None}
        for game, count, member, status, conversation in rows]


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
    require_player(user)
    await validate_sports(db, [data.sport])
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
    record(db, user.id, "game_created", "game", game.id, sport=game.sport)
    return game


@router.post("/{id}/join")
async def join_game(
    id: str, user: User = Depends(current_user), db: AsyncSession = Depends(db_session)
):
    require_player(user)
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


@router.post("/{id}/transition")
async def transition_game(id: str, data: GameTransitionInput,
                          user=Depends(current_user), db=Depends(db_session)):
    game = await db.get(Game, id, with_for_update=True)
    if not game or game.host_id != user.id: raise HTTPException(404, "Game not found")
    if game.status != "open": raise HTTPException(409, "Game is already closed")
    if data.status == "completed" and game.starts_at > datetime.now(timezone.utc):
        raise HTTPException(409, "The game has not started yet")
    game.status = data.status
    record(db, user.id, "game_completed" if data.status == "completed" else "game_cancelled", "game", id, sport=game.sport)
    await db.commit()
    return {"status": game.status}
