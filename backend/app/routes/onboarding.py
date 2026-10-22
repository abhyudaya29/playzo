from fastapi import APIRouter, Depends, HTTPException
from app.dependencies import current_user, db_session
from app.schemas import DraftInput, OnboardInput
from app.services.platform import record
from app.routes.users import me, onboarding

router = APIRouter(prefix="/api/v1/onboarding")


@router.get("/me")
async def get_draft(user=Depends(current_user), db=Depends(db_session)):
    return await me(user, db)


@router.patch("/me")
async def save_draft(data: DraftInput, user=Depends(current_user), db=Depends(db_session)):
    if user.onboarding_completed:
        raise HTTPException(409, "Use your profile to update completed onboarding")
    await db.refresh(user, with_for_update=True)
    started = bool(user.onboarding_draft)
    old_step = user.onboarding_step
    user.onboarding_draft = data.profile
    user.onboarding_step = data.step
    if not started:
        record(db, user.id, "onboarding_started")
    if data.step > old_step:
        record(db, user.id, "onboarding_step_completed", step=old_step)
    await db.commit()
    return {"success": True, "step": user.onboarding_step}


@router.post("/complete")
async def complete(data: OnboardInput, user=Depends(current_user), db=Depends(db_session)):
    return await onboarding(data, user, db)
