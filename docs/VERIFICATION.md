# Verification report

Checked locally on 25–26 September 2026. This report distinguishes executed tests from integrations requiring the owner's accounts. It is not a claim of production certification.

## Passed

| Check | Observed result |
| --- | --- |
| Backend automated suite | 19 tests passed, including password login, refresh rotation/replay revocation, ownership isolation, guest restrictions, CSRF origin checks, validation, missing-AI behavior, risk/statistics calculations and provider failures. Rerun after Python formatting. |
| Frontend automated suite | 8 tests passed: formatting, sensor input parsing, provider-backed search, keyboard selection, and visible provider errors. |
| TypeScript | `npm run typecheck` passed. |
| Production build | `npm run build` passed with all 12 application views generated. Rebuilt after the basemap replacement. |
| Live API smoke check | All checks in `backend/scripts/smoke_live.py` passed: forecast, historical weather, radar catalogue, 25-point forecast grid, alert endpoint, climate scenario, NASA POWER, agriculture, route analysis and authenticated WebSocket weather. One initial grid request returned a temporary upstream error; a direct provider check and full rerun then passed. |
| Browser account flow | In the in-app browser: live city search → select Jammu → guest save prompt → create a local QA account → save place → reload → confirm profile and saved place persist → sign out. |
| Browser layouts | Desktop rendering checked at 1440px. Mobile dashboard checked at 320px; document width remained 320px. Mobile navigation to Forecast was exercised. |
| Basemap | Found old CARTO tiles returning an API-key-required image. Replaced dark/light maps with OpenFreeMap; the style endpoint returned 200 and streets/labels rendered in the production preview. |
| Docker configuration | `docker compose config --quiet` passed. This validates configuration, not container execution. |

## Included but not fully executed here

- Playwright end-to-end suite and GitHub Actions workflow are included. The local runner could start its isolated services, but this computer's sandbox blocked Chrome launch before assertions ran. The equivalent main account flow was checked through the in-app browser; this is not reported as a Playwright pass.
- PostgreSQL/PostGIS and Redis runtime: migrations, models, Docker services and production configuration are included. Docker Desktop's daemon was unavailable, so container startup and real PostgreSQL/Redis execution were not verified here. The working local app uses SQLite and the development memory cache.
- OpenAI chat/summary/voice, Google OAuth and Firebase push: implementations are present, but no owner's credentials were provided. Missing-key behavior was tested. Live paid-service success and billing behavior are unverified.
- WRF, regional official alerts and specialist hazard/satellite feeds require real provider connections. Disabled layer controls and capability messaging are intentional; no simulated hazard data is shipped as live data.
- GPS Copilot requires the user's location permission and a real driving-device field test. Route analysis and its weather sampling passed live checks; actual driving, voice interruptions and background mobile behavior were not road-tested.
- No Vercel/Railway/Supabase resources or paid subscriptions were created. No external production deployment, penetration test, load test, backup restoration test or full WCAG audit was performed.

## Reproduce

From the project root:

```sh
npm run setup
npm run test:backend
npm run test:frontend
npm run build
npm run dev
```

With the app running, use a second terminal for `cd backend && .venv/bin/python scripts/smoke_live.py`. For browser automation use `cd frontend && npx playwright install chrome && npm run test:e2e` on a system that permits Chrome to launch. The e2e suite uses separate ports and a separate local database.

The source ZIP excludes private environment files, local account/weather databases, installed dependencies, generated builds and test traces. Run setup after extracting it. Review `DEPLOYMENT.md` for the remaining production activation checklist.
