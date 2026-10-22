"""Integration checks against local PostgreSQL/Valkey, using disposable users.

Run: docker compose exec -T api python - < backend/tests/test_social.py
The auth override exists only in this test process; live API auth is unchanged.
"""

import asyncio
import os
import hashlib
import json
import secrets
import time

from websockets import connect as open_socket
from websockets.exceptions import ConnectionClosed
from datetime import datetime, timedelta, timezone
import unittest
import uuid
from unittest.mock import patch, AsyncMock

import httpx
from fastapi import Header
from sqlalchemy import delete, func, select

from app.cache import valkey
from app.database import Session, engine
from app.evolve import evolve
from app.dependencies import auth_sub
from app.main import app
from app.models import (
    Connection,
    Conversation,
    ConversationMember,
    Game,
    GameInvitation,
    GameParticipant,
    Group,
    GroupMember,
    Location,
    MembershipRequest,
    Message,
    Notification,
    Sport,
    User,
    UserBlock,
)


class SocialTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        await evolve(check=True)
        self.ids = []
        self.subjects = []
        async with Session() as db:
            for name in ("Sender", "Recipient", "Outsider"):
                user = User(
                    clerk_id="social-test-" + str(uuid.uuid4()),
                    name="Social Test " + name,
                    adult_confirmed=True,
                    onboarding_completed=True,
                )
                db.add(user)
                await db.flush()
                self.ids.append(user.id)
                self.subjects.append(user.clerk_id)
            await db.commit()

        async def subject(x_test_user: str = Header(...)):
            return x_test_user

        app.dependency_overrides[auth_sub] = subject
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        )

    async def asyncTearDown(self):
        await self.client.aclose()
        app.dependency_overrides.pop(auth_sub, None)
        async with Session() as db:
            room_ids = select(ConversationMember.conversation_id).where(
                ConversationMember.user_id.in_(self.ids)
            )
            await db.execute(delete(Conversation).where(Conversation.id.in_(room_ids)))
            await db.execute(
                delete(Connection).where(
                    Connection.requester_id.in_(self.ids)
                    | Connection.receiver_id.in_(self.ids)
                )
            )
            await db.execute(
                delete(GameParticipant).where(GameParticipant.user_id.in_(self.ids))
            )
            await db.execute(
                delete(GroupMember).where(GroupMember.user_id.in_(self.ids))
            )
            await db.execute(delete(Game).where(Game.host_id.in_(self.ids)))
            await db.execute(delete(Group).where(Group.owner_id.in_(self.ids)))
            await db.execute(delete(User).where(User.id.in_(self.ids)))
            await db.commit()
        await valkey.aclose()
        await engine.dispose()

    async def call(self, method, path, actor=0, expected=200, **kwargs):
        response = await self.client.request(
            method,
            "/api/v1" + path,
            headers={"x-test-user": self.subjects[actor]},
            **kwargs,
        )
        self.assertEqual(
            response.status_code, expected, f"{method} {path}: {response.text}"
        )
        return response.json()

    async def connect(self):
        entry = await self.call(
            "POST",
            "/connections",
            json={
                "receiver_id": self.ids[1],
                "introduction": "Weekend badminton?",
                "sport": "Badminton",
            },
        )
        result = await self.call("PATCH", f"/connections/{entry['id']}/accept", actor=1)
        return entry, result["conversation_id"]

    async def test_acceptance_is_atomic_idempotent_and_private(self):
        entry = await self.call(
            "POST",
            "/connections",
            json={"receiver_id": self.ids[1], "introduction": "Hello"},
        )
        await self.call(
            "POST",
            "/connections",
            actor=1,
            json={"receiver_id": self.ids[0]},
            expected=409,
        )
        await self.call(
            "PATCH", f"/connections/{entry['id']}/accept", actor=2, expected=404
        )
        rooms = await self.call("GET", "/conversations")
        self.assertEqual(rooms, [])
        first, second = await asyncio.gather(
            self.call("PATCH", f"/connections/{entry['id']}/accept", actor=1),
            self.call("PATCH", f"/connections/{entry['id']}/accept", actor=1),
        )
        self.assertEqual(first["conversation_id"], second["conversation_id"])
        room_id = first["conversation_id"]
        await self.call(
            "GET", f"/conversations/{room_id}/messages", actor=2, expected=404
        )
        await self.call(
            "POST",
            f"/conversations/{room_id}/messages",
            actor=2,
            json={"body": "Intrusion", "client_id": str(uuid.uuid4())},
            expected=404,
        )
        async with Session() as db:
            self.assertEqual(
                await db.scalar(
                    select(func.count())
                    .select_from(Conversation)
                    .where(Conversation.id == room_id)
                ),
                1,
            )
            self.assertEqual(
                await db.scalar(
                    select(func.count())
                    .select_from(Notification)
                    .where(
                        Notification.user_id == self.ids[0],
                        Notification.kind == "connection_accepted",
                    )
                ),
                1,
            )
        await self.call(
            "PATCH", f"/connections/{entry['id']}/decline", actor=1, expected=409
        )

    async def test_decline_does_not_open_a_chat(self):
        entry = await self.call(
            "POST", "/connections", json={"receiver_id": self.ids[1]}
        )
        await self.call("PATCH", f"/connections/{entry['id']}/decline", actor=1)
        self.assertEqual(await self.call("GET", "/conversations"), [])
        self.assertEqual((await self.call("GET", "/requests"))[0]["status"], "declined")

    async def test_message_history_read_counts_retries_and_blocks(self):
        _, room_id = await self.connect()
        payload = {"body": "Saturday at six?", "client_id": str(uuid.uuid4())}
        message = await self.call(
            "POST", f"/conversations/{room_id}/messages", json=payload
        )
        duplicate = await self.call(
            "POST", f"/conversations/{room_id}/messages", json=payload
        )
        self.assertEqual(message["id"], duplicate["id"])
        await self.call(
            "POST",
            f"/conversations/{room_id}/messages",
            json={**payload, "body": "Different text"},
            expected=409,
        )
        await self.call(
            "POST",
            f"/conversations/{room_id}/messages",
            json={"body": "   ", "client_id": str(uuid.uuid4())},
            expected=422,
        )
        self.assertEqual((await self.call("GET", "/activity", actor=1))["messages"], 1)
        history = await self.call("GET", f"/conversations/{room_id}/messages", actor=1)
        self.assertEqual(len(history["messages"]), 1)
        await self.call(
            "PATCH",
            f"/conversations/{room_id}/read",
            actor=1,
            json={"last_read_message_id": message["id"]},
        )
        self.assertEqual((await self.call("GET", "/activity", actor=1))["messages"], 0)
        await self.call("POST", "/blocks", actor=1, json={"blocked_id": self.ids[0]})
        for actor in (0, 1):
            await self.call(
                "GET", f"/conversations/{room_id}/messages", actor=actor, expected=404
            )
            self.assertEqual(await self.call("GET", "/conversations", actor=actor), [])
            await self.call(
                "POST",
                f"/conversations/{room_id}/messages",
                actor=actor,
                json={"body": "Blocked message", "client_id": str(uuid.uuid4())},
                expected=404,
            )
        await self.call("DELETE", f"/blocks/{self.ids[0]}", actor=1)
        self.assertEqual(
            len(
                (await self.call("GET", f"/conversations/{room_id}/messages"))[
                    "messages"
                ]
            ),
            1,
        )

    async def test_live_socket_authentication_replay_and_block_revocation(self):
        _, room_id = await self.connect()

        async def ticket(user_id):
            token = secrets.token_urlsafe(32)
            key = hashlib.sha256(token.encode()).hexdigest()
            await valkey.set(
                "ws-ticket:" + key,
                json.dumps(
                    {
                        "user_id": user_id,
                        "conversation_id": room_id,
                        "expires_at": int(time.time()) + 60,
                    }
                ),
                ex=60,
            )
            return token

        url = os.getenv("PLAYZO_TEST_WS_BASE", "ws://127.0.0.1:8000") + f"/api/v1/ws/conversations/{room_id}"
        unauthorized = await ticket(self.ids[2])
        async with open_socket(url, origin="http://localhost:3000") as socket:
            await socket.send(
                json.dumps({"type": "authenticate", "ticket": unauthorized})
            )
            with self.assertRaises(ConnectionClosed) as caught:
                await asyncio.wait_for(socket.recv(), 5)
            self.assertEqual(caught.exception.rcvd.code, 4403)
        valid = await ticket(self.ids[1])
        async with open_socket(url, origin="http://localhost:3000") as socket:
            await socket.send(json.dumps({"type": "authenticate", "ticket": valid}))
            self.assertEqual(
                json.loads(await asyncio.wait_for(socket.recv(), 5))["type"], "ready"
            )
            await self.call(
                "POST",
                f"/conversations/{room_id}/messages",
                json={"body": "Live message", "client_id": str(uuid.uuid4())},
            )
            event = json.loads(await asyncio.wait_for(socket.recv(), 5))
            self.assertEqual(event["type"], "message.created")
            async with open_socket(url, origin="http://localhost:3000") as replay:
                await replay.send(json.dumps({"type": "authenticate", "ticket": valid}))
                with self.assertRaises(ConnectionClosed) as caught:
                    await asyncio.wait_for(replay.recv(), 5)
                self.assertEqual(caught.exception.rcvd.code, 4401)
            await self.call(
                "POST", "/blocks", actor=1, json={"blocked_id": self.ids[0]}
            )
            with self.assertRaises(ConnectionClosed) as caught:
                await asyncio.wait_for(socket.recv(), 5)
            self.assertEqual(caught.exception.rcvd.code, 4403)

    async def test_group_approval_and_removed_membership(self):
        group = await self.call(
            "POST",
            "/groups",
            json={"name": "Social Test Community", "sport": "Badminton"},
        )
        joined = await self.call("POST", f"/groups/{group['id']}/join", actor=1)
        self.assertEqual(joined["status"], "pending")
        await self.call(
            "GET",
            f"/conversations/{group['conversation_id']}/messages",
            actor=1,
            expected=404,
        )
        await self.call(
            "PATCH",
            f"/requests/group/{joined['request_id']}/accept",
            actor=2,
            expected=404,
        )
        approved = await self.call(
            "PATCH", f"/requests/group/{joined['request_id']}/accept"
        )
        repeated = await self.call(
            "PATCH", f"/requests/group/{joined['request_id']}/accept"
        )
        self.assertEqual(approved["conversation_id"], repeated["conversation_id"])
        await self.call(
            "POST",
            f"/conversations/{approved['conversation_id']}/messages",
            actor=1,
            json={"body": "I’m in!", "client_id": str(uuid.uuid4())},
        )
        async with Session() as db:
            await db.execute(
                delete(GroupMember).where(
                    GroupMember.group_id == group["id"],
                    GroupMember.user_id == self.ids[1],
                )
            )
            await db.commit()
        await self.call(
            "GET",
            f"/conversations/{approved['conversation_id']}/messages",
            actor=1,
            expected=404,
        )
        notices_before = len(await self.call("GET", "/notifications", actor=1))
        await self.call(
            "POST",
            f"/conversations/{approved['conversation_id']}/messages",
            json={"body": "Members only", "client_id": str(uuid.uuid4())},
        )
        self.assertEqual(
            len(await self.call("GET", "/notifications", actor=1)), notices_before
        )

    def game(self, **overrides):
        return {
            "title": "Social Test Game",
            "sport": "Badminton",
            "venue": "Test court",
            "starts_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            "capacity": 2,
            **overrides,
        }

    async def test_game_invitations_capacity_and_chat_planning(self):
        _, room_id = await self.connect()
        result = await self.call(
            "POST", f"/conversations/{room_id}/games", json=self.game()
        )
        self.assertEqual(
            (await self.call("GET", "/requests", actor=1))[0]["kind"], "invitation"
        )
        self.assertEqual(await self.call("GET", "/connections", actor=2), [])
        accepted = await self.call(
            "PATCH", f"/requests/invitation/{result['invitation_id']}/accept", actor=1
        )
        await self.call(
            "GET", f"/conversations/{accepted['conversation_id']}/messages", actor=1
        )
        await self.call(
            "POST", f"/games/{result['game_id']}/join", actor=2, expected=409
        )
        repeated = await self.call(
            "PATCH", f"/requests/invitation/{result['invitation_id']}/accept", actor=1
        )
        self.assertEqual(repeated["conversation_id"], accepted["conversation_id"])
        await self.call(
            "POST",
            f"/games/{result['game_id']}/invitations",
            actor=1,
            json={"receiver_id": self.ids[2]},
            expected=409,
        )
        await self.call(
            "GET",
            f"/conversations/{accepted['conversation_id']}/messages",
            actor=2,
            expected=404,
        )

    async def test_history_pagination_survives_a_pubsub_outage(self):
        _, room_id = await self.connect()
        sent = []
        for number in range(3):
            with patch(
                "app.social.valkey.publish",
                AsyncMock(side_effect=ConnectionError("Test outage")),
            ):
                sent.append(
                    await self.call(
                        "POST",
                        f"/conversations/{room_id}/messages",
                        json={
                            "body": f"Message {number}",
                            "client_id": str(uuid.uuid4()),
                        },
                    )
                )
        first = await self.call(
            "GET", f"/conversations/{room_id}/messages?limit=2", actor=1
        )
        second = await self.call(
            "GET",
            f"/conversations/{room_id}/messages?limit=2&before={first['next_before']}",
            actor=1,
        )
        self.assertEqual(
            [item["id"] for item in second["messages"] + first["messages"]],
            [item["id"] for item in sent],
        )
        self.assertIsNone(second["next_before"])

    async def test_concurrent_players_cannot_take_the_same_last_spot(self):
        game = await self.call("POST", "/games", json=self.game())
        results = await asyncio.gather(
            *[
                self.client.post(
                    "/api/v1/games/" + game["id"] + "/join",
                    headers={"x-test-user": self.subjects[actor]},
                )
                for actor in (1, 2)
            ]
        )
        self.assertEqual(
            sorted(response.status_code for response in results), [200, 409]
        )

    async def test_game_approval_without_player_connection(self):
        game = await self.call("POST", "/games", json=self.game(approval_required=True))
        pending = await self.call("POST", f"/games/{game['id']}/join", actor=2)
        self.assertEqual(pending["status"], "pending")
        result = await self.call(
            "PATCH", f"/requests/game/{pending['request_id']}/accept"
        )
        await self.call(
            "GET", f"/conversations/{result['conversation_id']}/messages", actor=2
        )
        self.assertEqual(await self.call("GET", "/connections", actor=2), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
