from typing import Optional
from functools import lru_cache
import uuid

import jwt
from fastapi import Depends, Header, HTTPException, Request
from jwt import PyJWKClient
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import CLERK_AUDIENCE, CLERK_ISSUER, CLERK_JWKS_URL
from app.database import Session
from app.models import User


async def db_session() -> AsyncSession:
    async with Session() as db:
        yield db


@lru_cache(maxsize=1)
def signing_keys():
    return PyJWKClient(CLERK_JWKS_URL, cache_keys=True)


def verify_token(token: str) -> dict:
    if not CLERK_ISSUER or not CLERK_JWKS_URL:
        raise HTTPException(503, "Clerk issuer is not configured")
    try:
        key = signing_keys().get_signing_key_from_jwt(token).key
        claims = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            issuer=CLERK_ISSUER,
            audience=CLERK_AUDIENCE or None,
            options={"verify_aud": bool(CLERK_AUDIENCE), "require": ["exp", "sub"]},
            leeway=30,
        )
        if not claims.get("sub"):
            raise ValueError("No subject")
        return claims
    except Exception as exc:
        raise HTTPException(401, "Invalid or expired Clerk token") from exc


def auth_sub(authorization: Optional[str] = Header(None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing authentication token")
    return verify_token(authorization.split(" ", 1)[1])["sub"]


async def current_user(
    request: Request,
    db: AsyncSession = Depends(db_session),
    sub: str = Depends(auth_sub),
) -> User:
    user = (
        await db.execute(select(User).where(User.clerk_id == sub))
    ).scalar_one_or_none()
    if not user:
        inserted = await db.execute(
            insert(User)
            .values(
                id=str(uuid.uuid4()),
                clerk_id=sub,
                name="Player",
            )
            .on_conflict_do_nothing(index_elements=["clerk_id"])
        )
        from app.services.platform import record
        # Only the winning concurrent insert emits the registration event.
        user = (await db.execute(select(User).where(User.clerk_id == sub))).scalar_one()
        if inserted.rowcount:
            record(db, user.id, "user_signed_up")
        await db.commit()
        user = (await db.execute(select(User).where(User.clerk_id == sub))).scalar_one()
    if user.account_status != "active":
        raise HTTPException(403, "This account is suspended. Contact Playzo support.")
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    if not user.last_active_at or (now - user.last_active_at).total_seconds() >= 300:
        from zoneinfo import ZoneInfo
        from sqlalchemy import text
        from app.services.clerk_profile import sync_clerk_profile
        if request.url.path != "/api/v1/users/me/clerk-sync":
            await sync_clerk_profile(db, user)
        user.last_active_at = now
        await db.execute(text("INSERT INTO daily_active_users(user_id,day) VALUES (:id,:day) ON CONFLICT DO NOTHING"),
                         {"id": user.id, "day": now.astimezone(ZoneInfo("Asia/Kolkata")).date()})
        await db.commit()
    return user
