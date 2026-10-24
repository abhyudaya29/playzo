import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import func, select

from app.dependencies import current_user, db_session
from app.models import ProfilePost, User
from app.services import profile_posts as media
from app.services.platform import require_player

router = APIRouter(prefix="/api/v1/users/me/posts", tags=["profile posts"])


@router.get("")
async def own_posts(user=Depends(current_user), db=Depends(db_session)):
    return {"posts": await media.list_posts(db, user.id), "uploads_enabled": media.configured(),
            "max_posts": media.MAX_POSTS, "max_image_bytes": media.MAX_IMAGE_BYTES}


@router.post("", status_code=201)
async def create_post(request: Request, caption: str = Query("", max_length=500),
                      user=Depends(current_user), db=Depends(db_session)):
    require_player(user)
    media.credentials()
    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > media.MAX_IMAGE_BYTES:
            raise HTTPException(413, "Choose a photo smaller than 10 MB.")
        data.extend(chunk)
    media.image_type(data)
    # Serialize changes per owner so concurrent uploads cannot exceed the limit.
    await db.execute(select(User.id).where(User.id == user.id).with_for_update())
    count = await db.scalar(select(func.count()).select_from(ProfilePost).where(ProfilePost.user_id == user.id))
    if count >= media.MAX_POSTS:
        raise HTTPException(409, "Your profile has 12 posts. Remove one before adding another.")
    post_id = str(uuid.uuid4())
    public_id = f"playhud/profiles/{user.id}/{post_id}"
    url = await media.upload_image(bytes(data), public_id)
    post = ProfilePost(id=post_id, user_id=user.id, public_id=public_id,
                       image_url=url, caption=caption.strip())
    db.add(post)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        # Best effort cleanup if persistence failed after Cloudinary accepted the image.
        try:
            await media.delete_image(public_id)
        except HTTPException:
            pass
        raise
    await db.refresh(post)
    return media.serialize(post)


@router.delete("/{post_id}", status_code=204)
async def remove_post(post_id: str, user=Depends(current_user), db=Depends(db_session)):
    await db.execute(select(User.id).where(User.id == user.id).with_for_update())
    post = await db.scalar(select(ProfilePost).where(ProfilePost.id == post_id, ProfilePost.user_id == user.id))
    if not post:
        raise HTTPException(404, "Post not found")
    await media.delete_image(post.public_id)
    await db.delete(post)
    await db.commit()
    return Response(status_code=204)
