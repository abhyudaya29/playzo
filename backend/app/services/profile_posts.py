"""Signed, server-side Cloudinary image storage for player photo posts."""
import hashlib
import re
import time
from urllib.parse import urlsplit

import httpx
from fastapi import HTTPException
from sqlalchemy import select

from app.config import CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, CLOUDINARY_CLOUD_NAME
from app.models import ProfilePost

MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_POSTS = 12


def configured() -> bool:
    return bool(CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET)


def credentials() -> None:
    if not configured():
        raise HTTPException(503, "Photo uploads are not available yet. Please try again later.")
    if not re.fullmatch(r"[A-Za-z0-9_-]+", CLOUDINARY_CLOUD_NAME):
        raise HTTPException(503, "Photo uploads are not available yet.")


def signed_params(params: dict) -> dict:
    value = "&".join(f"{key}={params[key]}" for key in sorted(params))
    return {**params, "api_key": CLOUDINARY_API_KEY,
            "signature": hashlib.sha1((value + CLOUDINARY_API_SECRET).encode()).hexdigest()}


def image_type(data: bytes) -> str:
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    raise HTTPException(415, "Choose a JPEG, PNG, or WebP photo.")


async def upload_image(data: bytes, public_id: str) -> str:
    credentials()
    mime = image_type(data)
    params = signed_params({"public_id": public_id, "timestamp": str(int(time.time())),
                            "overwrite": "false", "allowed_formats": "jpg,jpeg,png,webp",
                            "transformation": "c_limit,w_1600,h_2000,q_auto"})
    try:
        async with httpx.AsyncClient(timeout=90) as client:
            response = await client.post(
                f"https://api.cloudinary.com/v1_1/{CLOUDINARY_CLOUD_NAME}/image/upload",
                data=params, files={"file": ("photo", data, mime)},
            )
            response.raise_for_status()
            result = response.json()
        url = result["secure_url"]
        parsed = urlsplit(url)
        if (result.get("public_id") != public_id or result.get("resource_type") != "image"
                or parsed.scheme != "https" or parsed.netloc != "res.cloudinary.com"
                or not parsed.path.startswith(f"/{CLOUDINARY_CLOUD_NAME}/image/upload/")):
            raise ValueError("Invalid image response")
        return url
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        raise HTTPException(502, "Your photo could not be uploaded. Please try again.") from exc


async def delete_image(public_id: str) -> None:
    credentials()
    params = signed_params({"public_id": public_id, "timestamp": str(int(time.time())), "invalidate": "true"})
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"https://api.cloudinary.com/v1_1/{CLOUDINARY_CLOUD_NAME}/image/destroy", data=params,
            )
            response.raise_for_status()
            if response.json().get("result") not in {"ok", "not found"}:
                raise ValueError("Image not removed")
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(502, "Your photo could not be removed. Please try again.") from exc


def serialize(post: ProfilePost) -> dict:
    return {"id": post.id, "image_url": post.image_url, "caption": post.caption,
            "created_at": post.created_at.isoformat()}


async def list_posts(db, user_id: str) -> list[dict]:
    rows = (await db.execute(select(ProfilePost).where(ProfilePost.user_id == user_id)
                            .order_by(ProfilePost.created_at.desc(), ProfilePost.id.desc()))).scalars()
    return [serialize(row) for row in rows]
