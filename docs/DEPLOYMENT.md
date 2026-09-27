# Deployment and operations

The repository includes runnable local setup and cloud configuration. It has not been deployed to accounts on your behalf. Supply your own accounts, domains, licensed providers and credentials. Review `VERIFICATION.md` before launch.

## Local preview

1. Install Node.js 22+ and Python 3.12 on macOS or Linux.
2. From the project directory run `npm run setup`, then `npm run dev`.
3. Open `http://127.0.0.1:3000`. The API is at `http://127.0.0.1:8000/docs`.

Setup installs locked dependencies, creates a virtual environment and local database, and generates private configuration without replacing existing files. No third-party key is necessary for the baseline weather experience. Optional services are enabled by adding your credentials to `backend/.env` and restarting. Frontend environment changes require restarting/rebuilding the frontend. Do not share `.env`, `.env.local`, databases or service-account files.

If another preview already owns ports 3000/8000, stop that preview before starting another. The provided development launcher enables polling to avoid macOS file-watcher limits. Browser error states should clear when the API is restored; Reload retries the forecast.

## Local PostGIS and Redis with Docker

With Docker Desktop running, run `npm run setup` (or `node scripts/configure.mjs` when dependencies are already installed), stop the native preview, then run:

```sh
docker compose up --build
```

The compose stack creates PostgreSQL/PostGIS and Redis with named persistent volumes, runs schema migrations, and exposes the frontend/API on localhost only. The PostGIS image uses amd64 emulation on Apple Silicon. `docker compose down` stops the stack without deleting the database volumes. Do not add `-v` unless you deliberately want to delete its data. Compose is a local development configuration, not public production hosting.

## Supabase PostgreSQL

Create a PostgreSQL project and enable PostGIS. Use a server-side database connection, not the Supabase browser anon key. This app owns its authentication; it does not use Supabase Auth. Prefer the direct connection when IPv6 is supported, or the **session-mode pooler** for an IPv4-only backend. Avoid transaction pooling with this asyncpg configuration. Consult [Supabase's connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres).

Set `DATABASE_URL` using the supplied credentials with driver prefix `postgresql+asyncpg://`. URL-encode password characters. For asyncpg, use `?ssl=require` rather than copying a `sslmode` query parameter. Use a connection role permitted to install PostGIS/app schema on initial migration. Migrations enable RLS without browser policies; the backend connection must be the table owner or have suitable backend-only privileges. Never expose it to the browser.

Run `python -m app.migrate` from `backend/` with production settings. The Docker entrypoint does this before serving. Migrations are ordered, transactionally recorded and guarded by a PostgreSQL advisory lock. Back up before future schema changes. These migrations target a fresh application schema; do not point them at unrelated existing tables.

## Railway API and worker

Deploy the repository as a Railway service with root directory `backend`. Use the included Dockerfile and `railway.toml`. See [Railway Dockerfile deployment](https://docs.railway.com/builds/dockerfiles).

Set these backend variables:

```text
ENVIRONMENT=production
DATABASE_URL=<your private PostgreSQL asyncpg connection>
REDIS_URL=<your private Redis connection>
JWT_SECRET_KEY=<random secret of at least 40 characters>
FRONTEND_ORIGINS=https://your-frontend-domain
PROVIDER_USER_AGENT=WeatherGPT/1.0 (your operator contact)
```

Add the optional provider secrets from `PROVIDERS.md`. Use `rediss://` when your Redis service requires TLS. `/health` checks the database and Redis; Railway injects `PORT`. The service supports `/ws/live` over WebSocket and must remain an always-running server, not a short-lived function.

Create a second service from the same backend image for notifications. Override its start command with `python -m app.services.alerts`, give it the same secrets and database/Redis connections, and remove the HTTP health check for this worker. Run **one worker replica**; the Redis lease is an extra duplicate-polling guard, not a multi-worker scheduler. The API process does not start a polling worker in production. Poll frequency defaults to 300 seconds.

Mount any GIS connection JSON and set its absolute `LAYER_CONFIG_PATH`, or include a non-secret configuration file in your controlled deployment. Keep feed credentials in private host-managed configuration, not a public repository.

## Vercel frontend

Import the repository with root directory `frontend` and Next.js framework. The included `vercel.json` specifies the build and install commands. Set:

```text
BACKEND_URL=https://your-api-domain
NEXT_PUBLIC_WS_URL=wss://your-api-domain/ws/live
```

These values are incorporated during the build; redeploy after changing them. `BACKEND_URL` proxies same-origin `/api/*` requests so HttpOnly refresh cookies stay on the frontend origin. WebSockets connect directly to Railway. Put the exact frontend HTTPS origin in `FRONTEND_ORIGINS` on the API, and the same authorized JavaScript origin in Google Cloud. Do not use wildcard preview origins for credentialed authentication. Confirm your hosting plan's upstream request timeout for long AI/route requests.

## Before accepting real users

- Run the automated suites and real-provider smoke check against staging. Execute the browser suite on a machine that permits browser launch.
- Verify PostgreSQL migrations, Redis persistence, multi-instance rate limits and backup restoration in your deployed environment.
- Test Google OAuth with your real registered origin; test Firebase on a permitted device, including delivery while the page is closed. Test AI/voice billing limits and failures with your own key.
- Verify WRF and official hazard-feed geometry, dates, coverage, licensing, attribution and update frequency. Missing credentials do not count as tested integrations.
- Review proxy-aware IP rate limiting and edge abuse protection: the current API uses the connection peer plus verified user ID, not arbitrary forwarded headers. Behind a shared proxy, unauthenticated requests can share a limit.
- Set spending/provider quotas, TLS, backups, logging/monitoring, retention/deletion procedures and an incident owner. Add your own privacy policy, terms, support contact, and legally appropriate data-processing disclosures.
- Review the Content Security Policy before launch. The shipped policy supports map workers and Google sign-in, and permits inline scripts required by this setup; it is not a strict nonce-based CSP.
- Email/password login is implemented, but email verification, password-reset email delivery, billing/subscriptions and an admin console are not included. Add these if your launch policy requires them.
- Perform a security/accessibility review and load testing. Passing the included tests is not security certification or a capacity guarantee. This application must not be marketed as an emergency alert or safety assurance system.

## Operations and recovery

Keep the JWT secret stable across replicas and deploys. Changing it invalidates access tokens. Monitor API error/latency rates and third-party quotas separately. `/health` does not claim all external providers are online. Rotate keys through host secrets, never through chat or frontend code. Database backups contain private account and location records and need access controls. If migrating from local SQLite, export/import user-owned records through a reviewed migration process; do not just change the connection string expecting data to move.
