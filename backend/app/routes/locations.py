import json
import os
import re

import httpx
from fastapi import APIRouter, HTTPException, Query

from app.cache import valkey

router = APIRouter(prefix="/api/v1/locations")


@router.get("/pincode/{pincode}")
async def lookup_pin(pincode: str) -> dict:
    if len(pincode) != 6 or not pincode.isdigit():
        raise HTTPException(422, "Invalid Indian PIN code")

    cache_key = f"pincode:{pincode}"
    try:
        cached = await valkey.get(cache_key)
        if cached:
            return json.loads(cached)
    except Exception:
        pass

    try:
        async with httpx.AsyncClient(timeout=7) as client:
            resp = await client.get(f"https://api.postalpincode.in/pincode/{pincode}")
            resp.raise_for_status()
            payload = resp.json()[0]
            if payload.get("Status") != "Success":
                raise HTTPException(404, "PIN code not found")

            offices = payload["PostOffice"]
            result = {
                "city": offices[0].get("District", ""),
                "state": offices[0].get("State", ""),
                "localities": sorted({office["Name"] for office in offices}),
            }
            try:
                await valkey.setex(cache_key, 86400, json.dumps(result))
            except Exception:
                pass
            return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, "PIN lookup service temporarily unavailable") from exc


@router.get("/reverse")
async def reverse_location(
    latitude: float = Query(ge=-90, le=90, allow_inf_nan=False),
    longitude: float = Query(ge=-180, le=180, allow_inf_nan=False),
) -> dict:
    # Only coarse coordinates leave the API; never request or return street details.
    latitude, longitude = round(latitude, 2), round(longitude, 2)
    key = f"location-area:{latitude:.2f}:{longitude:.2f}"
    try:
        cached = await valkey.get(key)
        if cached:
            return json.loads(cached)
        if not await valkey.set("location-area:provider-lock", "1", nx=True, ex=2):
            raise HTTPException(429, "Area lookup is busy. Please try again shortly.")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, "Area lookup temporarily unavailable") from exc
    try:
        async with httpx.AsyncClient(timeout=7) as client:
            response = await client.get(
                os.getenv("REVERSE_GEOCODING_URL", "https://nominatim.openstreetmap.org/reverse"),
                params={"format": "jsonv2", "lat": latitude, "lon": longitude,
                        "zoom": 14, "addressdetails": 1, "accept-language": "en"},
                headers={"User-Agent": "Playhud/1.0 (https://playhud.chaibytes.in)"},
            )
            response.raise_for_status()
            address = response.json().get("address", {})
        result = {
            "city": address.get("city") or address.get("town") or address.get("village") or address.get("county") or "",
            "state": address.get("state", ""),
            "locality": address.get("neighbourhood") or address.get("suburb") or address.get("city_district") or "",
            "pincode": "",
        }
        postcode = str(address.get("postcode", "")).strip()
        if address.get("country_code") == "in" and re.fullmatch(r"[1-9]\d{5}", postcode):
            result["pincode"] = postcode
        if not any(result.values()):
            raise HTTPException(404, "No area name found for this location")
        await valkey.setex(key, 86400, json.dumps(result))
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, "Area lookup temporarily unavailable") from exc
