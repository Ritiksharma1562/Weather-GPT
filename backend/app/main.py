import asyncio
import contextlib
import json
import logging
import time
import os
import sys
from contextlib import asynccontextmanager
import httpx
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from sqlalchemy import text
from .api import router
from .auth import authenticate, decode_token, router as auth_router
from .config import settings
from .database import Session, engine, init_db
from .schemas import Coordinates
from .services import alerts, maps, weather
from .services.cache import cache
from .services.providers import client
from .services.risk import assess, haversine

logging.basicConfig(level=logging.INFO)
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("weathergpt")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    if cache.redis:
        await cache.redis.ping()
    task = (
        asyncio.create_task(alerts.poll_forever())
        if settings.environment == "development"
        else None
    )
    yield
    if task:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
    await cache.close()
    await client.aclose()
    await engine.dispose()


app = FastAPI(
    title="WeatherGPT API",
    version="1.0.0",
    description="Live weather, climate intelligence, account data, GIS, route analysis and grounded AI. All measurements are returned in SI/display units described in each response.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:3001",
        "http://localhost:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
from fastapi.responses import JSONResponse

@app.middleware("http")
async def verify_origin(request: Request, call_next):
    # Local development: allow frontend
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


@app.exception_handler(Exception)
async def unexpected_error(request: Request, exc):
    log.exception("Unhandled request failure")
    return JSONResponse(
        {"detail": "The request could not be completed. Please retry."}, status_code=500
    )


@app.get("/health", tags=["Health"])
async def health():
    try:
        async with Session() as db:
            await db.execute(text("SELECT 1"))
        if cache.redis:
            await cache.redis.ping()
    except Exception:
        raise HTTPException(503, "Database or cache is unavailable")
    return {
        "status": "ok",
        "database": engine.dialect.name,
        "cache": "redis" if cache.redis else "local development memory",
    }


app.include_router(auth_router)
app.include_router(router)


@app.websocket("/ws/live")
async def websocket(ws: WebSocket):
    allowed_origins={o.strip() for o in settings.frontend_origins.split(",") if o.strip()}
    if ws.headers.get("origin") not in allowed_origins:
        await ws.close(code=1008)
        return

    if not await cache.limit(
        "ws-ip:" + (ws.client.host if ws.client else "unknown"), 30, 60
    ):
        await ws.close(code=1008)
        return
    await ws.accept()
    subscription = None
    try:
        first = await asyncio.wait_for(ws.receive_json(), timeout=30)
        if len(json.dumps(first)) > 32768:
            await ws.close(code=1009)
            return
        token = first.get("token", "")
        async with Session() as db:
            user = await authenticate(token, db)
        point = Coordinates(
            latitude=first.get("latitude"), longitude=first.get("longitude")
        )
        route_samples = first.get("route_samples", [])
        if not isinstance(route_samples, list) or len(route_samples) > 105:
            raise ValueError("Invalid route samples")
        for sample in route_samples:
            Coordinates(
                latitude=sample.get("latitude"), longitude=sample.get("longitude")
            )
            if not isinstance(sample.get("eta"), (int, float)) or not isinstance(
                sample.get("distance_m"), (int, float)
            ):
                raise ValueError("Invalid route timing")
        if not await cache.limit("ws-connect:" + user.id, 10, 60):
            await ws.close(code=1008)
            return
        if cache.redis and not user.guest:
            subscription = cache.redis.pubsub()
            await subscription.subscribe("wg:alerts:" + user.id)
        previous = None
        last_weather, last_analysis = 0.0, 0.0
        while True:
            decode_token(
                token
            )  # Reconnect with refreshed credentials when the access token expires.
            now = time.monotonic()
            moved = (
                previous is None
                or haversine(previous, (point.latitude, point.longitude)) >= 1000
            )
            if now - last_weather >= 60 or (moved and now - last_analysis >= 10):
                async with Session() as db:
                    await authenticate(token, db)
                try:
                    data = await weather.forecast(**point.model_dump())
                    result = {"type": "weather", "data": data}
                    if moved:
                        result["copilot"] = {
                            "weather": assess(data["current"]),
                            "nearby": await maps.nearby_hazards(**point.model_dump()),
                            "latitude": point.latitude,
                            "longitude": point.longitude,
                        }
                        if route_samples:
                            nearest_index = min(
                                range(len(route_samples)),
                                key=lambda i: haversine(
                                    (point.latitude, point.longitude),
                                    (
                                        route_samples[i]["latitude"],
                                        route_samples[i]["longitude"],
                                    ),
                                ),
                            )
                            nearest = route_samples[nearest_index]
                            ahead = route_samples[nearest_index + 1 : nearest_index + 7]
                            if ahead:
                                forecasts = await weather.weather_points(
                                    [(p["latitude"], p["longitude"]) for p in ahead]
                                )
                                checks = []
                                for sample, raw in zip(ahead, forecasts):
                                    eta = int(
                                        time.time()
                                        + max(0, sample["eta"] - nearest["eta"])
                                    )
                                    rows = weather.rows(raw.get("hourly"))
                                    if rows:
                                        predicted = min(
                                            rows, key=lambda p: abs(p["time"] - eta)
                                        )
                                        checks.append(
                                            {
                                                "distance_m": max(
                                                    0,
                                                    sample["distance_m"]
                                                    - nearest["distance_m"],
                                                ),
                                                "risk": assess(predicted),
                                                "eta": eta,
                                            }
                                        )
                                result["copilot"]["ahead"] = checks
                        previous = (point.latitude, point.longitude)
                        last_analysis = now
                    await ws.send_json(result)
                except HTTPException as exc:
                    await ws.send_json({"type": "error", "message": exc.detail})
                last_weather = now
            if subscription:
                message = await subscription.get_message(ignore_subscribe_messages=True)
                if message:
                    await ws.send_json(
                        {"type": "alert", "data": json.loads(message["data"])}
                    )
            try:
                message = await asyncio.wait_for(ws.receive_json(), timeout=2)
                if message.get("type") == "location":
                    if not await cache.limit("gps:" + user.id, 120, 60):
                        await ws.close(code=1008)
                        return
                    point = Coordinates(
                        latitude=message.get("latitude"),
                        longitude=message.get("longitude"),
                    )
            except asyncio.TimeoutError:
                continue
    except (WebSocketDisconnect, asyncio.TimeoutError):
        pass
    except (HTTPException, ValidationError, ValueError, TypeError):
        with contextlib.suppress(Exception):
            await ws.send_json(
                {
                    "type": "error",
                    "message": "Session expired or location invalid. Reconnect to continue.",
                }
            )
            await ws.close(code=1008)
    finally:
        if subscription:
            await subscription.aclose()
