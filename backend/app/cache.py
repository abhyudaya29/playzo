from redis.asyncio import Redis

from app.config import VALKEY_URL

valkey = Redis.from_url(VALKEY_URL, decode_responses=True)
