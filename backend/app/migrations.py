"""Additive, versioned upgrades for the existing prototype database."""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

MIGRATIONS = [
    (
        "002_chat_history_indexes",
        [
            "CREATE INDEX IF NOT EXISTS ix_messages_conversation_history ON messages (conversation_id, id)",
            "CREATE INDEX IF NOT EXISTS ix_conversation_members_user ON conversation_members (user_id)",
            "CREATE INDEX IF NOT EXISTS ix_notifications_unread ON notifications (user_id, is_read)",
        ],
    ),
    (
        "001_connections_and_game_approval",
        [
            "ALTER TABLE connections ADD COLUMN IF NOT EXISTS introduction VARCHAR(500)",
            "ALTER TABLE connections ADD COLUMN IF NOT EXISTS sport VARCHAR(60)",
            "ALTER TABLE connections ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now()",
            "ALTER TABLE games ADD COLUMN IF NOT EXISTS approval_required BOOLEAN NOT NULL DEFAULT false",
            "UPDATE connections SET status = 'declined' WHERE status = 'rejected'",
        ],
    ),
]


async def migrate(conn: AsyncConnection) -> None:
    await conn.execute(
        text(
            "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
        )
    )
    for version, statements in sorted(MIGRATIONS):
        applied = await conn.scalar(
            text("SELECT 1 FROM schema_migrations WHERE version=:version"),
            {"version": version},
        )
        if applied:
            continue
        for statement in statements:
            await conn.execute(text(statement))
        await conn.execute(
            text("INSERT INTO schema_migrations(version) VALUES (:version)"),
            {"version": version},
        )
