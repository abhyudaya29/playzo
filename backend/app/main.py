from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.cache import valkey
from app.config import FRONTEND_ORIGINS
from app.database import engine
from app.routes.connections import router as connections_router
from app.routes.conversations import router as conversations_router
from app.routes.requests import router as requests_router
from app.routes.activity import router as activity_router
from app.routes.discovery import router as discovery_router
from app.routes.games import router as games_router
from app.routes.groups import router as groups_router
from app.routes.health import router as health_router
from app.routes.locations import router as locations_router
from app.routes.users import router as users_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await valkey.aclose()
    await engine.dispose()


app = FastAPI(title="playhud API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(locations_router)
app.include_router(users_router)
app.include_router(discovery_router)
app.include_router(connections_router)
app.include_router(groups_router)
app.include_router(games_router)

app.include_router(conversations_router)
app.include_router(requests_router)
app.include_router(activity_router)

from app.routes import admin, catalog, onboarding, reports, tournaments
app.include_router(admin.router)
app.include_router(catalog.router)
app.include_router(onboarding.router)
app.include_router(reports.router)
app.include_router(tournaments.router)

from app.routes.group_management import router as group_management_router
app.include_router(group_management_router)

from app.routes.profile_posts import router as profile_posts_router
app.include_router(profile_posts_router)
