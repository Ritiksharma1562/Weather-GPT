# WeatherGPT

A full-stack weather and climate application: Next.js 15 / React 19 frontend, async FastAPI backend, PostgreSQL/PostGIS migrations, Redis support, and real weather-provider integrations.

## Run locally

Requires Node.js 22+ and Python 3.12+. From this project directory:

```sh
npm run setup
npm run dev
```

Open **http://127.0.0.1:3000**. The API reference is at **http://127.0.0.1:8000/docs**. `Ctrl+C` stops both services. Setup creates private local environment files and a random session secret without overwriting existing configuration.

This delivered checkout already has dependencies installed. Run `npm run dev` when the preview is not already running. Local data lives in `backend/weathergpt.db`. Guest mode cannot save private records; create an account through the app to use saved places, profiles, reports, trips, and chat history.

Local development uses SQLite and an in-process cache so it can start without cloud accounts. Production **requires PostgreSQL and Redis** and rejects missing secrets or insecure allowed origins. SQLite mode does not claim to provide PostGIS.

## Included functionality

- Live conditions, air quality, GPS/reverse lookup, city search, saved/reordered places, 24/72-hour details, and a 15-day forecast.
- Current/daily/hourly cards, rain charts, light/dark themes, Celsius/Fahrenheit and wind-unit conversion, responsive navigation, and accessible form controls.
- MapLibre maps, historical radar frames, forecast-grid layers, wind vectors/barbs/particles, legends, map styles, selectable locations, and playback.
- Historical date/range lookup, date comparisons, monthly/yearly climate charts, climate scenarios, NASA POWER endpoint, CSV export and print-to-PDF layout.
- Observation CSV import with time alignment, MAE, RMSE, bias, correlation, deviation plots, and model-series toggles.
- Crop water-demand screening, spraying windows, harvest context, surface soil-moisture estimates, heat and disease-weather flags, saved field reports, and optional AI narrative.
- OSRM/OpenRouteService routes, ~5 km samples, arrival-adjusted weather, colored risk segments, mapped rest areas, saved trips, and GPS Copilot with authenticated WebSocket updates.
- Email/password login, Google identity verification, guest sessions, in-memory access tokens, HttpOnly refresh cookies, refresh rotation/reuse detection, Argon2 passwords, private-record ownership checks, and rate limiting.
- Real OpenAI Responses tool-calling loop with source collection, curated knowledge retrieval, Hindi responses, structured risk/recommendation/confidence, Whisper transcription, and AI-generated speech.
- NOAA alerts, regional-alert adapter, Firebase push registration and worker, alert/voice preferences, and Redis alert pub/sub.
- Tests, versioned SQL migrations, Docker Compose, Vercel/Railway configuration, and deployment instructions.

## Connections needed to activate every integration

The app does **not** substitute fabricated answers or hazard data when services are unconfigured.

| Feature | Required backend configuration |
| --- | --- |
| AI chat, daily summary, AI crop narrative, transcription, speech | `OPENAI_API_KEY`; optional `OPENAI_MODEL`, `OPENAI_TRANSCRIBE_MODEL`, `OPENAI_TTS_MODEL` |
| Google sign-in | `GOOGLE_CLIENT_ID` with the frontend’s origin registered in Google Cloud |
| Background push delivery | `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_WEB_CONFIG_JSON`, `FIREBASE_VAPID_KEY`; run the alert worker |
| Commercial Open-Meteo hosted use | `OPEN_METEO_API_KEY` or an appropriate self-hosted/provider arrangement |
| Commercial routing / higher quotas | `OPENROUTESERVICE_API_KEY` or a production `OSRM_BASE_URL` |
| WRF comparison | `WRF_FORECAST_URL` implementing the documented forecast contract |
| India/regional official alerts | `IMD_ALERTS_URL` returning the documented regional alert GeoJSON |
| Satellite, lightning, flood, landslide, cyclone, fire, incident, safe-zone layers | `LAYER_CONFIG_PATH` pointing to server-managed provider connections |

See [provider contracts](docs/PROVIDERS.md) for exact formats. A provider URL, coverage, and license are necessary for hazard feeds; an OpenAI key does not supply those datasets. Confidence values from the assistant are self-assessments, not calibrated probabilities. Crop and travel scores are explained screening rules, not validated predictions of crop disease, road safety, or landslides.

## Test and build

```sh
npm run test:backend
npm run test:frontend
npm run build
cd frontend
npx playwright install chrome
npm run test:e2e
```

The browser suite runs an isolated database and separate ports 3100/8100. It covers live search, account creation, saved places, refresh persistence, logout, and 320px navigation. It uses real weather providers and therefore needs internet access. It never runs against a configured production database. For explicit live API checks while the normal backend is running:

```sh
cd backend
.venv/bin/python scripts/smoke_live.py
```

See [verification results](docs/VERIFICATION.md) for what was actually executed in the build environment and remaining credential-dependent checks.

## Project map

```text
frontend/
  src/app/                 App Router pages, theme and responsive styles
  src/components/          Dashboard, map, chat, climate, farming, travel, account UI
  src/components/ui/       Accessible Radix/shadcn-style primitives
  src/lib/                 Typed API, session/location state, formatting
  tests/                   Component and utility tests
  e2e/                     Full browser flows
backend/
  app/api.py               Validated REST routes
  app/auth.py              Password/Google/guest and session lifecycle
  app/models.py            ORM entities and owner relationships
  app/services/            Weather, AI, GIS, routes, agriculture, alerts, analytics
  migrations/              PostgreSQL + PostGIS DDL and security boundaries
  tests/                   Security, calculations, and provider failure tests
  scripts/smoke_live.py     Opt-in real-provider verification
docs/
  ARCHITECTURE.md           Architecture and entity relationships
  PROVIDERS.md              Provider contracts and attribution
  DEPLOYMENT.md             Vercel, Railway, Supabase and local Docker
  VERIFICATION.md           Executed checks and limits
```

## Deploy

Use [DEPLOYMENT.md](docs/DEPLOYMENT.md). Source and deploy configuration are included; no cloud deployment, paid subscription, or external account has been created. Do not expose the development server publicly.
