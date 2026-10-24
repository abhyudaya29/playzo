"""Route registration and reported 404s, without a database or external services."""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx

from app.check_routes import verify_routes
from app.dependencies import current_user, db_session
from app.main import app


class RouteContractTests(unittest.IsolatedAsyncioTestCase):
    async def test_reported_endpoints_are_served(self):
        user = SimpleNamespace(product_analytics_consent=False)
        db = AsyncMock()
        db.execute.return_value = SimpleNamespace(scalars=lambda: ["Badminton", "Tennis"])
        app.dependency_overrides[current_user] = lambda: user
        app.dependency_overrides[db_session] = lambda: db
        try:
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.get("/api/v1/sports")
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json(), ["Badminton", "Tennis"])
                response = await client.patch(
                    "/api/v1/users/me/analytics-consent", json={"allowed": True}
                )
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json(), {"allowed": True})
                self.assertTrue(user.product_analytics_consent)
                db.commit.assert_awaited_once()
        finally:
            app.dependency_overrides.clear()

    def test_release_rejects_missing_routes_or_methods(self):
        schema = app.openapi()
        verify_routes(schema, schema)
        deployed = {"paths": {path: dict(item) for path, item in schema["paths"].items()}}
        del deployed["paths"]["/api/v1/sports"]
        del deployed["paths"]["/api/v1/users/me/analytics-consent"]["patch"]
        with self.assertRaisesRegex(RuntimeError, "GET /api/v1/sports.*PATCH /api/v1/users/me/analytics-consent"):
            verify_routes(schema, deployed)
