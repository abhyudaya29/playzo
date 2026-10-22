"""Shared policy and serializers. Private profile data never enters public cards."""
from fastapi import Depends, HTTPException
from sqlalchemy import func, select, text
from pydantic import BaseModel, ConfigDict, Field
from typing import Literal
from datetime import datetime, timedelta, timezone

from app.dependencies import current_user
from app.models import ActivityEvent, AdminAuditLog, PlatformSettings, SportCatalog

STAFF = {"SUPER_ADMIN", "OPERATIONS_ADMIN", "TOURNAMENT_MODERATOR", "SUPPORT_AGENT"}
OPERATIONS = {"SUPER_ADMIN", "OPERATIONS_ADMIN"}
MODERATORS = OPERATIONS | {"TOURNAMENT_MODERATOR"}


def require_roles(*roles):
    async def authorized(user=Depends(current_user)):
        if user.role not in roles:
            raise HTTPException(403, "You do not have permission for this action")
        return user
    return authorized


def eligible(user):
    return user.account_status == "active" and user.onboarding_completed


def require_player(user):
    if not eligible(user):
        raise HTTPException(409, "Complete your player profile before participating")


def avatar_url(user):
    return user.clerk_image_url


def person(user):
    return {"id": user.id, "name": user.name, "avatar_url": avatar_url(user)}


async def settings(db):
    row = await db.get(PlatformSettings, 1)
    if not row:
        raise HTTPException(503, "Apply pending database evolutions")
    return row.value


async def validate_sports(db, names):
    active = set((await db.execute(select(SportCatalog.name).where(SportCatalog.active.is_(True)))).scalars())
    if any(name not in active for name in names):
        raise HTTPException(422, "Choose an available sport")


# Domain events are written in the business transaction. No analytics service or
# queue availability is required for primary actions to complete.
EVENTS = {
    "user_signed_up", "onboarding_started", "onboarding_step_completed", "onboarding_completed",
    "profile_updated", "preferences_updated", "connection_requested", "connection_accepted",
    "connection_declined", "group_created", "group_joined", "group_left", "group_membership_requested",
    "game_created", "game_joined", "game_cancelled", "game_completed", "tournament_created",
    "tournament_submitted", "tournament_registered", "tournament_registration_cancelled",
    "tournament_completed", "conversation_started", "message_sent", "user_blocked", "user_reported",
    "moderation_action_applied", "organizer_verified",
}
SAFE_EVENT_FIELDS = {"sport", "step", "participation_type"}


class EventMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    sport: str | None = Field(default=None, max_length=60)
    step: int | None = Field(default=None, ge=0, le=6)
    participation_type: Literal["individual", "group", "tournament"] | None = None


async def rate_limit(db, user_id, event_name, limit=30, seconds=3600):
    await db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:key,0))"),
                     {"key": f"rate:{user_id}:{event_name}"})
    count = await db.scalar(select(func.count()).select_from(ActivityEvent).where(
        ActivityEvent.user_id == user_id, ActivityEvent.event_name == event_name,
        ActivityEvent.created_at >= datetime.now(timezone.utc) - timedelta(seconds=seconds)))
    if count >= limit:
        raise HTTPException(429, "You have reached the activity limit. Try again later.")


def record(db, user_id, event_name, entity_type=None, entity_id=None, **metadata):
    if event_name not in EVENTS or not set(metadata) <= SAFE_EVENT_FIELDS:
        raise ValueError("Unknown event or unsafe metadata")
    db.add(ActivityEvent(user_id=user_id, event_name=event_name, entity_type=entity_type,
                         entity_id=entity_id, payload=EventMetadata(**metadata).model_dump(exclude_none=True)))


def audit(db, actor, action, target_type, target_id, reason, **changes):
    db.add(AdminAuditLog(admin_id=actor.id, action=action, target_type=target_type,
                         target_id=target_id, reason=reason, payload=changes))
