from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from app.dependencies import db_session
from app.models import SportCatalog, User, UserAvatar

router = APIRouter(prefix="/api/v1")


@router.get("/sports")
async def sports(db=Depends(db_session)):
    return list((await db.execute(select(SportCatalog.name).where(SportCatalog.active.is_(True)).order_by(SportCatalog.name))).scalars())


@router.get("/avatars/{user_id}/{version}")
async def avatar(user_id: str, version: str, db=Depends(db_session)):
    row = (await db.execute(select(UserAvatar.content).join(User, User.id == UserAvatar.user_id).where(
        User.id == user_id, User.avatar_version == version, User.account_status == "active"))).first()
    if not row:
        raise HTTPException(404, "Photo not found")
    return Response(row[0], media_type="image/webp", headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})
