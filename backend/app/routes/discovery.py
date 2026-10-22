from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import current_user, db_session
from app.models import Connection, Location, Sport, User, UserBlock
from app.services.matching import compatible, match_score
from app.services.platform import person, require_player, settings

router = APIRouter(prefix="/api/v1")


async def candidates(db, user, sport, radius_km, skill_level, recommendations, page, page_size, sort):
    require_player(user)
    if skill_level not in ("all", "hobby", "beginner", "intermediate", "advanced", "pro"):
        raise HTTPException(422, "Invalid skill level")
    config = await settings(db)
    if radius_km > config["maximum_radius_km"]:
        raise HTTPException(422, "Discovery radius exceeds the platform limit")
    mine = await db.get(Location, user.id)
    if not mine or mine.discovery_point is None:
        return []
    origin = func.ST_SetSRID(func.ST_MakePoint(mine.longitude, mine.latitude), 4326)
    distance_km = func.ST_Distance(Location.discovery_point, origin, True) / 1000
    pair = or_(and_(Connection.requester_id == user.id, Connection.receiver_id == User.id),
               and_(Connection.receiver_id == user.id, Connection.requester_id == User.id))
    query = (select(User, Sport, Location, distance_km.label("distance_km"), Connection)
        .join(Sport, Sport.user_id == User.id).join(Location, Location.user_id == User.id)
        .outerjoin(Connection, pair)
        .where(User.id != user.id, User.account_status == "active",
            User.discovery_visible.is_(True), User.onboarding_completed.is_(True), Sport.sport == sport,
            User.id.not_in(select(UserBlock.blocked_id).where(UserBlock.blocker_id == user.id)),
            User.id.not_in(select(UserBlock.blocker_id).where(UserBlock.blocked_id == user.id)),
            Location.discovery_point.is_not(None),
            func.ST_DWithin(Location.discovery_point, origin, radius_km * 1000),
            func.ST_DWithin(Location.discovery_point, origin, User.search_radius_km * 1000)))
    # Apply mutual preferences in SQL before pagination and scoring. Hidden
    # gender is never used to satisfy a gender-specific preference.
    if user.teammate_preference in {"women", "men"}:
        query = query.where(User.gender_visibility == "public",
                            User.gender == ("woman" if user.teammate_preference == "women" else "man"))
    accepted_prefs = ["no_preference", "mixed"]
    if user.gender_visibility == "public":
        if user.gender == "woman": accepted_prefs.append("women")
        if user.gender == "man": accepted_prefs.append("men")
    query = query.where(User.teammate_preference.in_(accepted_prefs))
    if recommendations:
        query = query.where(Connection.id.is_(None))
    if skill_level != "all":
        query = query.where(Sport.skill_level == skill_level)
    own_sport = await db.get(Sport, (user.id, sport))
    if not own_sport:
        return []
    # Score within a bounded local candidate window; never load the full user table.
    rows = (await db.execute(query.order_by(distance_km, User.id).limit(1000))).all()
    output = []
    for other, sport_row, loc, distance, conn in rows:
        if not compatible(user, other):
            continue
        score, shared, explanation = match_score(user, other, own_sport.skill_level,
            sport_row.skill_level, float(distance), radius_km, config["matching_weights"])
        output.append({**person(other), "bio": other.bio, "locality": loc.locality,
            "distance_km": round(float(distance), 1), "sport": sport_row.sport,
            "skill_level": sport_row.skill_level, "match_score": score,
            "shared_availability": shared, "explanation": explanation,
            "connection_status": conn.status if conn else None,
            "connection_direction": ("outgoing" if conn.requester_id == user.id else "incoming") if conn else None})
    if sort == "score":
        output.sort(key=lambda row: (-row["match_score"], row["distance_km"], row["id"]))
    start = (page - 1) * page_size
    return output[start:start + page_size]


@router.get("/discover/players")
async def discover(sport: str = "Badminton", radius_km: int = Query(5, ge=1, le=50),
    skill_level: str = "all", page: int = Query(1, ge=1, le=100), page_size: int = Query(40, ge=1, le=100),
    sort: str = Query("score", pattern="^(score|distance)$"),
    user: User = Depends(current_user), db: AsyncSession = Depends(db_session)):
    # Retain existing connection status cards for compatibility with Requests.
    return await candidates(db, user, sport, radius_km, skill_level, False, page, page_size, sort)


@router.get("/discovery/players")
async def recommendations(sport: str = "Badminton", radius_km: int = Query(5, ge=1, le=50),
    skill_level: str = "all", page: int = Query(1, ge=1, le=100), page_size: int = Query(24, ge=1, le=100),
    sort: str = Query("score", pattern="^(score|distance)$"),
    user: User = Depends(current_user), db: AsyncSession = Depends(db_session)):
    items = await candidates(db, user, sport, radius_km, skill_level, True, page, page_size, sort)
    return {"items": items, "page": page, "page_size": page_size}


@router.get("/discovery/groups")
async def discover_groups(sport: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(24, ge=1, le=100),
                          user=Depends(current_user), db=Depends(db_session)):
    require_player(user)
    from app.routes.groups import groups
    return {"items": await groups(user, db, sport, True, page, page_size), "page": page, "page_size": page_size,
            "location_basis": "Shared neighbourhood. Group venues do not yet have geocoded coordinates."}


@router.get("/discovery/games")
async def discover_games(sport: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(24, ge=1, le=100),
                         user=Depends(current_user), db=Depends(db_session)):
    require_player(user)
    from app.routes.games import games
    return {"items": await games(user, db, sport, True, page, page_size), "page": page, "page_size": page_size,
            "location_basis": "Shared neighbourhood. Verify the published venue before joining."}
