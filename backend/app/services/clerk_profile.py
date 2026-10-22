"""Sync account identity from Clerk, never from a client-provided avatar URL."""
from datetime import datetime, timezone
from urllib.parse import quote, urlsplit
import logging

import httpx
from fastapi import HTTPException
from app.config import CLERK_SECRET_KEY

logger = logging.getLogger(__name__)


def account_identity(data):
    name = " ".join(str(data.get(key) or "").strip() for key in ("first_name", "last_name")).strip()
    name = (name or str(data.get("username") or "").strip())[:150]
    url = data.get("image_url")
    if not isinstance(url, str) or len(url) > 2048 or urlsplit(url).scheme != "https" or not urlsplit(url).netloc:
        url = None
    return name, url


async def sync_clerk_profile(db, user, *, required=False):
    if not CLERK_SECRET_KEY:
        if required:
            raise HTTPException(503, "Clerk profile sync is not configured on the API")
        return False
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(
                "https://api.clerk.com/v1/users/" + quote(user.clerk_id, safe=""),
                headers={"Authorization": "Bearer " + CLERK_SECRET_KEY},
            )
            response.raise_for_status()
            data = response.json()
            if data.get("id") != user.clerk_id:
                raise ValueError("Clerk user mismatch")
            name, image_url = account_identity(data)
    except (httpx.HTTPError, ValueError, TypeError):
        if required:
            raise HTTPException(503, "Your account photo could not be synced. Please try again.")
        logger.warning("Clerk profile synchronization temporarily unavailable")
        return False
    if name:
        user.name = name
    user.clerk_image_url = image_url
    user.clerk_profile_synced_at = datetime.now(timezone.utc)
    return True
