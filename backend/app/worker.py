"""Optional Celery maintenance worker. Domain events stay in their source transaction."""
import asyncio
from celery import Celery
from celery.schedules import crontab
from sqlalchemy import text
from app.config import VALKEY_URL
from app.database import Session

celery = Celery("playzo", broker=VALKEY_URL)
celery.conf.update(timezone="Asia/Kolkata", task_ignore_result=True, broker_connection_retry_on_startup=True,
    beat_schedule={"posthog-outbox": {"task": "playzo.deliver_analytics", "schedule": 60.0},
        "daily-operational-rollup": {"task": "playzo.rollup", "schedule": crontab(hour=2, minute=0)}})


async def maintain():
    async with Session() as db:
        # One locked transaction prevents overlapping scheduled/manual rollups.
        await db.execute(text("SELECT pg_advisory_xact_lock(18004243)"))
        await db.execute(text("""
          INSERT INTO daily_event_totals(day,event_name,event_count,distinct_users)
          SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date,event_name,count(*),count(DISTINCT user_id)
          FROM activity_events WHERE created_at >= now() - interval '7 days'
          GROUP BY 1,2 ON CONFLICT(day,event_name) DO UPDATE
          SET event_count=EXCLUDED.event_count,distinct_users=EXCLUDED.distinct_users
        """))
        await db.execute(text("DELETE FROM activity_events WHERE created_at < now() - interval '180 days'"))
        await db.execute(text("DELETE FROM daily_active_users WHERE day < current_date - 400"))
        await db.commit()


@celery.task(name="playzo.rollup")
def rollup():
    # A fresh engine loop per task avoids sharing asyncpg connections across loops.
    from app.database import engine
    async def run():
        try:
            await maintain()
        finally:
            await engine.dispose()
    asyncio.run(run())


async def deliver_analytics():
    import os
    import httpx
    key, host = os.getenv("POSTHOG_PROJECT_KEY", ""), os.getenv("POSTHOG_HOST", "").rstrip("/")
    if not key or not host.startswith("https://"):
        return
    async with Session() as db:
        rows = (await db.execute(text("""
          SELECT e.id,e.user_id,e.event_name,e.payload,e.created_at,e.posthog_attempts FROM activity_events e
          JOIN users u ON u.id=e.user_id WHERE e.posthog_sent_at IS NULL AND e.posthog_attempts < 10
          AND (e.posthog_retry_at IS NULL OR e.posthog_retry_at <= now())
          AND u.product_analytics_consent AND e.created_at >= u.analytics_consent_updated_at
          ORDER BY e.created_at LIMIT 100 FOR UPDATE OF e SKIP LOCKED
        """))).mappings().all()
        async with httpx.AsyncClient(timeout=5) as client:
            for row in rows:
                # Recheck opt-out after row selection, immediately before delivery.
                allowed = await db.scalar(text("SELECT product_analytics_consent FROM users WHERE id=:id"), {"id": row["user_id"]})
                if not allowed: continue
                try:
                    properties = {k: v for k, v in row["payload"].items() if k in {"sport", "step", "participation_type"}}
                    result = await client.post(host + "/capture/", json={"api_key": key, "event": row["event_name"],
                        "uuid": row["id"], "timestamp": row["created_at"].isoformat(),
                        "properties": {"distinct_id": row["user_id"], "$insert_id": row["id"], "$geoip_disable": True, **properties}})
                    result.raise_for_status()
                except Exception:
                    await db.execute(text("UPDATE activity_events SET posthog_attempts=posthog_attempts+1,posthog_retry_at=now()+make_interval(secs=>:seconds) WHERE id=:id"),
                        {"id": row["id"], "seconds": min(3600, 2 ** row["posthog_attempts"] * 60)})
                else:
                    await db.execute(text("UPDATE activity_events SET posthog_sent_at=now() WHERE id=:id"), {"id": row["id"]})
        await db.commit()


@celery.task(name="playzo.deliver_analytics")
def deliver():
    from app.database import engine
    async def run():
        try:
            await deliver_analytics()
        finally:
            await engine.dispose()
    asyncio.run(run())
