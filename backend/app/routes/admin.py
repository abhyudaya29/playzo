"""Staff-only operational views. No private messages or generic ORM serializers."""
import csv
from datetime import datetime, timedelta, timezone
from io import StringIO
import os

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import func, or_, select, text

from app.dependencies import db_session
from app.models import (ActivityEvent, AdminAuditLog, Connection, Game, GameParticipant,
    Group, GroupMember, Location, ModerationReport, OrganizerProfile, PlatformSettings,
    Sport, SportCatalog, Tournament, TournamentRegistration, User)
from app.schemas import (CatalogInput, OrganizerReview, ReasonInput, ReportReview,
                         SettingsInput)
from app.services.platform import MODERATORS, OPERATIONS, STAFF, audit, person, record, require_roles
from app.routes.tournaments import tournament_dict

router = APIRouter(prefix="/api/v1/admin", dependencies=[Depends(require_roles(*STAFF))])


def date_window(start, end):
    now = datetime.now(timezone.utc)
    start, end = start or now - timedelta(days=30), end or now
    if start.tzinfo is None or end.tzinfo is None or start >= end or (end - start).days > 366:
        raise HTTPException(422, "Choose a timezone-aware date range of at most one year")
    return start, end


def page_result(items, total, page, page_size):
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/overview")
async def overview(start: datetime | None = None, end: datetime | None = None, db=Depends(db_session)):
    start, end = date_window(start, end)
    now = datetime.now(timezone.utc)
    async def count(model, *where):
        return await db.scalar(select(func.count()).select_from(model).where(*where))
    metrics = {
        "total_users": await count(User),
        "completed_onboarding": await count(User, User.onboarding_completed.is_(True)),
        "daily_active_users": await count(User, User.last_active_at >= now - timedelta(days=1)),
        "weekly_active_users": await count(User, User.last_active_at >= now - timedelta(days=7)),
        "monthly_active_users": await count(User, User.last_active_at >= now - timedelta(days=30)),
        "new_registrations": await count(User, User.created_at >= start, User.created_at < end),
        "successful_connections": await count(Connection, Connection.status == "accepted"),
        "groups": await count(Group), "games": await count(Game),
        "tournament_registrations": await count(TournamentRegistration),
        "pending_organizers": await count(OrganizerProfile, OrganizerProfile.status == "pending"),
        "open_reports": await count(ModerationReport, ModerationReport.status.in_(["open", "in_review"])),
    }
    day = func.date(func.timezone("Asia/Kolkata", User.created_at))
    trend = (await db.execute(select(day, func.count()).where(User.created_at >= start, User.created_at < end).group_by(day).order_by(day))).all()
    return {"metrics": metrics, "registrations": [{"date": str(d), "count": n} for d, n in trend],
        "start": start, "end": end, "timezone": "Asia/Kolkata",
        "definitions": "Active users are distinct accounts with an authenticated API request in the rolling 1/7/30 days. New registrations and the registration chart use the selected interval; other operational totals are lifetime. Historical registration dates before evolution 005 are unavailable."}


@router.get("/users")
async def users(q: str = Query("", max_length=150), city: str = Query("", max_length=160),
    sport: str = Query("", max_length=60), status: str = Query("", pattern="^(|active|suspended)$"),
    onboarded: bool | None = None, last_active_after: datetime | None = None,
    page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100), db=Depends(db_session)):
    query = select(User).outerjoin(Location)
    if q: query = query.where(User.name.ilike(f"%{q}%"))
    if city: query = query.where(Location.city.ilike(f"%{city}%"))
    if sport: query = query.where(User.id.in_(select(Sport.user_id).where(Sport.sport == sport)))
    if status: query = query.where(User.account_status == status)
    if onboarded is not None: query = query.where(User.onboarding_completed == onboarded)
    if last_active_after is not None:
        if last_active_after.tzinfo is None: raise HTTPException(422, "Include a timezone")
        query = query.where(User.last_active_at >= last_active_after)
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    rows = (await db.execute(query.order_by(User.created_at.desc(), User.id).offset((page-1)*page_size).limit(page_size))).scalars().all()
    ids = [row.id for row in rows]
    locations = {row.user_id: row.city for row in (await db.execute(select(Location).where(Location.user_id.in_(ids)))).scalars()}
    sports = {}
    for row in (await db.execute(select(Sport).where(Sport.user_id.in_(ids)))).scalars():
        sports.setdefault(row.user_id, []).append(row.sport)
    return page_result([{**person(row), "city": locations.get(row.id), "sports": sports.get(row.id, []),
        "onboarding_completed": row.onboarding_completed, "account_status": row.account_status,
        "discovery_visible": row.discovery_visible, "created_at": row.created_at,
        "last_active_at": row.last_active_at} for row in rows], total, page, page_size)


@router.get("/users/{id}")
async def user_detail(id: str, db=Depends(db_session)):
    user = await db.get(User, id)
    if not user: raise HTTPException(404, "User not found")
    loc = await db.get(Location, id)
    sports = (await db.execute(select(Sport).where(Sport.user_id == id))).scalars()
    groups = (await db.execute(select(Group).join(GroupMember).where(GroupMember.user_id == id))).scalars()
    games = (await db.execute(select(Game).join(GameParticipant).where(GameParticipant.user_id == id).limit(50))).scalars()
    tournaments = (await db.execute(select(Tournament).join(TournamentRegistration).where(TournamentRegistration.user_id == id).limit(50))).scalars()
    connections = await db.scalar(select(func.count()).select_from(Connection).where(
        or_(Connection.requester_id == id, Connection.receiver_id == id), Connection.status == "accepted"))
    return {**person(user), "city": loc.city if loc else None, "bio": user.bio, "role": user.role,
        "account_status": user.account_status, "discovery_visible": user.discovery_visible,
        "onboarding_completed": user.onboarding_completed, "created_at": user.created_at,
        "participation_interests": user.participation_interests, "availability": user.availability,
        "sports": [{"sport": s.sport, "skill_level": s.skill_level} for s in sports],
        "groups": [{"id": g.id, "name": g.name} for g in groups],
        "games": [{"id": g.id, "title": g.title} for g in games],
        "tournaments": [{"id": t.id, "title": t.title} for t in tournaments], "connections": connections}


@router.post("/users/{id}/{action}")
async def account_action(id: str, action: str, data: ReasonInput,
    actor=Depends(require_roles(*OPERATIONS)), db=Depends(db_session)):
    if action not in {"suspend", "reactivate", "restrict-discovery", "restore-discovery", "note"}:
        raise HTTPException(404, "Unknown action")
    target = await db.get(User, id, with_for_update=True)
    if not target: raise HTTPException(404, "User not found")
    if target.id == actor.id or (target.role != "USER" and actor.role != "SUPER_ADMIN"):
        raise HTTPException(403, "You cannot moderate this account")
    if target.role == "SUPER_ADMIN": raise HTTPException(403, "Super admins require trusted operator management")
    before = {"account_status": target.account_status, "discovery_visible": target.discovery_visible}
    if action in {"suspend", "reactivate"}: target.account_status = "suspended" if action == "suspend" else "active"
    if action in {"restrict-discovery", "restore-discovery"}: target.discovery_visible = action == "restore-discovery"
    audit(db, actor, "USER_" + action.replace("-", "_").upper(), "user", id, data.reason,
        before=before, after={"account_status": target.account_status, "discovery_visible": target.discovery_visible})
    record(db, target.id, "moderation_action_applied", "user", id)
    await db.commit()
    return {"success": True}


def event_dict(event, name):
    return {"id": event.id, "user_id": event.user_id, "user_name": name or "Deleted account",
        "event_name": event.event_name, "entity_type": event.entity_type, "entity_id": event.entity_id,
        "metadata": event.payload, "created_at": event.created_at}


async def activity_query(db, start, end, q, user_id, event_name, sport, city, page, page_size):
    query = select(ActivityEvent, User.name).outerjoin(User, User.id == ActivityEvent.user_id)
    query = query.where(ActivityEvent.created_at >= start, ActivityEvent.created_at < end)
    if q: query = query.where(User.name.ilike(f"%{q}%"))
    if user_id: query = query.where(ActivityEvent.user_id == user_id)
    if event_name: query = query.where(ActivityEvent.event_name == event_name)
    if sport: query = query.where(ActivityEvent.payload["sport"].as_string() == sport)
    if city: query = query.where(ActivityEvent.user_id.in_(select(Location.user_id).where(Location.city.ilike(city))))
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    rows = (await db.execute(query.order_by(ActivityEvent.created_at.desc(), ActivityEvent.id).offset((page-1)*page_size).limit(page_size))).all()
    return [event_dict(event, name) for event, name in rows], total


@router.get("/activity")
async def activity(start: datetime | None = None, end: datetime | None = None,
    q: str = Query("", max_length=150), user_id: str = "", event_name: str = Query("", max_length=60),
    sport: str = Query("", max_length=60), city: str = Query("", max_length=160),
    page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=100), db=Depends(db_session)):
    start, end = date_window(start, end)
    items, total = await activity_query(db, start, end, q, user_id, event_name, sport, city, page, page_size)
    return page_result(items, total, page, page_size)


@router.get("/users/{id}/activity")
async def user_activity(id: str, page: int = Query(1, ge=1), db=Depends(db_session)):
    start, end = date_window(None, None)
    items, total = await activity_query(db, start, end, "", id, "", "", "", page, 50)
    return page_result(items, total, page, 50)


@router.get("/activity/export")
async def export(start: datetime | None = None, end: datetime | None = None,
    q: str = Query("", max_length=150), user_id: str = "", event_name: str = Query("", max_length=60),
    sport: str = Query("", max_length=60), city: str = Query("", max_length=160),
    actor=Depends(require_roles(*OPERATIONS)), db=Depends(db_session)):
    start, end = date_window(start, end)
    items, total = await activity_query(db, start, end, q, user_id, event_name, sport, city, 1, 10000)
    if total > 10000: raise HTTPException(422, "Narrow the date range to export at most 10,000 events")
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["Time (UTC)", "Player", "Event", "Entity"])
    def safe(value):
        value = str(value or "")
        return "'" + value if value.lstrip().startswith(("=", "+", "-", "@", "\t", "\r")) else value
    for item in items:
        writer.writerow([item["created_at"].isoformat(), safe(item["user_name"]), item["event_name"], item["entity_type"]])
    audit(db, actor, "ACTIVITY_EXPORTED", "activity", "export", "Operational activity export", count=total)
    await db.commit()
    return Response(output.getvalue(), media_type="text/csv", headers={"Content-Disposition": 'attachment; filename="playzo-activity.csv"', "Cache-Control": "no-store"})


@router.get("/groups")
async def groups(page: int = Query(1, ge=1), db=Depends(db_session)):
    count = select(GroupMember.group_id, func.count().label("n")).group_by(GroupMember.group_id).subquery()
    rows = (await db.execute(select(Group, User.name, func.coalesce(count.c.n, 0)).join(User, Group.owner_id == User.id)
        .outerjoin(count, count.c.group_id == Group.id).order_by(Group.name, Group.id).offset((page-1)*25).limit(25))).all()
    return page_result([{"id": g.id, "name": g.name, "sport": g.sport, "locality": g.locality, "owner": owner, "members": n} for g, owner, n in rows],
        await db.scalar(select(func.count()).select_from(Group)), page, 25)


@router.get("/games")
async def games(page: int = Query(1, ge=1), db=Depends(db_session)):
    count = select(GameParticipant.game_id, func.count().label("n")).group_by(GameParticipant.game_id).subquery()
    rows = (await db.execute(select(Game, User.name, func.coalesce(count.c.n, 0)).join(User, Game.host_id == User.id)
        .outerjoin(count, count.c.game_id == Game.id).order_by(Game.starts_at.desc(), Game.id).offset((page-1)*25).limit(25))).all()
    return page_result([{"id": g.id, "title": g.title, "sport": g.sport, "host": host, "participants": n,
        "capacity": g.capacity, "status": g.status, "starts_at": g.starts_at} for g, host, n in rows],
        await db.scalar(select(func.count()).select_from(Game)), page, 25)


@router.get("/tournaments")
async def tournaments(page: int = Query(1, ge=1), db=Depends(db_session)):
    count = select(TournamentRegistration.tournament_id, func.count().label("n")).group_by(TournamentRegistration.tournament_id).subquery()
    rows = (await db.execute(select(Tournament, User.name, func.coalesce(count.c.n, 0)).join(User, Tournament.host_id == User.id)
        .outerjoin(count, count.c.tournament_id == Tournament.id).order_by(Tournament.created_at.desc(), Tournament.id).offset((page-1)*25).limit(25))).all()
    return page_result([{**tournament_dict(t, n), "organizer": name} for t, name, n in rows],
        await db.scalar(select(func.count()).select_from(Tournament)), page, 25)


@router.get("/organizers")
async def organizers(page: int = Query(1, ge=1), db=Depends(db_session)):
    rows = (await db.execute(select(OrganizerProfile, User.name).join(User, User.id == OrganizerProfile.user_id)
        .order_by(OrganizerProfile.submitted_at.desc()).offset((page-1)*25).limit(25))).all()
    return page_result([{"id": row.user_id, "name": name, "organization": row.organization, "experience": row.experience,
        "status": row.status, "submitted_at": row.submitted_at} for row, name in rows],
        await db.scalar(select(func.count()).select_from(OrganizerProfile)), page, 25)


@router.post("/organizers/{id}/review")
async def review_organizer(id: str, data: OrganizerReview, actor=Depends(require_roles(*MODERATORS)), db=Depends(db_session)):
    if id == actor.id: raise HTTPException(403, "You cannot verify your own organizer application")
    row = await db.get(OrganizerProfile, id, with_for_update=True)
    if not row: raise HTTPException(404, "Organizer not found")
    before = row.status
    row.status, row.reviewed_by, row.reviewed_at = data.status, actor.id, datetime.now(timezone.utc)
    audit(db, actor, "ORGANIZER_" + data.status.upper(), "user", id, data.reason, before=before, after=data.status)
    if data.status == "verified": record(db, id, "organizer_verified", "user", id)
    await db.commit()
    return {"status": row.status}


@router.get("/reports")
async def reports(status: str = Query("", pattern="^(|open|in_review|resolved|dismissed)$"), page: int = Query(1, ge=1),
    actor=Depends(require_roles(*OPERATIONS, "SUPPORT_AGENT")), db=Depends(db_session)):
    query = select(ModerationReport)
    if status: query = query.where(ModerationReport.status == status)
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    rows = (await db.execute(query.order_by(ModerationReport.created_at.desc()).offset((page-1)*25).limit(25))).scalars()
    return page_result([{key: getattr(row, key) for key in ("id", "target_type", "target_id", "reason", "status", "internal_notes", "created_at")} for row in rows], total, page, 25)


@router.patch("/reports/{id}")
async def review_report(id: str, data: ReportReview, actor=Depends(require_roles(*OPERATIONS, "SUPPORT_AGENT")), db=Depends(db_session)):
    row = await db.get(ModerationReport, id, with_for_update=True)
    if not row: raise HTTPException(404, "Report not found")
    before = row.status
    row.status, row.internal_notes = data.status, data.internal_notes
    audit(db, actor, "REPORT_REVIEWED", "report", id, data.reason, before=before, after=data.status)
    await db.commit()
    return {"status": row.status}


@router.get("/settings")
async def get_settings(actor=Depends(require_roles("SUPER_ADMIN")), db=Depends(db_session)):
    return (await db.get(PlatformSettings, 1)).value


@router.patch("/settings")
async def update_settings(data: SettingsInput, actor=Depends(require_roles("SUPER_ADMIN")), db=Depends(db_session)):
    row = await db.get(PlatformSettings, 1, with_for_update=True)
    before = row.value
    row.value = data.model_dump(exclude={"reason"})
    audit(db, actor, "PLATFORM_SETTINGS_UPDATED", "settings", "1", data.reason, before=before, after=row.value)
    await db.commit()
    # Read-through DB settings avoid stale process-local cache after updates.
    return row.value


@router.get("/sports")
async def sports(actor=Depends(require_roles("SUPER_ADMIN")), db=Depends(db_session)):
    rows = (await db.execute(select(SportCatalog).order_by(SportCatalog.name))).scalars()
    return [{"name": row.name, "active": row.active} for row in rows]


@router.put("/sports")
async def update_sport(data: CatalogInput, actor=Depends(require_roles("SUPER_ADMIN")), db=Depends(db_session)):
    row = await db.get(SportCatalog, data.name)
    if row: row.active = data.active
    else: db.add(SportCatalog(name=data.name, active=data.active))
    audit(db, actor, "SPORT_UPDATED" if row else "SPORT_CREATED", "sport", data.name, data.reason, active=data.active)
    await db.commit()
    return {"success": True}


@router.get("/audit-logs")
async def audit_logs(page: int = Query(1, ge=1), actor=Depends(require_roles(*OPERATIONS)), db=Depends(db_session)):
    rows = (await db.execute(select(AdminAuditLog, User.name).outerjoin(User, User.id == AdminAuditLog.admin_id)
        .order_by(AdminAuditLog.created_at.desc()).offset((page-1)*50).limit(50))).all()
    return page_result([{"id": row.id, "actor": name, "action": row.action, "target_type": row.target_type,
        "target_id": row.target_id, "reason": row.reason, "changes": row.payload, "created_at": row.created_at} for row, name in rows],
        await db.scalar(select(func.count()).select_from(AdminAuditLog)), page, 50)


@router.get("/analytics/overview")
async def analytics(db=Depends(db_session)):
    sports = (await db.execute(select(Sport.sport, func.count()).group_by(Sport.sport).order_by(func.count().desc()))).all()
    cities = (await db.execute(select(Location.city, func.count()).group_by(Location.city).order_by(func.count().desc()).limit(25))).all()
    url = os.getenv("POSTHOG_DASHBOARD_URL", "")
    if not url.startswith("https://"): url = ""
    return {"sports": [{"name": name, "count": count} for name, count in sports],
        "cities": [{"name": name, "count": count} for name, count in cities], "posthog_dashboard_url": url,
        "source": "PostgreSQL operational records. Product journeys, discovery click-through and retention live in PostHog Cloud."}


@router.get("/analytics/funnel")
async def funnel(start: datetime | None = None, end: datetime | None = None, db=Depends(db_session)):
    start, end = date_window(start, end)
    # A chronological, per-user 30-day activation funnel. Successive stages use
    # the previous stage time, rather than unrelated lifetime event counts.
    result = (await db.execute(text('''
      WITH registered AS (SELECT id, created_at AS t FROM users WHERE created_at >= :start AND created_at < :end),
      onboarded AS (SELECT u.id, u.created_at AS origin, u.onboarding_completed_at AS t FROM users u JOIN registered r USING(id)
        WHERE u.onboarding_completed_at >= r.t AND u.onboarding_completed_at <= r.t + interval '30 days'),
      requested AS (SELECT o.id, o.origin, min(e.created_at) AS t FROM onboarded o JOIN activity_events e ON e.user_id=o.id
        AND e.event_name='connection_requested' AND e.created_at >= o.t AND e.created_at <= o.origin + interval '30 days' GROUP BY o.id,o.origin),
      accepted AS (SELECT r.id,r.origin,min(e.created_at) AS t FROM requested r JOIN connections c ON c.requester_id=r.id
        JOIN activity_events e ON e.entity_id=r.id AND e.user_id=c.receiver_id AND e.event_name='connection_accepted'
        AND e.created_at >= r.t AND e.created_at <= r.origin + interval '30 days' GROUP BY r.id,r.origin),
      played AS (SELECT a.id FROM accepted a JOIN activity_events e ON e.user_id=a.id AND e.event_name IN ('game_joined','game_created')
        AND e.created_at >= a.t AND e.created_at <= a.origin + interval '30 days' GROUP BY a.id)
      SELECT (SELECT count(*) FROM registered) registered, (SELECT count(*) FROM onboarded) onboarded,
        (SELECT count(*) FROM requested) requested, (SELECT count(*) FROM accepted) accepted, (SELECT count(*) FROM played) played
    '''), {"start": start, "end": end})).mappings().one()
    return {"stages": [{"name": name, "count": count} for name, count in result.items()],
        "definition": "Registration cohort in selected interval; ordered milestones within 30 days of registration. In-progress cohorts are provisional. Operational events begin with evolution 005; discovery and behavioral retention are available separately in PostHog."}


@router.get("/analytics/retention")
async def retention(db=Depends(db_session)):
    rows = []
    for day in (1, 7, 30):
        result = (await db.execute(text("""
          SELECT count(*) AS eligible,
            count(*) FILTER (WHERE EXISTS (SELECT 1 FROM daily_active_users a WHERE a.user_id=u.id
              AND a.day=(u.created_at AT TIME ZONE 'Asia/Kolkata')::date + CAST(:day AS integer))) AS retained
          FROM users u WHERE (u.created_at AT TIME ZONE 'Asia/Kolkata')::date + CAST(:day AS integer)
            < (now() AT TIME ZONE 'Asia/Kolkata')::date
            AND u.created_at >= now() - interval '90 days'
        """), {"day": day})).mappings().one()
        rows.append({"day": day, **result, "rate": round(100 * result["retained"] / result["eligible"], 1) if result["eligible"] else None})
    return {"items": rows, "definition": "Mature registration cohorts in the last 90 days; returned on exactly day 1, 7 or 30 in Asia/Kolkata with an authenticated API request. Tracking starts at evolution 006. This is operational API retention, separate from PostHog product retention."}
