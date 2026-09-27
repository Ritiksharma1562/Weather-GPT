# Data providers and configuration

All keys belong in `backend/.env` or the backend host's secret settings, never in a `NEXT_PUBLIC_*` variable. The server exposes only public client configuration and capability flags through `/config`. Blank credentials disable the associated integration; they do not enable simulated results.

## Built-in connections

| Data | Connection and limitations |
| --- | --- |
| Weather, geocoding, air quality | [Open-Meteo documentation](https://open-meteo.com/en/docs). Fifteen forecast days, hourly weather, CAMS air quality, and model-grid samples. Set `OPEN_METEO_API_KEY` for the commercial customer endpoints. Review provider licensing and quota before commercial launch. |
| Historical weather | [Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api). Reanalysis/model estimates, not readings from a user's sensor. App requests are limited to two years at a time, ending at least five days ago. |
| Model comparison | [Historical Forecast API](https://open-meteo.com/en/docs/historical-forecast-api). Stitched archive versus uploaded timestamped observations. This is not a fixed-lead-time forecast-skill study. |
| Climate scenarios | [Climate API](https://open-meteo.com/en/docs/climate-api). EC-Earth3P-HR scenario, not a day-specific weather forecast; up to ten-year spans within the provider's supported dates. |
| NASA | [NASA POWER API](https://power.larc.nasa.gov/docs/services/api/). `/weather/nasa` returns provider data without inventing unavailable values. |
| Radar | [RainViewer API](https://www.rainviewer.com/api.html). Available past frames, Universal Blue palette. Coverage is not global and missing returns do not mean dry conditions. |
| US official alerts | [NWS API](https://www.weather.gov/documentation/services-web-api). Active alerts by geographic point. Set a descriptive `PROVIDER_USER_AGENT` with an operator contact. |
| Maps | MapLibre renders [OpenFreeMap](https://openfreemap.org/quick_start/) dark/light vector styles or OSM street tiles with attribution. Review basemap provider terms and capacity before launch. |
| Routes | OSRM public demonstration endpoint by default. Set `OSRM_BASE_URL` to an operated instance or `OPENROUTESERVICE_API_KEY` for [OpenRouteService](https://openrouteservice.org/dev/#/api-docs). Route analysis is limited to 500 km. |
| Rest areas | OpenStreetMap through Overpass. Mapped rest-area objects are not verified safe locations. Missing results and provider failures are disclosed. |
| Reverse geocoding | Nominatim. Set `NOMINATIM_BASE_URL` and operator `PROVIDER_USER_AGENT`; use an appropriate hosted/self-operated service for production volume. |

Requests are cached and bounded. Third-party services can fail, throttle, delay data, or change coverage independently of this app. API failure states should remain visible.

## AI and voice

Set `OPENAI_API_KEY`. Optional model variables are in `.env.example`. The server uses the [Responses function-calling flow](https://platform.openai.com/docs/guides/function-calling) and structured output. It first retrieves weather, then may request alerts, routes, crop analysis, place search, or the bundled curated knowledge index. Up to six model/tool rounds are allowed. Tool results are data, not instructions. Responses use `store=False`; signed-in conversation history is stored in your own database. Whisper transcription and speech generation are separate authenticated endpoints.

The bundled knowledge index is curated lexical retrieval, not a managed vector database. Returned confidence is the model's self-assessment, not a validated probability. AI recommendations are not emergency guidance. Audio sent for transcription and queries sent to AI leave your infrastructure; disclose these processors in your product's privacy policy.

## Google and Firebase

`GOOGLE_CLIENT_ID` is the web OAuth client ID. Register the actual frontend origins in Google Cloud. The backend verifies the ID token audience and verified email. Password accounts are not silently linked to a Google identity.

Firebase requires `FIREBASE_SERVICE_ACCOUNT_JSON` (private backend secret), `FIREBASE_WEB_CONFIG_JSON` (public web app JSON) and `FIREBASE_VAPID_KEY` (web push public key). Use the same Firebase project for all three. Users register their browser through Settings, granting permission themselves. The included service worker receives notifications. Run one dedicated alert worker in production. Push is best-effort, not guaranteed emergency delivery.

## Regional official alerts

`IMD_ALERTS_URL` is an operator-supplied HTTPS adapter endpoint; it is not an invented IMD public endpoint. Obtain a legitimate feed and adapt it to a GeoJSON `FeatureCollection`:

- Each feature needs a Polygon/MultiPolygon geometry in WGS84 longitude/latitude.
- Properties: stable `id`, `event`, `headline`, `description`, `instruction`, `effective`, `expires`, `source`, `type`, and `severity`.
- Dates must be ISO 8601 with a timezone. `severity` accepts Extreme/Severe/Moderate/Minor or Red/Orange/Yellow/Green.
- `type` should be rain, flood, cyclone, heat, cold, fog, landslide, thunderstorm, wind, or fire.
- Only features intersecting the selected point and not expired are included. The operator is responsible for authentic source provenance and licensing.

## Optional GIS feeds

Set `LAYER_CONFIG_PATH` to an absolute backend-readable JSON file. An empty object `{}` is a valid configuration. Supported keys are `satellite`, `lightning`, `flood`, `landslide`, `cyclone`, `safe_zones`, `fires`, and `incidents`.

Each entry is an object with:

| Field | Contract |
| --- | --- |
| `type` | `geojson` or `raster` |
| `url` | Operator-approved absolute provider URL. GeoJSON returns a FeatureCollection; raster is an XYZ image URL template with `{z}`, `{x}`, `{y}` and optional `{time}`. |
| `source` | Human-readable provenance and attribution |
| `frames` | Optional raster timeline: array of objects containing Unix-seconds `time` |

GeoJSON features use WGS84 geometry and may contain `name`, `headline`, `description`, `severity`, and `color`. The browser receives data or proxied tiles, not provider credentials. Do not let users edit this server configuration: URLs are trusted operator input. Only GeoJSON layers can participate in route proximity/intersection screening. Approximate proximity uses a small degree-based tolerance; it is not a validated hazard buffer or a substitute for authoritative geospatial analysis. Raster layers are visual context only. Disabled layers mean **not connected**, never **no hazards**.

## WRF comparison adapter

Set `WRF_FORECAST_URL` to your own HTTPS service. It receives `latitude`, `longitude`, `start_date`, `end_date`, `hourly=temperature_2m`, `timeformat=unixtime`, and `timezone=UTC`. Return an object with `hourly.time` (Unix seconds) and matching `hourly.temperature_2m` (Celsius; use null for missing observations). The app aligns each sensor reading within 30 minutes and computes pairwise MAE, RMSE, prediction-minus-observation bias, and Pearson correlation.

## Agricultural and travel interpretation

Crop estimates use general crop coefficients, forecast rain and FAO ET₀; shallow model soil moisture is explicitly not root-zone moisture. Disease-weather flags do not diagnose disease, and scores have not been calibrated to crop outcomes. Travel colors are transparent weather-screening thresholds; they are not predictions of accidents, floods, or landslides. Consult local official warnings and qualified advisors for consequential decisions.
