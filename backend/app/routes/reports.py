from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from app.dependencies import current_user, db_session
from app.models import Game, Group, ModerationReport, Tournament, User
from app.schemas import ReportInput
from app.services.platform import record

router = APIRouter(prefix="/api/v1/reports")


@router.post("")
async def report(data: ReportInput, user=Depends(current_user), db=Depends(db_session)):
    # Serialize per reporter to make the DB-backed abuse limit race-safe.
    await db.refresh(user, with_for_update=True)
    since = datetime.now(timezone.utc) - timedelta(hours=1)
    count = await db.scalar(select(func.count()).select_from(ModerationReport).where(
        ModerationReport.reporter_id == user.id, ModerationReport.created_at >= since))
    if count >= 10: raise HTTPException(429, "Report limit reached. Try again later.")
    target = await db.get({"user": User, "group": Group, "game": Game, "tournament": Tournament}[data.target_type], str(data.target_id))
    if not target: raise HTTPException(404, "Reported item not found")
    row = ModerationReport(reporter_id=user.id, target_type=data.target_type, target_id=str(data.target_id), reason=data.reason)
    db.add(row)
    await db.flush()
    record(db, user.id, "user_reported", data.target_type, str(data.target_id))
    await db.commit()
    return {"id": row.id, "status": row.status}
