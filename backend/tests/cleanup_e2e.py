"""Remove records for one disposable Clerk development account.

The test runner first verifies the exact test email through Clerk's Backend API.
This helper must never be used as an application endpoint.
"""

import asyncio
import sys

from sqlalchemy import delete, select

from app.database import Session
from app.models import (
    Conversation,
    ConversationMember,
    Connection,
    Game,
    GameParticipant,
    Group,
    GroupMember,
    Location,
    Sport,
    User,
)


async def cleanup(clerk_id: str) -> None:
    async with Session() as db:
        user = (
            await db.execute(select(User).where(User.clerk_id == clerk_id))
        ).scalar_one_or_none()
        if not user:
            return
        assert user.name in (
            "Player",
            "Playzo Test",
        ), "Refusing to delete a non-test profile"
        room_ids = select(ConversationMember.conversation_id).where(
            ConversationMember.user_id == user.id
        )
        await db.execute(delete(Conversation).where(Conversation.id.in_(room_ids)))
        games = select(Game.id).where(Game.host_id == user.id)
        groups = select(Group.id).where(Group.owner_id == user.id)
        await db.execute(
            delete(GameParticipant).where(
                (GameParticipant.user_id == user.id)
                | GameParticipant.game_id.in_(games)
            )
        )
        await db.execute(
            delete(GroupMember).where(
                (GroupMember.user_id == user.id) | GroupMember.group_id.in_(groups)
            )
        )
        await db.execute(delete(Game).where(Game.host_id == user.id))
        await db.execute(delete(Group).where(Group.owner_id == user.id))
        await db.execute(
            delete(Connection).where(
                (Connection.requester_id == user.id)
                | (Connection.receiver_id == user.id)
            )
        )
        await db.execute(delete(Sport).where(Sport.user_id == user.id))
        await db.execute(delete(Location).where(Location.user_id == user.id))
        await db.delete(user)
        await db.commit()


if __name__ == "__main__":
    asyncio.run(cleanup(sys.argv[1]))
