from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import current_user, db_session
from app.models import Connection, Location, Sport, User, UserBlock

router = APIRouter(prefix="/api/v1/discover")


@router.get("/players")
async def discover(
    sport: str = "Badminton",
    radius_km: int = Query(5, ge=1, le=30),
    skill_level: str = "all",
    user: User = Depends(current_user),
    db: AsyncSession = Depends(db_session),
):
    if not user.onboarding_completed:
        raise HTTPException(409, "Complete onboarding first")
    if skill_level not in ("all", "beginner", "intermediate", "advanced"):
        raise HTTPException(422, "Invalid skill level")

    mine = await db.get(Location, user.id)
    if not mine or mine.discovery_point is None:
        return []

    origin = func.ST_SetSRID(func.ST_MakePoint(mine.longitude, mine.latitude), 4326)
    distance_km = func.ST_Distance(Location.discovery_point, origin, True) / 1000
    query = (
        select(User, Sport, Location, distance_km.label("distance_km"))
        .join(Sport, Sport.user_id == User.id)
        .join(Location, Location.user_id == User.id)
        .where(
            User.id != user.id,
            User.id.not_in(
                select(UserBlock.blocked_id).where(UserBlock.blocker_id == user.id)
            ),
            User.id.not_in(
                select(UserBlock.blocker_id).where(UserBlock.blocked_id == user.id)
            ),
            User.onboarding_completed.is_(True),
            Sport.sport == sport,
            Location.discovery_point.is_not(None),
            func.ST_DWithin(Location.discovery_point, origin, radius_km * 1000),
        )
    )
    if skill_level != "all":
        query = query.where(Sport.skill_level == skill_level)

    rows = (await db.execute(query.order_by(distance_km).limit(40))).all()
    output = []
    for other, sport_row, loc, distance in rows:
        conn = (
            await db.execute(
                select(Connection).where(
                    (
                        (Connection.requester_id == user.id)
                        & (Connection.receiver_id == other.id)
                    )
                    | (
                        (Connection.receiver_id == user.id)
                        & (Connection.requester_id == other.id)
                    )
                )
            )
        ).scalar_one_or_none()
        output.append(
            {
                "id": other.id,
                "name": other.name,
                "bio": other.bio,
                "locality": loc.locality,
                "distance_km": round(float(distance), 1),
                "sport": sport_row.sport,
                "skill_level": sport_row.skill_level,
                "connection_status": conn.status if conn else None,
                "connection_direction": (
                    ("outgoing" if conn.requester_id == user.id else "incoming")
                    if conn
                    else None
                ),
            }
        )
    return output
