# playhud — sports matchmaking prototype

Next.js + Clerk + FastAPI + PostGIS + Valkey. The frontend uses shadcn/ui, Radix primitives, and Tailwind CSS with a shared neutral/violet design system.

## Deploy a release

On a server with Docker Engine and Docker Compose v2 (with `up --wait` support):

```bash
cp .env.release.example .env.release
# Fill in the release database password, Clerk keys, and public URLs.
chmod 600 .env.release
./deploy.sh --check
./deploy.sh
```

The script requires a clean checkout, pulls the current branch with `git pull --ff-only`, builds the frontend and API, starts PostGIS and Valkey, asks `Apply pending SQL evolutions? [y/n]`, and waits for all services to become healthy. Choosing `n` verifies the schema is current and stops deployment if SQL is pending. Run it again to release updates. Use `--skip-pull` to deploy the current checkout. Non-interactive deployments must pass `--apply-evolutions` or `--skip-evolutions`. Use `--env-file PATH` or `--project-name NAME` to override the defaults. Keep the same project name between releases so the database volumes are reused. The default `playzo-release` project has separate volumes from local development; existing development records are not copied into it.

Terminate HTTPS with a host reverse proxy: route the frontend domain to `127.0.0.1:3001` and the API domain to `127.0.0.1:8001`. Forward WebSocket upgrades on the API domain for chat and forward the original host/protocol headers. Configure the same frontend domain in Clerk and `FRONTEND_ORIGINS`. The script deploys to the current Docker host; it does not upload code, configure DNS/TLS, or push images to a registry.

If existing endpoints such as `/api/v1/users/me` work while `/api/v1/sports` or `PATCH /api/v1/users/me/analytics-consent` return `404`, check the running API version. These routes are registered in this checkout. CORS can return `200` to `OPTIONS` even for missing endpoints. Deploy the updated API as well as the frontend with `./deploy.sh --apply-evolutions` (or `--skip-pull --apply-evolutions` for changes already on the host). For local development, run `docker compose up -d --build api`. Restarting an old container alone does not rebuild its code.

The release script now compares all HTTP routes in the built API image with the running service's `/openapi.json` before reporting success. If the public API still differs, verify the API domain's reverse proxy targets the release port (`8001` by default), rather than a separate development API on `8000`. You can also run the comparison against your public API from the host: `cd backend && python -m app.check_routes --url https://YOUR_API_DOMAIN`.

`NEXT_PUBLIC_*` settings are embedded during the frontend build. Clerk's secret key is passed only at runtime. SQL evolutions run explicitly through `./evolve.sh`; API startup never changes the schema. Back up the release database before updates: migrations are additive, but a failed health check does not automatically roll back images or schema. Changing `POSTGRES_PASSWORD` in the environment does not rotate the password of an existing database volume. Never run `down -v` against release data.

Inspect a release with:

```bash
docker compose -p playzo-release --env-file .env.release -f docker-compose.release.yml logs --tail=100
```

## Features
- Custom shadcn/ui sign-up and sign-in forms backed by Clerk, with email-code verification and password reset
- PIN lookup, approximate location capture, multiple sports with individual skill levels
- Nearby player discovery with PostGIS and configurable 1–30 km radius
- Player requests with introductions, accept/decline actions, private conversations, and in-app notifications
- Community join approvals, optional game approval, game invitations, and membership-based group/game chats
- Real-time text chat through authenticated WebSockets and Valkey Pub/Sub, with PostgreSQL message history
- Private residential address (never exposed in discovery results)

## Run locally

Prerequisites: Node 20.9+, Python 3.12+ or Docker, Docker Compose.

1. Copy `.env.example` to `.env` and set `CLERK_ISSUER` for your existing Clerk application.
2. Copy `frontend/.env.example` to `frontend/.env.local` and set Clerk publishable/secret keys from the **existing** application dashboard. Never commit secrets.
3. `docker compose up -d db valkey`, then `docker compose build api`, `./evolve.sh`, and `docker compose up -d api`.
4. `cd frontend && npm install && npm run dev`.
5. Open http://localhost:3000, sign up and complete onboarding.
6. API docs at http://localhost:8000/docs.

If the API image build times out downloading packages, or reports `asyncpg (from versions: none)` after slow PyPI lookups, retry with `docker compose --progress plain build api`. Python 3.12 on Apple Silicon is supported; a failed package-index request can prevent pip from discovering compatible versions. The build caches downloaded packages between attempts. Keep the cache when retrying. If failures continue, check your network/VPN/proxy access to both `pypi.org` and `files.pythonhosted.org`. After a successful build, run `./evolve.sh` and `docker compose up -d api`.

To use an existing local Python environment with the backend requirements installed, run only the database/cache in Docker and start the API from source:

```bash
docker compose up -d db valkey
# Activate your Python environment first.
python backend/run_local.py --evolve
python backend/run_local.py
```

The local runner loads Clerk settings from the root `.env` and connects to the Docker database on port `5433` and cache on `6379`. Stop any other API on port `8000` before using it. This avoids Docker image downloads when the Python dependencies are already installed locally.

Use email/password and Google for Clerk authentication. Enable first and last name fields in Clerk's User model. In Clerk's Phone settings, disable phone sign-up, required phone numbers, sign-in with phone, and SMS authentication/MFA. Collect phone numbers only in onboarding: playhud saves them privately on the profile as unverified contact details, without adding them to Clerk or sending an SMS. Phone verification is deferred. Local Indian mobile numbers are stored with `+91`; other numbers need their country code.

For sign-up email verification, enable **Email verification code** in Clerk's Email settings and deselect **Email verification link**. The custom form explicitly requests the `email_code` strategy and only activates a session after Clerk confirms completion. A pending sign-up can resume code verification. Old email-link callback URLs offer the code flow and account navigation. Sign-in supports email-code Device Trust, authenticator/backup-code MFA, and password reset by email code.

The backend issuer must match the frontend Clerk instance: use `https://<your Frontend API host>` for `CLERK_ISSUER` in the root `.env`. `CLERK_JWKS_URL` can be empty; it defaults to `<issuer>/.well-known/jwks.json`. Restart the API after changing environment settings with `docker compose up -d --build api`. The issuer is never inferred from an incoming user token.

## Frontend structure and checks

- `frontend/src/components/ui`: official shadcn/ui components, configured by `components.json`.
- `frontend/src/components`: shared workspace shell, auth forms, page headers, loading/error/empty states, and field components.
- `frontend/src/app/(app)`: dashboard, communities, games, and profile, with a persistent layout. Public URLs remain `/dashboard`, `/groups`, `/games`, and `/onboarding`.
- `frontend/src/lib/use-resource.ts`: account-scoped response cache, background refresh, and stale-response protection.
- Development writes to `.next-dev`; production builds write to `.next` so they can run independently.

From `frontend`, run `npm run format:check` and `npm run build`. For browser checks, install Chromium with `npx playwright install chromium`, start the API, and run `npm run test:e2e`. The public tests cover desktop/mobile forms and recovery navigation. To include real email-code authentication, onboarding, retry behavior, saved preferences, community/game creation, password reset, and navigation, run `PLAYZO_E2E_CLEANUP=1 npm run test:e2e` with a Clerk development secret key in `.env.local` and local Docker running. The test uses Clerk's `+clerk_test` addresses without delivering real emails, and removes its exact disposable account and database records afterward. An existing Chromium binary can be supplied with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

Run the auth configuration regression checks from the project root with `docker compose exec -T api python - < backend/tests/test_auth_config.py`.

**Clerk application already selected:** `app_3KphwCYcmmp8PpEhBWdAYqQx5be`. Configure its keys manually, or on your own machine run `npx -y clerk@latest auth login` and `npx -y clerk@latest init --app app_3KphwCYcmmp8PpEhBWdAYqQx5be` if setting up a fresh project without Clerk. This repository already has Clerk integrated, so prefer adding the existing keys rather than running `init` again.

Clerk JWTs are verified by FastAPI against your issuer's JWKS. For production, configure allowed audiences/authorized parties and session token templates as appropriate. Do not use mock authentication in production.

## Profile photos and Cloudinary

Completed profiles open in three tabs: **Photos & posts**, **Personal info**, and **Sports & settings**. The signup flow remains a guided setup. Photos appear with captions in the player detail view; phone numbers and exact addresses remain private.

Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in the root `.env` for local development, or `.env.release` for releases. These are backend settings; never put the API secret in a `NEXT_PUBLIC_*` variable. Uploads use the [signed Cloudinary Upload API](https://cloudinary.com/documentation/image_upload_api_reference#upload), so no unsigned upload preset or frontend Cloudinary SDK is required. Apply `010_profile_posts.sql` with the evolution runner and restart the API after changing credentials. The local Python runner can apply it with `python backend/run_local.py --evolve`.

Each player can add up to 12 JPEG, PNG, or WebP photo posts, up to 10 MB each, with an optional 500-character caption. The API validates file signatures and sizes, signs requests on the server, and stores the resulting Cloudinary image URL and asset identifier. Removing a post deletes its Cloudinary asset with CDN invalidation before removing the database entry. Uploads stay unavailable when credentials are missing; the other profile tabs continue to work.

Public profile responses include photos only after checking profile visibility and blocking. Cloudinary delivery URLs are public CDN URLs; hiding a profile prevents API discovery but does not revoke an image URL that someone already knows.

## Guest playground and landing activity

The landing page's **Try the playground** button opens `/playground` without authentication. Visitors move through four short steps: players/communities/games, optional gender, sport and skill level, then location. Back navigation preserves selections, and gender can be skipped. They can use an approximate device location, enter an Indian PIN code, or explore demo cards without sharing a location. Demo cards use one disclosure above the results, including when no public matches are available; they are never described as real nearby members. Device coordinates are rounded before the request. Live location fills the area summary and PIN field when available. Area names use Nominatim through a cached backend proxy: at most one upstream request every two seconds, a 24-hour cache, identifying User-Agent, and visible OpenStreetMap attribution. The public service is for moderate, user-triggered usage under its [usage policy](https://operations.osmfoundation.org/policies/nominatim/); set backend `REVERSE_GEOCODING_URL` to switch to a compatible hosted provider as traffic grows. An unavailable area lookup does not block coordinate-based recommendations. PIN previews match the PIN-code area; community/game previews are based on the host's neighborhood, so visitors should confirm the actual venue after signup.

The public API returns at most six previews per request and limits anonymous requests through Valkey. It does not return phone numbers, exact coordinates/venues, private profile details, conversations, or photo posts. Existing profiles are excluded until their owner enables **Show a preview in the guest playground** under **Your profile → Sports & settings**. Previews also require active, completed, discoverable profiles. Private communities, full/past/cancelled games, and unconsented hosts are excluded.

Connect and join actions render the same signup form used on the signup page directly in the playground, before submitting any participation requests. Guest choices and the intended destination are retained in this tab for up to one hour, carried into initial onboarding, and cleared after completion. Authenticated participation endpoints retain their existing authentication and authorization checks.

Landing activity toasts interleave genuine recent signup, accepted-connection, and public-community events from opted-in players with named demo stories. Demo stories have a small disclosure and no invented event timestamps; genuine events show their actual age. They can be dismissed for the tab session, pause while hovered/focused or when the page is hidden, and stop after three appearances.

Apply `011_guest_playground.sql` and restart the API to enable the guest endpoints. Locally, use `python backend/run_local.py --evolve` from the existing backend Python environment. No extra service credentials or frontend packages are needed. The local runner and development Compose configuration allow frontend ports 3000 and 3001.

## Demo data

To seed nearby players, create multiple Clerk test accounts, onboard each with locations and sports, then log in as one account to see others. No real users or fictitious player identities are preloaded automatically.

## Important prototype limitations

- External PIN-code and approximate geocoding services require internet connectivity and may be rate-limited. For production use a licensed geocoding provider or local dataset.
- The app currently shows public groups and upcoming games without distance filtering. Add group/game geo-points before launch.
- Phone numbers are collected only during onboarding and remain unverified. No phone login or SMS verification flow is implemented.
- In-app notifications are implemented; browser push, typing indicators, online presence, attachments, and visible read receipts are deferred.
- Schema changes live in numbered SQL files under `backend/evolutions/` and run explicitly with `./evolve.sh`.
- Add blocking/reporting, abuse controls, observability, consent handling and proper authorization policies before a public launch.
- Configure a production-grade secret, backups, HTTPS, CORS and rate limits before deployment.

See [the engagement flow](docs/engagement-flow.md) for requests, chats, invitations, authorization, migrations, and test commands.

## Player profile and skill levels

New accounts complete five steps across desktop, mobile, and PWA: gender (optional), how they want to play, neighbourhood, sports and skill levels, then optional nickname, phone number, and bio. The final step saves the profile directly. Other preferences and languages can be edited later from Your profile. Framer Motion animates the question transitions and respects reduced-motion preferences. The play preference (`join_individually`, `find_group`, or `host_games`) sends players to Discover, Communities, or Games after onboarding. Existing drafts on the removed review step resume at the final details step.

Onboarding supports optional nickname, age, gender, languages, and a reason for joining: starting out, making a comeback, trying a new sport, or playing for fun. These details are editable from Your profile. Age, gender, and contact details remain private. Choose a level for each sport: Hobby, Beginner, Intermediate, Advanced, or Pro. Discovery supports all five levels; existing profiles keep their saved levels.

## SQL evolutions (no Alembic)

Create a new `NNN_description.sql` in `backend/evolutions/` for every schema change. Files execute in filename order, each in a transaction, under a database advisory lock. Successful versions and SHA-256 checksums are recorded in `schema_migrations`; changed applied files fail validation. Do not edit applied SQL. The initial evolution creates fresh databases and can adopt existing prototype tables; versions recorded by the previous Python runner remain recognized. Back up existing data before evolving a release database.

```bash
# Local: start db and build api first
./evolve.sh
./evolve.sh -- --check

# Release: start db and build api first, or use deploy.sh
./evolve.sh --project-name playzo-release --env-file .env.release -f docker-compose.release.yml
./deploy.sh --apply-evolutions
```

## Installable PWA

playhud includes a web manifest, regular and maskable icons, Apple home-screen metadata, and a production service worker following the [Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps). Serve over HTTPS (localhost works for testing). Supported browsers offer an Install app button in the workspace when installation is available; on iOS it explains Safari → Share → Add to Home Screen. The service worker is disabled in development. Test with `npm run build` and `npm start`. With production running on port 3100, run `node tests/check-pwa.cjs` from `frontend` (or set `PLAYWRIGHT_BASE_URL` for another port).

Only a public offline fallback is cached. Profiles, chats, authentication, and API responses are never stored by the service worker. Discovery, games, and messaging require a connection. Browser push notifications are not included.
