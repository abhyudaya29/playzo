import os

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://playzo:playzo@localhost:5432/playzo",
)
CLERK_ISSUER = os.getenv("CLERK_ISSUER", "").strip().rstrip("/")
CLERK_JWKS_URL = os.getenv(
    "CLERK_JWKS_URL",
    "",
).strip() or (f"{CLERK_ISSUER}/.well-known/jwks.json" if CLERK_ISSUER else "")
CLERK_AUDIENCE = os.getenv("CLERK_AUDIENCE", "")
DEMO_MODE = os.getenv("DEMO_MODE", "false").lower() == "true"
FRONTEND_ORIGINS = os.getenv("FRONTEND_ORIGINS", "http://localhost:3000").split(",")
VALKEY_URL = os.getenv("VALKEY_URL", "redis://localhost:6379/0")

CLERK_SECRET_KEY = os.getenv("CLERK_SECRET_KEY", "").strip()
