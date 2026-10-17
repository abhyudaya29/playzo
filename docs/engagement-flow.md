# Playzo engagement flow

Discover → request → accept → chat → plan a game.

The application uses the existing shadcn/ui components with white navigation and violet accents. Requests and Messages are primary navigation entries on desktop and mobile.

## Player connections

Discover supports sport, skill, and distance filters. Connect opens a dialog with an optional introduction (500 characters). The recipient sees the pending request in Requests and receives a persisted in-app notification. Only the recipient can accept or decline. Accepted connections open a private conversation; declined requests do not create one. The sender can open the accepted chat from Discover or Requests.

Acceptance locks the request row. A unique normalized player-pair key identifies the direct conversation, and both memberships and the acceptance notification are committed with the status change. Retrying acceptance returns the same conversation. A transaction-level pair lock serializes opposite-direction connection requests.

## Communities and games

Community join actions create requests for owner/admin approval. Approving adds the member and opens the community conversation atomically. Existing members retain membership. Community chat access also checks the current community membership, rather than relying on a stale chat membership row.

Game hosts can choose immediate joining (the default) or approval of player requests. Game participation and game invitations are separate from permanent player connections. Accepting an invitation checks current availability and capacity under a game-row lock before adding the participant and chat membership. A host can invite a player using `POST /api/v1/games/{id}/invitations`.

Plan a game in a direct chat creates a scheduled game, adds the host, sends the other player an invitation, and posts the plan into the direct conversation. The invitation does not automatically enroll the player or reserve capacity. The recipient responds in Requests. Approved participants can open the game chat from Games.

## Messages and access

PostgreSQL stores messages, conversations, memberships, unread cursors, notifications, and blocks. Text messages have a 4,000-character limit. History uses keyset pagination by message ID. The composer assigns a stable client UUID to each attempted send, making retries idempotent. Read cursors only advance and cannot reference a message from a different conversation. Unread counts do not expose read receipts to other players.

Every history, detail, send, read, game-planning, and ticket endpoint validates membership and block status. Direct chats require an accepted connection. Group/game chats additionally require current participation in the corresponding resource. Guessing an ID returns 404. New-message notifications target current participants, so a removed member cannot receive new message previews.

Blocking either participant prevents new connection requests, invitations, and shared chat access, hides the blocked pair in discovery, and revokes their active shared sockets. Blocked players can be managed from Messages. Unblocking restores access to otherwise valid existing memberships and connections. A shared group or game chat is unavailable to a player while it includes someone blocked by or blocking that player.

## Live delivery

`POST /api/v1/conversations/{id}/ticket` authenticates the Clerk JWT and creates a short-lived, single-use Valkey ticket scoped to the conversation. The browser opens `WS /api/v1/ws/conversations/{id}` and sends that ticket as its first authentication frame. JWTs and tickets are not put in socket URLs. The server checks Origin, ticket consumption, membership, blocks, and token expiry. The socket expires no later than its authenticating JWT; the client obtains a fresh ticket and reconnects.

Valkey Pub/Sub distributes committed message invalidation events across API workers. PostgreSQL remains the source of truth. The client refetches authorized REST history on socket events, reconnect, focus, and a five-second visible-tab fallback. A missed transient event does not lose the message. Requests, notifications, and navigation counters refresh every ten seconds while visible.

Typing, online presence, attachments, visible read receipts, and browser push are deferred. Notifications in this release are in-app only.

## APIs

- `POST /api/v1/connections` — receiver ID, optional introduction and sport.
- `GET /api/v1/connections/requests` — player requests and connection history.
- `PATCH /api/v1/connections/{id}/accept` or `/decline`.
- `GET /api/v1/requests` — incoming/outgoing player, community, game, and invitation requests.
- `PATCH /api/v1/requests/{kind}/{id}/{accept|decline}` — `connection`, `group`, `game`, or `invitation`.
- `GET /api/v1/conversations` and `GET /api/v1/conversations/{id}`.
- `GET /api/v1/conversations/{id}/messages?before={message_id}&limit=40`.
- `POST /api/v1/conversations/{id}/messages` — body and client UUID.
- `PATCH /api/v1/conversations/{id}/read` — last read message ID.
- `POST /api/v1/conversations/{id}/games` — game details; creates an invitation.
- `POST /api/v1/conversations/{id}/ticket` and `WS /api/v1/ws/conversations/{id}`.
- `GET /api/v1/notifications`, `PATCH /api/v1/notifications/{id}/read`, and `PATCH /api/v1/notifications/read`.
- `GET /api/v1/activity` — pending request, unread message, and unread notification counts.
- `GET /api/v1/blocks`, `POST /api/v1/blocks`, and `DELETE /api/v1/blocks/{player_id}`.

## Database and local checks

Startup takes a database advisory lock, creates new tables, and applies the versioned additive migrations in `backend/app/migrations.py`. Existing connection rows gain introduction, sport, and creation time fields; games gain the approval flag. Rejected legacy connection statuses become declined. Existing accepted connections and community/game members acquire their unique conversation when opening the inbox. Existing application data is retained.

Run from the repository root:

```sh
docker compose up -d --build api
docker compose exec -T api python - < backend/tests/test_social.py
```

The integration suite uses disposable database users and removes their records. It verifies concurrent acceptance, decline behavior, authorization, message retries, unread counts, blocking, group approval, game participation, invitations, capacity, and live socket authentication/replay/revocation. Its dependency override exists only in the test process.

From `frontend`, run `npm run build` and `npm run format:check`. With a Clerk development key, local Docker, and Chromium installed, run `PLAYZO_E2E_CLEANUP=1 npm run test:e2e`. The two-player test uses Clerk test email addresses, exercises requests, bidirectional live chat, game invitations, community approval, mobile layout, and socket revocation, then removes its disposable accounts and local records.
