from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import current_user, db_session
from app.models import Location, Sport, User
from app.schemas import OnboardInput, SportInput

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
        "name": user.name,
        "phone": user.phone,
        "onboarding_completed": user.onboarding_completed,
        "search_radius_km": user.search_radius_km,
        "sports": [{"sport": x.sport, "skill_level": x.skill_level} for x in prefs],
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
    if any(x.skill_level not in ("beginner", "intermediate", "advanced") for x in data.sports):
        raise HTTPException(422, "Invalid skill level")
    if len({x.sport for x in data.sports}) != len(data.sports):
        raise HTTPException(422, "Duplicate sports")

    user.name = data.name
    user.phone = data.phone
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

            async with httpx.AsyncClient(timeout=6, headers={"User-Agent": "PlayzoPrototype/0.1"}) as client:
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
        db.add(Sport(user_id=user.id, sport=sport.sport, skill_level=sport.skill_level))

    await db.commit()
    return {"success": True, "location_approximate": data.latitude is None or data.longitude is None}
