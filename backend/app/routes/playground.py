"""Bounded, opt-in public previews. All participation still uses authenticated routes."""
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import and_, exists, func, or_, select

from app.cache import valkey
from app.dependencies import db_session
from app.models import ActivityEvent, Game, GameParticipant, Group, GroupMember, Location, Sport, User
from app.services.platform import validate_sports

router = APIRouter(prefix="/api/v1/playground", tags=["guest playground"])


class PreviewInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["players", "communities", "games"] = "players"
    sport: str = Field(default="Badminton", min_length=2, max_length=60)
    skill_level: Literal["hobby", "beginner", "intermediate", "advanced", "pro"] = "beginner"
    gender: Literal["man", "woman", "non_binary", "other", "prefer_not_to_say"] | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    longitude: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False)
    pincode: str | None = Field(default=None, pattern=r"^[1-9]\d{5}$")
    radius_km: int = Field(default=10, ge=1, le=25)

    @model_validator(mode="after")
    def location_required(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Provide both location coordinates")
        if self.latitude is None and not self.pincode:
            raise ValueError("Use your location or enter a six-digit PIN code")
        return self


async def guest_limit(request: Request):
    # No raw IPs, coordinates, or guest identities are stored.
    host = request.client.host if request.client else "unknown"
    key = "guest-preview:" + hashlib.sha256(host.encode()).hexdigest()[:24]
    try:
        count = await valkey.incr(key)
        if count == 1:
            await valkey.expire(key, 60)
    except Exception as exc:
        raise HTTPException(503, "Live previews are temporarily unavailable. You can still explore the examples.") from exc
    if count > 40:
        raise HTTPException(429, "Please wait a minute before refreshing your preview.")


def public_name(user: User) -> str:
    return (user.nickname or user.name.split(" ")[0] or "Player")[:80]


def nearby(data: PreviewInput):
    if data.latitude is not None:
        # Match around a broad area rather than exposing exact locations or distances.
        origin = func.ST_SetSRID(func.ST_MakePoint(round(data.longitude, 2), round(data.latitude, 2)), 4326)
        distance = func.ST_Distance(Location.discovery_point, origin, True) / 1000
        return and_(Location.discovery_point.is_not(None),
                    func.ST_DWithin(Location.discovery_point, origin, data.radius_km * 1000)), distance
    return Location.pincode == data.pincode, None


def guest_eligible():
    return and_(User.account_status == "active", User.onboarding_completed.is_(True),
                User.discovery_visible.is_(True), User.guest_preview_visible.is_(True))


@router.post("/recommendations", dependencies=[Depends(guest_limit)])
async def recommendations(data: PreviewInput, db=Depends(db_session)):
    await validate_sports(db, [data.sport])
    area, distance = nearby(data)
    area_name = "Near your approximate location" if distance is not None else f"PIN {data.pincode} area"
    if data.kind == "players":
        accepted = ["no_preference", "mixed"]
        if data.gender == "woman": accepted.append("women")
        if data.gender == "man": accepted.append("men")
        query = (select(User, Sport, Location).join(Sport, Sport.user_id == User.id)
                 .join(Location, Location.user_id == User.id)
                 .where(guest_eligible(), area, Sport.sport == data.sport,
                        User.teammate_preference.in_(accepted)))
        if distance is not None:
            query = query.where(distance <= User.search_radius_km)
        # Prefer the selected skill, then proximity; no hidden gender is returned or filtered on.
        query = query.order_by((Sport.skill_level == data.skill_level).desc())
        query = query.order_by(distance if distance is not None else User.id, User.id).limit(6)
        rows = (await db.execute(query)).all()
        items = [{"id": user.id, "name": public_name(user), "sport": sport.sport,
                  "skill_level": sport.skill_level, "area": location.city,
                  "description": "Similar skill level" if sport.skill_level == data.skill_level else "Plays your sport",
                  "action": "Connect"} for user, sport, location in rows]
    elif data.kind == "communities":
        count = select(func.count()).select_from(GroupMember).where(GroupMember.group_id == Group.id).correlate(Group).scalar_subquery()
        query = (select(Group, Location, count).join(User, User.id == Group.owner_id)
                 .join(Location, Location.user_id == User.id)
                 .where(guest_eligible(), area, Group.visibility == "public", Group.sport == data.sport,
                        Group.locality != "", Group.locality == Location.locality)
                 .order_by(distance if distance is not None else Group.name, Group.id).limit(6))
        rows = (await db.execute(query)).all()
        items = [{"id": group.id, "name": group.name, "sport": group.sport,
                  "area": location.city, "member_count": members, "capacity": group.capacity,
                  "description": "A public community in the organizer’s area", "action": "Join community"}
                 for group, location, members in rows]
    else:
        count = select(func.count()).select_from(GameParticipant).where(GameParticipant.game_id == Game.id).correlate(Game).scalar_subquery()
        query = (select(Game, Location, count).join(User, User.id == Game.host_id)
                 .join(Location, Location.user_id == User.id)
                 .where(guest_eligible(), area, Game.status == "open", Game.sport == data.sport,
                        Game.starts_at > datetime.now(timezone.utc), Game.locality != "",
                        Game.locality == Location.locality, count < Game.capacity)
                 .order_by(Game.starts_at, Game.id).limit(6))
        rows = (await db.execute(query)).all()
        items = [{"id": game.id, "name": game.title, "sport": game.sport,
                  "area": location.city, "starts_at": game.starts_at.isoformat(),
                  "spots_left": game.capacity - members,
                  "description": "Hosted in this area; confirm the venue after signing up", "action": "Join game"}
                 for game, location, members in rows]
    return {"items": items, "kind": data.kind, "area": area_name, "requires_signup": True}


@router.get("/activity", dependencies=[Depends(guest_limit)])
async def activity(db=Depends(db_session)):
    public_group = exists(select(Group.id).where(Group.id == ActivityEvent.entity_id, Group.visibility == "public"))
    query = (select(ActivityEvent, User).join(User, User.id == ActivityEvent.user_id)
             .where(guest_eligible(), ActivityEvent.created_at >= datetime.now(timezone.utc) - timedelta(days=7),
                    ActivityEvent.event_name.in_(["user_signed_up", "connection_accepted", "group_joined"]),
                    or_(ActivityEvent.event_name != "group_joined", public_group))
             .order_by(ActivityEvent.created_at.desc(), ActivityEvent.id).limit(8))
    rows = (await db.execute(query)).all()
    phrases = {"user_signed_up": "joined Playhud", "connection_accepted": "found a playing partner",
               "group_joined": "joined a sports community"}
    return {"items": [{"id": event.id, "name": public_name(user), "message": phrases[event.event_name],
                       "created_at": event.created_at.isoformat()} for event, user in rows]}
