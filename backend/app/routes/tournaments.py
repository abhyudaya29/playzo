from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from app.dependencies import current_user, db_session
from app.models import OrganizerProfile, Tournament, TournamentRegistration, User, UserBlock
from app.schemas import OrganizerInput, TournamentInput, TournamentTransition
from app.services.platform import MODERATORS, audit, record, require_player, settings, validate_sports

router = APIRouter(prefix="/api/v1")
PUBLIC_STATES = {"published", "registration_open", "registration_closed", "in_progress", "completed"}
TRANSITIONS = {
    "draft": {"pending_approval", "cancelled"},
    "pending_approval": {"published", "draft", "cancelled"},
    "published": {"registration_open", "cancelled"},
    "registration_open": {"registration_closed", "cancelled"},
    "registration_closed": {"in_progress", "cancelled"},
    "in_progress": {"completed", "cancelled"},
    "completed": set(), "cancelled": set(),
}


def tournament_dict(row, count=0, registered=False):
    return {key: getattr(row, key) for key in ("id", "host_id", "title", "sport", "city", "venue",
        "starts_at", "ends_at", "capacity", "rules", "status", "created_at")} | {
            "participant_count": count, "is_registered": registered}


@router.get("/organizers/me")
async def organizer(user=Depends(current_user), db=Depends(db_session)):
    row = await db.get(OrganizerProfile, user.id)
    return {"status": row.status if row else "not_applied", "organization": row.organization if row else "",
            "experience": row.experience if row else ""}


@router.post("/organizers/me")
async def apply(data: OrganizerInput, user=Depends(current_user), db=Depends(db_session)):
    require_player(user)
    row = await db.get(OrganizerProfile, user.id, with_for_update=True)
    if row and row.status not in {"rejected"}:
        raise HTTPException(409, "An organizer application already exists")
    if row:
        row.organization, row.experience = data.organization, data.experience
        row.status, row.submitted_at = "pending", datetime.now(timezone.utc)
        row.reviewed_by, row.reviewed_at = None, None
    else:
        db.add(OrganizerProfile(user_id=user.id, **data.model_dump()))
    await db.commit()
    return {"status": "pending"}


@router.get("/tournaments")
@router.get("/discovery/tournaments")
async def tournaments(sport: str | None = None, city: str | None = None,
    page: int = Query(1, ge=1), page_size: int = Query(24, ge=1, le=100),
    user=Depends(current_user), db=Depends(db_session)):
    if not (await settings(db))["feature_flags"].get("tournaments", True):
        return {"items": [], "page": page, "page_size": page_size}
    counts = select(TournamentRegistration.tournament_id, func.count().label("count")).group_by(TournamentRegistration.tournament_id).subquery()
    joined = select(TournamentRegistration.tournament_id).where(TournamentRegistration.user_id == user.id)
    query = (select(Tournament, func.coalesce(counts.c.count, 0), Tournament.id.in_(joined))
        .outerjoin(counts, counts.c.tournament_id == Tournament.id).join(User, User.id == Tournament.host_id)
        .where(or_(Tournament.status.in_(PUBLIC_STATES), Tournament.host_id == user.id), User.account_status == "active",
            Tournament.host_id.not_in(select(UserBlock.blocked_id).where(UserBlock.blocker_id == user.id)),
            Tournament.host_id.not_in(select(UserBlock.blocker_id).where(UserBlock.blocked_id == user.id))))
    if sport: query = query.where(Tournament.sport == sport)
    if city: query = query.where(Tournament.city.ilike(city))
    rows = (await db.execute(query.order_by(Tournament.starts_at, Tournament.id).offset((page - 1) * page_size).limit(page_size))).all()
    return {"items": [tournament_dict(row, count, registered) for row, count, registered in rows], "page": page, "page_size": page_size}


@router.post("/tournaments")
async def create(data: TournamentInput, user=Depends(current_user), db=Depends(db_session)):
    require_player(user)
    if not (await settings(db))["feature_flags"].get("tournaments", True):
        raise HTTPException(403, "Tournaments are currently unavailable")
    await validate_sports(db, [data.sport])
    row = Tournament(host_id=user.id, **data.model_dump())
    db.add(row)
    await db.flush()
    record(db, user.id, "tournament_created", "tournament", row.id, sport=row.sport)
    await db.commit()
    return tournament_dict(row)


@router.patch("/tournaments/{id}")
async def edit(id: str, data: TournamentInput, user=Depends(current_user), db=Depends(db_session)):
    row = await db.get(Tournament, id, with_for_update=True)
    if not row or row.host_id != user.id:
        raise HTTPException(404, "Tournament not found")
    if row.status != "draft":
        raise HTTPException(409, "Only drafts can be edited")
    await validate_sports(db, [data.sport])
    for key, value in data.model_dump().items(): setattr(row, key, value)
    await db.commit()
    return tournament_dict(row)


async def transition_tournament(db, row, data, actor):
    if data.status not in TRANSITIONS[row.status]:
        raise HTTPException(409, f"Cannot change {row.status} to {data.status}")
    staff = actor.role in MODERATORS
    if row.host_id != actor.id and not staff:
        raise HTTPException(403, "Only the host or a moderator may manage this tournament")
    if row.status == "pending_approval" and data.status in {"published", "draft"} and not staff:
        raise HTTPException(403, "A moderator must review this tournament")
    if data.status in {"pending_approval", "published", "registration_open"}:
        organizer = await db.get(OrganizerProfile, row.host_id)
        host = await db.get(User, row.host_id)
        if not organizer or organizer.status != "verified" or not host or host.account_status != "active":
            raise HTTPException(403, "A verified, active organizer is required")
        if row.starts_at <= datetime.now(timezone.utc):
            raise HTTPException(409, "Tournament start date has passed")
    if data.status == "in_progress" and row.starts_at > datetime.now(timezone.utc):
        raise HTTPException(409, "The tournament has not started yet")
    before = row.status
    row.status = data.status
    if staff:
        audit(db, actor, "TOURNAMENT_STATUS_CHANGED", "tournament", row.id, data.reason, before=before, after=data.status)
    if data.status in {"pending_approval", "completed"}:
        record(db, actor.id, "tournament_submitted" if data.status == "pending_approval" else "tournament_completed", "tournament", row.id)


@router.post("/tournaments/{id}/transition")
async def transition(id: str, data: TournamentTransition, user=Depends(current_user), db=Depends(db_session)):
    row = await db.get(Tournament, id, with_for_update=True)
    if not row: raise HTTPException(404, "Tournament not found")
    await transition_tournament(db, row, data, user)
    await db.commit()
    return tournament_dict(row)


@router.post("/tournaments/{id}/register")
async def register(id: str, user=Depends(current_user), db=Depends(db_session)):
    require_player(user)
    row = await db.get(Tournament, id, with_for_update=True)
    if not row: raise HTTPException(404, "Tournament not found")
    from app.social import allowed_pair
    await allowed_pair(db, user.id, row.host_id)
    organizer = await db.get(OrganizerProfile, row.host_id)
    if not organizer or organizer.status != "verified": raise HTTPException(403, "Organizer is unavailable")
    if row.status != "registration_open" or row.starts_at <= datetime.now(timezone.utc):
        raise HTTPException(409, "Registration is closed")
    if await db.get(TournamentRegistration, (id, user.id)):
        return {"registered": True}
    count = await db.scalar(select(func.count()).select_from(TournamentRegistration).where(TournamentRegistration.tournament_id == id))
    if count >= row.capacity: raise HTTPException(409, "Tournament is full")
    db.add(TournamentRegistration(tournament_id=id, user_id=user.id))
    record(db, user.id, "tournament_registered", "tournament", id, sport=row.sport)
    await db.commit()
    return {"registered": True}


@router.delete("/tournaments/{id}/register")
async def cancel_registration(id: str, user=Depends(current_user), db=Depends(db_session)):
    row = await db.get(Tournament, id, with_for_update=True)
    if not row or row.status not in {"published", "registration_open", "registration_closed", "cancelled"}:
        raise HTTPException(409, "Registration cannot be cancelled now")
    entry = await db.get(TournamentRegistration, (id, user.id))
    if entry:
        await db.delete(entry)
        record(db, user.id, "tournament_registration_cancelled", "tournament", id)
    await db.commit()
    return {"registered": False}


@router.get("/tournaments/{id}/participants")
async def participants(id: str, page: int = Query(1, ge=1), user=Depends(current_user), db=Depends(db_session)):
    row = await db.get(Tournament, id)
    if not row or (row.host_id != user.id and user.role not in MODERATORS):
        raise HTTPException(404, "Tournament not found")
    from app.services.platform import person
    people = (await db.execute(select(User).join(TournamentRegistration).where(TournamentRegistration.tournament_id == id).order_by(User.name, User.id).offset((page-1)*50).limit(50))).scalars()
    return {"items": [person(p) for p in people], "page": page}
