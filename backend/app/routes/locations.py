import json

import httpx
from fastapi import APIRouter, HTTPException

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
