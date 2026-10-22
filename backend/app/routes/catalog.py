from fastapi import APIRouter, Depends
from sqlalchemy import select
from app.dependencies import db_session
from app.models import SportCatalog

router = APIRouter(prefix="/api/v1")


@router.get("/sports")
async def sports(db=Depends(db_session)):
    return list((await db.execute(select(SportCatalog.name).where(SportCatalog.active.is_(True)).order_by(SportCatalog.name))).scalars())
