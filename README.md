# Playzo — sports matchmaking prototype

Next.js + Clerk + FastAPI + PostGIS + Valkey. The frontend uses shadcn/ui, Radix primitives, and Tailwind CSS with a shared neutral/violet design system.

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
3. `docker compose up -d --build` (starts API, PostGIS, Valkey).
4. `cd frontend && npm install && npm run dev`.
5. Open http://localhost:3000, sign up and complete onboarding.
6. API docs at http://localhost:8000/docs.

Use email/password and Google for Clerk authentication. Enable first and last name fields in Clerk's User model. In Clerk's Phone settings, disable phone sign-up, required phone numbers, sign-in with phone, and SMS authentication/MFA. Collect phone numbers only in onboarding: Playzo saves them privately on the profile as unverified contact details, without adding them to Clerk or sending an SMS. Phone verification is deferred. Local Indian mobile numbers are stored with `+91`; other numbers need their country code.

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

## Demo data

To seed nearby players, create multiple Clerk test accounts, onboard each with locations and sports, then log in as one account to see others. No real users or fictitious player identities are preloaded automatically.

## Important prototype limitations

- External PIN-code and approximate geocoding services require internet connectivity and may be rate-limited. For production use a licensed geocoding provider or local dataset.
- The app currently shows public groups and upcoming games without distance filtering. Add group/game geo-points before launch.
- Phone numbers are collected only during onboarding and remain unverified. No phone login or SMS verification flow is implemented.
- In-app notifications are implemented; browser push, typing indicators, online presence, attachments, and visible read receipts are deferred.
- Startup creates missing tables and runs the versioned additive schema upgrades in `backend/app/migrations.py`.
- Add blocking/reporting, abuse controls, observability, consent handling and proper authorization policies before a public launch.
- Configure a production-grade secret, backups, HTTPS, CORS and rate limits before deployment.

See [the engagement flow](docs/engagement-flow.md) for requests, chats, invitations, authorization, migrations, and test commands.
