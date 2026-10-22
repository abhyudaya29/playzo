from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import current_user, db_session
from app.models import Location, Sport, User
from app.services.clerk_profile import sync_clerk_profile
from app.services.platform import avatar_url, person, record, require_player, settings, validate_sports
from app.social import blocked
from app.schemas import AnalyticsConsentInput, OnboardInput, PreferencesInput, ProfilePatch, SportInput

router = APIRouter(prefix="/api/v1/users")


@router.get("/me")
async def me(
    user: User = Depends(current_user),
    db: AsyncSession = Depends(db_session),
) -> dict:
    prefs = (await db.execute(select(Sport).where(Sport.user_id == user.id))).scalars().all()
    loc = await db.get(Location, user.id)
    return {
        "id": user.id,
        "avatar_url": avatar_url(user),
        "bio": user.bio,
        "gender_self_description": user.gender_self_description,
        "gender_visibility": user.gender_visibility,
        "discovery_visible": user.discovery_visible,
        "participation_interests": user.participation_interests,
        "teammate_preference": user.teammate_preference,
        "availability": user.availability,
        "role": user.role,
        "onboarding_step": user.onboarding_step,
        "onboarding_draft": user.onboarding_draft,
        "name": user.name,
        "phone": user.phone,
        "nickname": user.nickname,
        "age": user.age,
        "gender": user.gender,
        "motivation": user.motivation,
        "looking_for": user.looking_for,
        "languages": user.languages,
        "onboarding_completed": user.onboarding_completed,
        "search_radius_km": user.search_radius_km,
        "sports": [{"sport": x.sport, "skill_level": x.skill_level, "play_intention": x.play_intention} for x in prefs],
        "location": {
            "pincode": loc.pincode,
            "locality": loc.locality,
            "city": loc.city,
            "state": loc.state,
            "street_address": loc.street_address,
            "latitude": loc.latitude,
            "longitude": loc.longitude,
        } if loc else None,
    }


@router.put("/me/onboarding")
async def onboarding(
    data: OnboardInput,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(db_session),
) -> dict:
    await validate_sports(db, [x.sport for x in data.sports])
    config = await settings(db)
    if data.search_radius_km > config["maximum_radius_km"]:
        raise HTTPException(422, "Discovery radius exceeds the platform limit")
    completed_before = user.onboarding_completed
    user.bio = data.bio
    user.gender_self_description = data.gender_self_description if data.gender == "other" else None
    user.gender_visibility = data.gender_visibility
    user.discovery_visible = data.discovery_visible
    user.participation_interests = list(dict.fromkeys(data.participation_interests))
    user.teammate_preference = data.teammate_preference
    user.availability = [x.model_dump() for x in data.availability]
    user.onboarding_step = 6
    user.onboarding_draft = {}
    user.updated_at = datetime.now(timezone.utc)
    if not user.onboarding_completed_at:
        user.onboarding_completed_at = datetime.now(timezone.utc)
    if len({x.sport for x in data.sports}) != len(data.sports):
        raise HTTPException(422, "Duplicate sports")

    if not user.clerk_profile_synced_at:
        user.name = data.name
    user.phone = data.phone
    user.nickname = (data.nickname.strip() or None) if data.nickname else None
    user.age = data.age
    user.gender = data.gender
    user.motivation = data.motivation
    user.looking_for = data.looking_for
    user.languages = data.languages
    user.search_radius_km = data.search_radius_km
    user.onboarding_completed = True

    loc = await db.get(Location, user.id)
    if not loc:
        loc = Location(
            user_id=user.id,
            pincode=data.pincode,
            locality=data.locality,
            city=data.city,
            state=data.state,
        )
        db.add(loc)

    loc.pincode = data.pincode
    loc.locality = data.locality
    loc.city = data.city
    loc.state = data.state
    loc.street_address = data.street_address

    latitude, longitude = data.latitude, data.longitude
    if latitude is None or longitude is None:
        try:
            import httpx

            async with httpx.AsyncClient(timeout=6, headers={"User-Agent": "playhudPrototype/0.1"}) as client:
                r = await client.get(
                    "https://nominatim.openstreetmap.org/search",
                    params={"postalcode": data.pincode, "country": "India", "format": "json", "limit": 1},
                )
                r.raise_for_status()
                results = r.json()
                if results:
                    latitude = float(results[0]["lat"])
                    longitude = float(results[0]["lon"])
        except Exception:
            pass

    loc.latitude = latitude
    loc.longitude = longitude
    if latitude is not None and longitude is not None:
        loc.discovery_point = __import__("sqlalchemy").func.ST_SetSRID(
            __import__("sqlalchemy").func.ST_MakePoint(longitude, latitude), 4326
        )
    else:
        loc.discovery_point = None

    old = (await db.execute(select(Sport).where(Sport.user_id == user.id))).scalars().all()
    for sport in old:
        await db.delete(sport)
    await db.flush()

    for sport in data.sports:
        db.add(Sport(user_id=user.id, sport=sport.sport, skill_level=sport.skill_level, play_intention=sport.play_intention))

    record(db, user.id, "profile_updated" if completed_before else "onboarding_completed")
    await db.commit()
    return {"success": True, "location_approximate": data.latitude is None or data.longitude is None}


@router.patch("/me")
async def patch_profile(data: ProfilePatch, user=Depends(current_user), db=Depends(db_session)):
    if not user.clerk_profile_synced_at:
        user.name = data.name
    user.bio = data.bio
    user.updated_at = datetime.now(timezone.utc)
    record(db, user.id, "profile_updated")
    await db.commit()
    return {"success": True}


@router.post("/me/clerk-sync")
async def sync_account(user=Depends(current_user), db=Depends(db_session)):
    await sync_clerk_profile(db, user, required=True)
    await db.commit()
    return {"name": user.name, "avatar_url": avatar_url(user)}


@router.get("/me/preferences")
async def get_preferences(user=Depends(current_user)):
    return {key: getattr(user, key) for key in PreferencesInput.model_fields}


@router.patch("/me/preferences")
async def update_preferences(data: PreferencesInput, user=Depends(current_user), db=Depends(db_session)):
    if "search_radius_km" in data.model_fields_set and data.search_radius_km > (await settings(db))["maximum_radius_km"]:
        raise HTTPException(422, "Discovery radius exceeds the platform limit")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(user, key, value)
    record(db, user.id, "preferences_updated")
    await db.commit()
    return await get_preferences(user)


@router.patch("/me/analytics-consent")
async def analytics_consent(data: AnalyticsConsentInput,
                            user=Depends(current_user), db=Depends(db_session)):
    if user.product_analytics_consent != data.allowed:
        user.product_analytics_consent = data.allowed
        user.analytics_consent_updated_at = datetime.now(timezone.utc)
        await db.commit()
    return {"allowed": user.product_analytics_consent}


@router.get("/me/sports")
async def get_my_sports(user=Depends(current_user), db=Depends(db_session)):
    rows = (await db.execute(select(Sport).where(Sport.user_id == user.id))).scalars()
    return [{"sport": s.sport, "skill_level": s.skill_level, "play_intention": s.play_intention} for s in rows]


@router.put("/me/sports")
async def set_my_sports(data: list[SportInput],
                        user=Depends(current_user), db=Depends(db_session)):
    if not 1 <= len(data) <= 50 or len({s.sport for s in data}) != len(data):
        raise HTTPException(422, "Choose 1–50 unique sports")
    await validate_sports(db, [s.sport for s in data])
    from sqlalchemy import delete
    await db.execute(delete(Sport).where(Sport.user_id == user.id))
    for entry in data:
        db.add(Sport(user_id=user.id, **entry.model_dump()))
    record(db, user.id, "profile_updated")
    await db.commit()
    return await get_my_sports(user, db)


@router.get("/{user_id}")
async def public_profile(user_id: str, user=Depends(current_user), db=Depends(db_session)):
    if user_id != user.id:
        require_player(user)
    other = await db.get(User, user_id)
    if (not other or other.account_status != "active" or not other.onboarding_completed
            or (user.id != user_id and await blocked(db, user.id, user_id))):
        raise HTTPException(404, "Player not found")
    # Hidden profiles remain visible to accepted connections only.
    from app.models import Connection
    from sqlalchemy import or_, and_
    connection = await db.scalar(select(Connection).where(or_(
        and_(Connection.requester_id == user.id, Connection.receiver_id == user_id),
        and_(Connection.receiver_id == user.id, Connection.requester_id == user_id))))
    if user.id != user_id and not other.discovery_visible:
        if not connection or connection.status != "accepted":
            raise HTTPException(404, "Player not found")
    sports = (await db.execute(select(Sport).where(Sport.user_id == user_id))).scalars().all()
    loc = await db.get(Location, user_id)
    return {
        **person(other), "bio": other.bio, "nickname": other.nickname,
        "city": loc.city if loc else None, "locality": loc.locality if loc else None,
        "sports": [{"sport": row.sport, "skill_level": row.skill_level, "play_intention": row.play_intention} for row in sports],
        "availability": other.availability, "participation_interests": other.participation_interests,
        "gender": other.gender if other.gender_visibility == "public" else None,
        "gender_self_description": other.gender_self_description if other.gender_visibility == "public" else None,
        "connection_status": connection.status if connection else None,
        "connection_direction": ("outgoing" if connection.requester_id == user.id else "incoming") if connection else None,
    }
