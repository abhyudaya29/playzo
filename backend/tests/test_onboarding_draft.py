"""Full browser draft payloads must validate without metadata-related 500s."""
from copy import deepcopy
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, Mock

import httpx
from fastapi import FastAPI
from pydantic import ValidationError

from app.dependencies import current_user, db_session
from app.routes.onboarding import router
from app.schemas import DraftInput


def browser_draft():
    return {"step": 0, "profile": {
        "name": "Signup Player", "phone": None, "nickname": None, "age": None,
        "gender": "man", "looking_for": None, "motivation": None,
        "pincode": "", "city": "", "state": "", "locality": "",
        "street_address": "", "latitude": None, "longitude": None,
        "search_radius_km": 5, "bio": "", "gender_self_description": "",
        "gender_visibility": "private", "discovery_visible": True,
        "teammate_preference": "no_preference", "participation_interests": [],
        "availability": [], "languages": [], "sports": [],
    }}


class DraftValidationTests(unittest.TestCase):
    def test_full_first_step_browser_payload(self):
        payload = browser_draft()
        self.assertEqual(DraftInput(**payload).profile, payload["profile"])

    def test_populated_fields_without_metadata(self):
        payload = browser_draft()
        payload["profile"].update(
            gender="non_binary", looking_for="find_group", motivation="comeback",
            state="Delhi", street_address="Near the park",
            gender_visibility="public", discovery_visible=False,
            teammate_preference="mixed",
        )
        result = DraftInput(**payload)
        self.assertEqual(result.profile, payload["profile"])
        self.assertIs(result.profile["discovery_visible"], False)

    def test_constraints_and_enum_validation_remain_enforced(self):
        for field, value in [
            ("gender", "invalid"), ("gender_visibility", "invalid"),
            ("teammate_preference", "invalid"), ("discovery_visible", "invalid"),
            ("search_radius_km", 51), ("name", "x" * 151),
            ("availability", [{"weekday": 9, "time_slot": "evening"}]),
            ("sports", [{"sport": "Badminton", "skill_level": "invalid"}]),
        ]:
            payload = browser_draft()
            payload["profile"][field] = value
            with self.subTest(field=field), self.assertRaises(ValidationError):
                DraftInput(**payload)


class DraftEndpointTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.user = SimpleNamespace(
            id="draft-test-user", onboarding_completed=False,
            onboarding_draft={}, onboarding_step=0,
        )
        self.db = SimpleNamespace(refresh=AsyncMock(), commit=AsyncMock(), add=Mock())
        app = FastAPI()
        app.include_router(router)

        async def user():
            return self.user

        async def database():
            yield self.db

        app.dependency_overrides[current_user] = user
        app.dependency_overrides[db_session] = database
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test",
        )

    async def asyncTearDown(self):
        await self.client.aclose()

    async def test_patch_accepts_and_saves_full_browser_payload(self):
        payload = browser_draft()
        response = await self.client.patch("/api/v1/onboarding/me", json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), {"success": True, "step": 0})
        self.assertEqual(self.user.onboarding_draft, payload["profile"])
        self.db.commit.assert_awaited_once()

    async def test_invalid_field_returns_422_without_saving(self):
        payload = deepcopy(browser_draft())
        payload["profile"]["gender"] = "invalid"
        response = await self.client.patch("/api/v1/onboarding/me", json=payload)
        self.assertEqual(response.status_code, 422, response.text)
        self.db.commit.assert_not_awaited()
        self.assertEqual(self.user.onboarding_draft, {})


if __name__ == "__main__":
    unittest.main()
