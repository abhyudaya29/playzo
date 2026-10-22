# Playzo implementation and deployment notes

## Scope and architecture audit

The repository uses **Next.js 15 App Router with React 19 and TypeScript**, Tailwind 4, Radix/shadcn components, Clerk, FastAPI, async SQLAlchemy, PostgreSQL/PostGIS and Valkey. It uses an explicit, checksummed SQL evolution runner, not Vite or Alembic. Celery was added for optional background maintenance and PostHog delivery.

Existing onboarding, discovery, requests, conversation authorization, blocking, group membership approval, game invitations, and deployment scripts were reused. Tournaments, staff roles, operational analytics and administration were missing.

Implementation sequence: profiles/photos → resumable onboarding/preferences/catalog → mutual discovery → tournaments and group management → staff operations/moderation/audit → optional analytics and maintenance → regression checks. All pages use the existing **indigo-and-white** tokens. `globals.css`, existing credentials and existing environment files were not edited by this implementation. The pre-existing change in `.env.release.example` belongs to the user.

## Implemented functionality

- Upload, change and remove a player photo during onboarding or profile editing. JPEG/PNG/WebP uploads are streamed with a 5 MB bound, decoded in a thread, cropped to 512×512 and re-encoded as WebP. Metadata and original bytes are discarded. Photos persist in PostgreSQL without a filesystem volume. Profile photos save immediately.
- Discovery and incoming/outgoing/accepted request cards show photos. Clicking the card, photo, name or View profile opens `/players/[userId]`; connection and chat controls remain independent. Public details include bio, sports/styles, neighbourhood, availability and participation interests. Phone, age, exact address and coordinates are excluded. Gender is shown only when explicitly public.
- Six-step onboarding with debounced and serialized server-side draft saving, explicit saves before navigation, backward navigation, a completion summary and resume. Adult eligibility is enforced on completion and participation. Existing adults with a stored age ≥18 are migrated; users without eligibility information must confirm their age eligibility.
- Backend-managed sports; independent skill and play intention per sport; multiple participation interests; explicit optional teammate preference; private/public gender; discovery visibility; availability; optional bio and existing contact/preferences. Current rollout supports India and validates Indian PIN codes. Manual entry remains available when PIN lookup or geolocation fails.
- Rule-based PostGIS player discovery with both radii, mutual preferences, active/adult/visible/completed eligibility and bilateral blocks. Scores combine sport, distance, skill and availability with validated configurable weights. No exact coordinates or hidden gender are returned or used to satisfy gender-specific filters.
- Legacy discovery preserves request/connection statuses. The new recommendation endpoint excludes existing connection records. Player, group and game list queries batch their related state rather than querying each result separately.
- Group visibility, capacity, invitation acceptance, member profiles, owner-assigned moderators and leaving groups. Private groups require invitations; invitations are limited to accepted connections and appear in Requests. Group roles remain separate from platform roles.
- Tournament drafts with creation/editing controls and an editing API, organizer applications and staff review, approval/publication/registration state transitions, capacity-protected registration, cancellation and participant lists. Only verified, active organizers can submit/publish/open tournaments. Interest in hosting does not grant privileges. Early starts and invalid transitions are rejected.
- Protected `/admin` overview, users and details, activity, groups, games, tournaments/organizers, moderation reports, analytics, settings and audit logs. APIs enforce database-backed roles. Sensitive staff actions require a reason; the UI also requires confirmation. No public role-assignment API exists.
- Report buttons on user, group, game and tournament views. Blocking and suspension are enforced on the backend. Reports are limited to ten per hour, and connection requests to thirty per hour, with database locks to prevent races around limits.
- Operational events are written in the same transaction as business changes. The registry and metadata validation reject unknown names and sensitive/unapproved fields. Reports and admin reasons stay out of analytics. Administrative audit records have a PostgreSQL trigger preventing updates/deletes.
- Live PostgreSQL operational counts, registration trends, sports/city distributions, an ordered 30-day activation funnel, distinct authenticated API usage, D1/D7/D30 API retention and an authorized, filtered CSV export capped at 10,000 rows with spreadsheet formula escaping.
- Optional PostHog Cloud SDK with explicit consent, internal backend user IDs, account/logout reset, explicit feature events, property filtering, no URL/query-string capture, no autocapture, and no session replay. Browser analytics failures are isolated from application requests.
- Consent-aware PostHog server delivery reuses operational events as a transactional outbox. Delivery uses stable event UUIDs/insert IDs, retry timestamps, ten bounded attempts and `SKIP LOCKED`. Events from before the account's latest opt-in are not delivered. A Celery worker/beat pair processes delivery and daily maintenance; PostHog is not self-hosted.

## Database changes

Apply the repository SQL evolution runner; do not edit already-applied migrations.

| Evolution | Changes |
| --- | --- |
| `005_platform_features.sql` | Extends users and sports; avatars, sports catalog, settings, organizer profiles, tournaments/registrations, reports, operational events, immutable admin audit logs and indexes. Preserves existing records and imports existing sport names. |
| `006_operational_metrics.sql` | Distinct daily authenticated users and event rollup tables. |
| `007_analytics_outbox.sql` | Account consent and operational-event delivery/retry state. |
| `008_group_management.sql` | Group visibility/capacity and invitations. |

Existing user registration dates were not stored before evolution 005. Migration timestamps are used for those records; historical registration/cohort analysis cannot reconstruct their real sign-up dates. Operational event tracking and daily usage start when these features are deployed.

Photos are served only for the current avatar version on active accounts, with `no-store` and `nosniff` headers. The image endpoint is public to permit ordinary image rendering; signed-in public-profile endpoints enforce profile/block visibility separately. Treat a player avatar as public profile content.

## New and extended APIs

All paths below are relative to `/api/v1`. `/docs` supplies the full generated OpenAPI schema.

| Area | Endpoints |
| --- | --- |
| Profile | `GET/PATCH /users/me`, `GET /users/{user_id}`, `PUT/DELETE /users/me/avatar`, `GET /avatars/{user_id}/{version}` |
| Preferences | `GET/PATCH /users/me/preferences`, `GET/PUT /users/me/sports`, `PATCH /users/me/analytics-consent` |
| Onboarding | `GET/PATCH /onboarding/me`, `POST /onboarding/complete`; compatible `PUT /users/me/onboarding` remains |
| Catalog/discovery | `GET /sports`, `GET /discovery/{players,groups,games,tournaments}`; compatible `GET /discover/players` remains |
| Groups | `GET /groups/{id}/members`, `PATCH /groups/{id}/settings`, `PATCH /groups/{id}/members/{member_id}`, `DELETE /groups/{id}/members/me`, `POST /groups/{id}/invitations`, group invitation responses through `/requests/group_invitation/{id}/{action}` |
| Games | `POST /games/{id}/transition` for authorized host cancellation/completion |
| Organizers | `GET/POST /organizers/me` |
| Tournaments | `GET/POST /tournaments`, `PATCH /tournaments/{id}`, `POST /tournaments/{id}/transition`, `POST/DELETE /tournaments/{id}/register`, `GET /tournaments/{id}/participants` |
| Reporting | `POST /reports` |
| Admin read | `GET /admin/{overview,users,activity,groups,games,tournaments,organizers,reports,settings,sports,audit-logs}`, `GET /admin/users/{id}`, `GET /admin/users/{id}/activity` |
| Admin actions | `POST /admin/users/{id}/{suspend,reactivate,restrict-discovery,restore-discovery,note}`, `POST /admin/organizers/{id}/review`, `PATCH /admin/reports/{id}`, `PATCH /admin/settings`, `PUT /admin/sports`, `GET /admin/activity/export` |
| Analytics | `GET /admin/analytics/{overview,funnel,retention}` |

The attachment's suggested frontend event-ingestion endpoint was intentionally not added: PostgreSQL accepts trusted business events, while browser feature interactions go directly to consented PostHog. Clients cannot forge operational milestones through a generic event API.

## Frontend routes

New routes: `/players/[userId]`, `/tournaments`, `/privacy`, `/admin`, `/admin/users`, `/admin/users/[userId]`, `/admin/activity`, `/admin/groups`, `/admin/games`, `/admin/tournaments`, `/admin/reports`, `/admin/analytics`, `/admin/settings`, `/admin/audit-logs`.

Existing `/onboarding`, `/dashboard`, `/requests`, `/groups` and `/games` are extended. The Clerk middleware protects the new authenticated routes; backend permission checks remain authoritative.

## Role provisioning and access

First sign into Playzo so the backend creates the user. On the trusted deployment host, run:

```sh
docker compose --env-file .env.release -f docker-compose.release.yml exec -T api \
  python -m app.provision_admin --clerk-id user_REPLACE_ME --role SUPER_ADMIN \
  --reason 'Initial administrator provisioning'
```

This host-only command records the role change in the audit trail. Never derive privileges from client-editable Clerk metadata. The same command can provision the other staff roles.

- `USER`: no admin APIs.
- `SUPPORT_AGENT`: shared staff read views and report review; cannot suspend users, change settings, verify organizers, export activity or view audit logs.
- `TOURNAMENT_MODERATOR`: shared staff read views and tournament/organizer review; cannot change platform settings, suspend users, export activity or view reports/audit logs.
- `OPERATIONS_ADMIN`: operations, moderation, tournament review, activity export and audit logs; cannot change privileged platform settings/catalog or moderate other staff.
- `SUPER_ADMIN`: all implemented administration. Other super admins require trusted host management; self-moderation and self-verification are blocked.

## PostHog setup

No PostHog project credentials or dashboard access were supplied. Cloud delivery and private dashboard creation therefore require your project configuration; no live Cloud ingestion is claimed as verified.

1. Create/select a PostHog Cloud project. Copy its **public project key** and exact ingest host. Never put personal API keys in `NEXT_PUBLIC_*` variables. Configuration follows the official [Next.js integration](https://posthog.com/docs/libraries/next-js) and [JavaScript SDK documentation](https://posthog.com/docs/libraries/js).
2. Add the optional variables in `.env.analytics.example` to your chosen deployment environment, without replacing existing values:

   | Variable | Purpose |
   | --- | --- |
   | `NEXT_PUBLIC_POSTHOG_KEY` | Public browser project key; build time. |
   | `NEXT_PUBLIC_POSTHOG_HOST` | Exact Cloud ingest host; build time. |
   | `POSTHOG_PROJECT_KEY` | Same project key for background delivery. |
   | `POSTHOG_HOST` | Same exact ingest host for server delivery. |
   | `POSTHOG_DASHBOARD_URL` | Authorized staff link to a private Cloud dashboard. |

3. In Cloud, create funnels using `user_signed_up`, `onboarding_started`, `onboarding_completed`, `discovery_opened`, `connection_requested`, `connection_accepted`, `game_joined`; create feature/retention dashboards as needed. Product events represent consenting users only. A registration before opt-in will not appear in the Cloud cohort.
4. The receiver of an accepted connection is the actor of the operational acceptance event; `entity_id` identifies the original requester internally. That entity ID is deliberately not included in Cloud properties. Use the PostgreSQL funnel for requester activation; do not assume PostHog's actor funnel measures both sides of a connection.
5. Set the private dashboard URL and grant staff separate PostHog access. Playzo never embeds personal API credentials or assumes its own roles grant Cloud access.
6. Keep replay disabled. Test consent/opt-out and inspect project events before enabling production analytics.

SDK events include login, explicit discovery/search/recommendation interactions and feature opens. Trusted domain events come from the worker, avoiding duplicate browser/server business-event emission. Server capture uses the supported [PostHog capture API](https://posthog.com/docs/api/capture).

## Deployment

No production deployment, Nginx, DNS, SSL, existing credentials or production database was changed.

Back up the production database using your existing process. Review/apply the additive evolutions using the existing deployment flow:

```sh
./deploy.sh --apply-evolutions
```

For optional PostHog delivery **and scheduled retention/rollups**, use the new overlay. Supply the required release values through your existing `.env.release` or environment:

```sh
docker compose --env-file .env.release -f docker-compose.release.yml \
  -f docker-compose.analytics.yml build

docker compose --env-file .env.release -f docker-compose.release.yml \
  -f docker-compose.analytics.yml run --rm --no-deps api python -m app.evolve

docker compose --env-file .env.release -f docker-compose.release.yml \
  -f docker-compose.analytics.yml up -d
```

The database and Valkey must already be running before `run --no-deps` (for first deployment, start `db valkey` with the same combined Compose files). Use the combined Compose files consistently on future deployments so the ordinary release command does not remove optional workers as orphans. Run one beat scheduler. The frontend image must be rebuilt when public analytics configuration changes.

The base release works without PostHog configuration. Without worker/beat (or an equivalent scheduled maintenance call), automatic retention, daily event aggregation and server Cloud delivery do not run. Maintenance can also be invoked through `app.worker.maintain()` from a trusted scheduled Python process.

After deployment check `/health`, `/docs`, Clerk sign-in, profile photo upload/read, onboarding, a connection round-trip, non-admin rejection at `/admin`, and the worker/beat logs. Live Cloud ingestion, VPS networking and deployed CORS/health need verification in the target environment.

## Validation

Validation used isolated PostGIS 16/Valkey containers on separate localhost ports, disposable test credentials, and a virtual environment under `/private/tmp`. Production credentials/databases were not used. API tests override authentication only inside their own test process; JWT verification is separately tested with ephemeral signing keys.

- Production Next.js build and TypeScript checking passed.
- Complete backend regression suite: **44 tests passed**, including connection abuse limits, host game transitions, group rejoining, new-user creation, JWT validation, PostHog retries and migration data preservation.
- Analytics unit tests: 3 passed (consent, one-time initialization, property filtering, identity changes/logout and SDK outage isolation).
- Public Playwright checks: 3 passed with installed Chrome, including mobile layout, privacy controls and new-route authentication guards.
- Legacy-data upgrade verified player fields/sports survive evolution 005–008. Existing migration checks passed repeat execution, checksum enforcement, pending detection and transactional rollback.
- Live backend regression tests covered WebSocket authorization, replay prevention, membership revocation and recovery from Pub/Sub outages.

Commands for a separately provisioned **disposable** database (the suite intentionally truncates test users and creates/drops an upgrade-test database):

```sh
cd backend
# Set DATABASE_URL to a disposable database named playzo_test; set VALKEY_URL.
python -m app.evolve
PLAYZO_DISPOSABLE_DB_TEST=1 PLAYZO_TEST_WS_BASE=ws://127.0.0.1:58001 \
  python -m unittest discover -s tests -p 'test_*.py'
PLAYZO_DISPOSABLE_DB_TEST=1 python tests/test_evolutions.py
# Start uvicorn on localhost:58001 against the same test DB for the socket test.

cd ../frontend
npm run build
npm run test:analytics
npm run test:e2e -- tests/e2e/public.spec.ts
```

The signed-in Clerk browser scenarios were updated for six-step onboarding but were not run against a live Clerk project in this session. Browser-level photo upload and staff-action flows still need an authenticated staging smoke test; their APIs are covered by integration tests.

## Remaining limitations

This is a substantial implementation of the attachment, not a claim that every suggested enterprise analytics feature is complete.

- Player discovery uses actual PostGIS distance. Group/game recommendations use shared neighbourhoods; these models lack geocoded venue coordinates. Neither endpoint fabricates venue-distance values.
- Matching ranks a bounded window of the nearest 1,000 eligible players. Dense-region discovery would benefit from moving the score calculation into SQL for deeper pagination.
- Teammate preferences are global, not sport-specific. Sports are dynamic; the legacy skill-level vocabulary remains fixed (`hobby`, `beginner`, `intermediate`, `advanced`, `pro`, displayed as Competitive). Multi-country onboarding is not implemented.
- The admin directory searches names and does not import or expose Clerk email addresses. Detailed report/moderation history is available through the report queue, activity and audit views rather than all being consolidated into the user-detail page.
- Tournament eligibility currently means adult, active accounts and valid organizer/registration state. Brackets, payments, structured results, per-sport tournament formats and additional custom eligibility rules are not implemented. Host draft editing and game completion/cancellation have dedicated controls; structured tournament results remain future work.
- Organizer verification and tournament publication review remain mandatory in this release. The approval setting currently validates to `true`; disabling review is rejected rather than silently bypassing verification.
- Overview date filters apply to registrations and their trend; operational totals are lifetime and active users use rolling windows. Selected charts and the PostgreSQL funnel/retention are implemented; median time to first connection, complete acquisition reporting, historical activity charts, and every proposed conversion chart are not.
- No abandonment event is fabricated from closing a browser tab. Server resume state exists, but a defined inactivity window/background abandonment rule is still needed for that metric.
- Operational history is capped at 180 days when maintenance runs. Audit logs remain append-only and do not currently have an archival/export workflow. Daily aggregates are generated, while the initial views query indexed source records.
- Cloud dashboard creation and actual ingestion require your PostHog project configuration. Exhausted deliveries stop after ten attempts and require operator review. Revoking consent prevents future sends; erasing previously collected Cloud data requires a separate privacy-request workflow.

## File-change inventory

The pre-existing `.env.release.example` modification is excluded.

- `.env.analytics.example`
- `backend/app/dependencies.py`
- `backend/app/main.py`
- `backend/app/models.py`
- `backend/app/participation.py`
- `backend/app/provision_admin.py`
- `backend/app/routes/activity.py`
- `backend/app/routes/admin.py`
- `backend/app/routes/catalog.py`
- `backend/app/routes/connections.py`
- `backend/app/routes/conversations.py`
- `backend/app/routes/discovery.py`
- `backend/app/routes/games.py`
- `backend/app/routes/group_management.py`
- `backend/app/routes/groups.py`
- `backend/app/routes/onboarding.py`
- `backend/app/routes/reports.py`
- `backend/app/routes/requests.py`
- `backend/app/routes/tournaments.py`
- `backend/app/routes/users.py`
- `backend/app/schemas.py`
- `backend/app/services/avatars.py`
- `backend/app/services/matching.py`
- `backend/app/services/platform.py`
- `backend/app/social.py`
- `backend/app/worker.py`
- `backend/evolutions/005_platform_features.sql`
- `backend/evolutions/006_operational_metrics.sql`
- `backend/evolutions/007_analytics_outbox.sql`
- `backend/evolutions/008_group_management.sql`
- `backend/requirements.txt`
- `backend/tests/test_jwt_verification.py`
- `backend/tests/test_platform.py`
- `backend/tests/test_platform_api.py`
- `backend/tests/test_platform_upgrade.py`
- `backend/tests/test_social.py`
- `docker-compose.analytics.yml`
- `docs/platform-implementation.md`
- `frontend/Dockerfile`
- `frontend/next-env.d.ts`
- `frontend/package-lock.json`
- `frontend/package.json`
- `frontend/src/app/(app)/admin/[[...section]]/page.tsx`
- `frontend/src/app/(app)/admin/layout.tsx`
- `frontend/src/app/(app)/dashboard/page.tsx`
- `frontend/src/app/(app)/games/page.tsx`
- `frontend/src/app/(app)/groups/page.tsx`
- `frontend/src/app/(app)/onboarding/page.tsx`
- `frontend/src/app/(app)/players/[userId]/page.tsx`
- `frontend/src/app/(app)/requests/page.tsx`
- `frontend/src/app/(app)/tournaments/page.tsx`
- `frontend/src/app/layout.tsx`
- `frontend/src/app/privacy/page.tsx`
- `frontend/src/components/AdminPanels.tsx`
- `frontend/src/components/AnalyticsProvider.tsx`
- `frontend/src/components/GameStatusControls.tsx`
- `frontend/src/components/GroupManagement.tsx`
- `frontend/src/components/PlayerPhoto.tsx`
- `frontend/src/components/ProfilePhotoUpload.tsx`
- `frontend/src/components/ReportButton.tsx`
- `frontend/src/components/ScheduleGameDialog.tsx`
- `frontend/src/components/Shell.tsx`
- `frontend/src/lib/analytics.ts`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/player-options.ts`
- `frontend/src/lib/social-types.ts`
- `frontend/src/lib/types.ts`
- `frontend/src/lib/use-sports.ts`
- `frontend/src/middleware.ts`
- `frontend/tests/analytics.test.cjs`
- `frontend/tests/e2e/public.spec.ts`
- `frontend/tests/helpers/social-actor.ts`
