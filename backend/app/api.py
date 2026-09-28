import asyncio
import csv
import io
import math
import re
from app.services.geocode import city_to_coordinates
from fastapi import Body
from datetime import date, datetime, timedelta, timezone
from typing import Literal
from uuid import UUID
from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from .auth import Principal, member, principal, public_user
from .config import settings
from .database import get_db
from google.genai import types
from fastapi import UploadFile, File, Depends, HTTPException
from .models import (
    AgricultureReport,
    ChatHistory,
    Location,
    NotificationSettings,
    PushSubscription,
    Route,
    User,
)
from .schemas import (
    AgricultureRequest,
    ChatRequest,
    ComparisonRequest,
    Coordinates,
    Place,
    Preferences,
    Profile,
    PushToken,
    Reorder,
    RouteRequest,
    SpeechRequest,
)
from .services import agriculture, ai, alerts, analytics, maps, routing, weather
from .services.cache import cache
from .services.providers import client, fetch_json

router = APIRouter()


def coordinates(
    latitude: float = Query(ge=-90, le=90), longitude: float = Query(ge=-180, le=180)
) -> Coordinates:
    if not math.isfinite(latitude) or not math.isfinite(longitude):
        raise HTTPException(422, "Coordinates must be finite")
    return Coordinates(latitude=latitude, longitude=longitude)


@router.get("/config", tags=["Configuration"])
async def config():
    return {
        "ai_enabled": bool(settings.gemini_api_key),
        "google_client_id": settings.google_client_id,
        "push_enabled": bool(
            settings.firebase_service_account_json
            and settings.firebase_web_config_json
            and settings.firebase_vapid_key
        ),
        "firebase": settings.firebase_web_config,
        "firebase_vapid_key": settings.firebase_vapid_key,
        "environment": settings.environment,
        "wrf_enabled": bool(settings.wrf_forecast_url),
        "regional_alerts_enabled": bool(settings.imd_alerts_url),
    }


@router.get("/weather/current", tags=["Weather"])
async def current(point: Coordinates = Depends(coordinates)):
    result = await weather.forecast(**point.model_dump())
    return {
        key: value
        for key, value in result.items()
        if key not in ("hourly", "daily", "air_hourly")
    }


@router.get("/weather/forecast", tags=["Weather"])
async def forecast(point: Coordinates = Depends(coordinates)):
    return await weather.forecast(**point.model_dump())


@router.get("/weather/history", tags=["Weather"])
async def history(start: date, end: date, point: Coordinates = Depends(coordinates)):
    return await weather.history(point.latitude, point.longitude, start, end)


@router.get("/weather/nasa", tags=["Weather"])
async def nasa(start: date, end: date, point: Coordinates = Depends(coordinates)):
    return await weather.nasa_history(point.latitude, point.longitude, start, end)


@router.get("/locations/search", tags=["Locations"])
async def search(q: str = Query(min_length=2, max_length=150)):
    return await weather.geocode(q)


@router.get("/locations/reverse", tags=["Locations"])
async def reverse(point: Coordinates = Depends(coordinates)):
    # Public Nominatim has a global 1 request/second policy. Cached responses avoid repeated lookups.
    key = f"reverse:{point.latitude:.2f}:{point.longitude:.2f}"
    saved = await cache.get(key)
    if saved:
        return saved
    if not await cache.limit("nominatim", 1, 1):
        raise HTTPException(429, "Location lookup is busy. Please retry in a moment.")
    raw = await fetch_json(
        settings.nominatim_base_url + "/reverse",
        {"lat": point.latitude, "lon": point.longitude, "format": "jsonv2", "zoom": 10},
        86400,
    )
    address = raw.get("address", {})
    result = {
        **point.model_dump(),
        "name": address.get("city")
        or address.get("town")
        or address.get("village")
        or address.get("county")
        or "Current location",
        "admin1": address.get("state", ""),
        "country": address.get("country", ""),
    }
    await cache.set(key, result, 86400)
    return result


@router.get("/profile", tags=["Account"])
async def profile(
    user: Principal = Depends(member), db: AsyncSession = Depends(get_db)
):
    record = await db.get(User, user.id)
    if not record:
        raise HTTPException(404, "Account not found")
    return public_user(record)


@router.patch("/profile", tags=["Account"])
async def update_profile(
    data: Profile, user: Principal = Depends(member), db: AsyncSession = Depends(get_db)
):
    record = await db.get(User, user.id)
    record.display_name = data.display_name
    record.avatar = str(data.avatar) if data.avatar else None
    record.home_location = (
        data.home_location.model_dump() if data.home_location else None
    )
    await db.commit()
    return public_user(record)


def place_json(p: Location):
    return {
        "id": p.id,
        "name": p.name,
        "latitude": p.latitude,
        "longitude": p.longitude,
        "position": p.position,
    }


@router.get("/places", tags=["Account"])
async def places(user: Principal = Depends(member), db: AsyncSession = Depends(get_db)):
    return [
        place_json(p)
        for p in (
            await db.scalars(
                select(Location)
                .where(Location.user_id == user.id)
                .order_by(Location.position, Location.created_at)
            )
        ).all()
    ]


@router.post("/places", status_code=201, tags=["Account"])
async def add_place(
    data: Place, user: Principal = Depends(member), db: AsyncSession = Depends(get_db)
):
    all_places = (
        await db.scalars(select(Location).where(Location.user_id == user.id))
    ).all()
    if len(all_places) >= 30:
        raise HTTPException(422, "You can save up to 30 places")
    record = Location(user_id=user.id, position=len(all_places), **data.model_dump())
    db.add(record)
    await db.commit()
    return place_json(record)


@router.put("/places/order", tags=["Account"])
async def reorder(
    data: Reorder, user: Principal = Depends(member), db: AsyncSession = Depends(get_db)
):
    saved = {
        p.id: p
        for p in (
            await db.scalars(select(Location).where(Location.user_id == user.id))
        ).all()
    }
    ids = [str(uid) for uid in data.ids]
    if set(ids) != set(saved) or len(ids) != len(saved):
        raise HTTPException(422, "Include each of your saved places exactly once")
    for index, uid in enumerate(ids):
        saved[uid].position = index
    await db.commit()
    return {"ok": True}


@router.delete("/places/{place_id}", tags=["Account"])
async def delete_place(
    place_id: UUID,
    user: Principal = Depends(member),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        delete(Location)
        .where(Location.id == str(place_id), Location.user_id == user.id)
        .returning(Location.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Place not found")
    await db.commit()
    return {"ok": True}


@router.get("/preferences", tags=["Account"])
async def preferences(
    user: Principal = Depends(member), db: AsyncSession = Depends(get_db)
):
    saved = await db.scalar(
        select(NotificationSettings).where(NotificationSettings.user_id == user.id)
    )
    return Preferences.model_validate(saved.preferences) if saved else Preferences()


@router.put("/preferences", tags=["Account"])
async def set_preferences(
    data: Preferences,
    user: Principal = Depends(member),
    db: AsyncSession = Depends(get_db),
):
    saved = await db.scalar(
        select(NotificationSettings).where(NotificationSettings.user_id == user.id)
    )
    if saved:
        saved.preferences = data.model_dump()
    else:
        db.add(NotificationSettings(user_id=user.id, preferences=data.model_dump()))
    await db.commit()
    return data


@router.post("/notifications/register", tags=["Alerts"])
async def register_push(
    data: PushToken,
    user: Principal = Depends(member),
    db: AsyncSession = Depends(get_db),
):
    if not settings.firebase_service_account_json:
        raise HTTPException(503, "Push notifications are not configured")
    saved = await db.scalar(
        select(PushSubscription).where(PushSubscription.token == data.token)
    )
    if saved:
        saved.user_id = user.id
    else:
        db.add(PushSubscription(user_id=user.id, token=data.token))
    await db.commit()
    return {"ok": True}


@router.get("/alerts/live", tags=["Alerts"])
async def live_alerts(point: Coordinates = Depends(coordinates)):
    return await alerts.live(**point.model_dump())


@router.get("/map/layers", tags=["Maps"])
async def layers():
    return await maps.layers()


@router.get("/map/grid", tags=["Maps"])
async def grid(hour: int = Query(ge=0), point: Coordinates = Depends(coordinates)):
    now = int(datetime.now(timezone.utc).timestamp())
    if hour < now - 3600 or hour > now + 72 * 3600:
        raise HTTPException(422, "Grid time must be within the next 72 hours")
    return await maps.grid(point.latitude, point.longitude, hour)


@router.get("/map/data/{layer}", tags=["Maps"])
async def layer_data(layer: str):
    if layer not in maps.LAYER_NAMES:
        raise HTTPException(404, "Unknown layer")
    return await maps.geojson(layer)


@router.get("/map/tiles/{layer}/{z}/{x}/{y}", tags=["Maps"])
async def tile(layer: str, z: int, x: int, y: int, time: int = 0):
    if not 0 <= z <= 18 or not 0 <= x < 2**z or not 0 <= y < 2**z:
        raise HTTPException(422, "Invalid tile coordinates")
    cfg = maps.configured().get(layer)
    if layer == "radar":
        data = await maps.layers()
        frame = next((f for f in data["radar_frames"] if f["time"] == time), None)
        if not frame:
            raise HTTPException(404, "Radar frame unavailable")
        host = data["radar_host"]
        if host != "https://tilecache.rainviewer.com":
            raise HTTPException(502, "Unexpected radar tile provider")
        url = f"{host}{frame['path']}/256/{z}/{x}/{y}/2/1_1.png"
    elif cfg and cfg.get("type") == "raster":
        valid_times = [f["time"] for f in cfg.get("frames", [])]
        if valid_times and time not in valid_times:
            raise HTTPException(422, "Unsupported layer frame")
        url = (
            cfg["url"]
            .replace("{z}", str(z))
            .replace("{x}", str(x))
            .replace("{y}", str(y))
            .replace("{time}", str(time))
        )
    else:
        raise HTTPException(503, "Layer provider is not configured")
    response = await client.get(url)
    if response.is_error:
        raise HTTPException(502, "Map tile unavailable")
    content_type = response.headers.get("content-type", "image/png")
    if not content_type.startswith("image/"):
        raise HTTPException(502, "Map provider returned a non-image tile")
    return Response(
        response.content,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=300"},
    )


@router.get("/analytics/trends", tags=["Analytics"])
async def trends(
    start: date,
    end: date,
    period: Literal["month", "year"] = "month",
    point: Coordinates = Depends(coordinates),
):
    return await analytics.trends(point.latitude, point.longitude, start, end, period)


@router.get("/analytics/export.csv", tags=["Analytics"])
async def export_csv(start: date, end: date, point: Coordinates = Depends(coordinates)):
    data = await weather.history(point.latitude, point.longitude, start, end)
    output = io.StringIO()
    if data["hourly"]:
        writer = csv.DictWriter(output, fieldnames=list(data["hourly"][0]))
        writer.writeheader()
        writer.writerows(data["hourly"])
    return Response(
        output.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": 'attachment; filename="weathergpt-history.csv"'
        },
    )


@router.get("/analytics/climate", tags=["Analytics"])
async def climate(
    start: int = 2030, end: int = 2040, point: Coordinates = Depends(coordinates)
):
    return await analytics.projections(point.latitude, point.longitude, start, end)


@router.post("/models/compare", tags=["Analytics"])
async def compare(data: ComparisonRequest, user: Principal = Depends(principal)):
    if not await cache.limit("compare:" + user.id, 15, 3600):
        raise HTTPException(429, "Comparison limit reached")
    return await analytics.compare(data)


@router.post("/route/analyze", tags=["Travel"])
async def route_analyze(
    data: RouteRequest,
    user: Principal = Depends(principal),
    db: AsyncSession = Depends(get_db),
):
    if not await cache.limit("routes:" + user.id, 10 if user.guest else 30, 3600):
        raise HTTPException(429, "Hourly route-analysis limit reached")
    result = await routing.analyze(data)
    if not user.guest:
        record = Route(
            user_id=user.id, name=data.name, geojson=result["geometry"], analysis=result
        )
        db.add(record)
        await db.commit()
        result["id"] = record.id
    return result


@router.get("/route/saved", tags=["Travel"])
async def saved_routes(
    user: Principal = Depends(member), db: AsyncSession = Depends(get_db)
):
    return [
        {"id": r.id, "name": r.name, "analysis": r.analysis}
        for r in (
            await db.scalars(
                select(Route)
                .where(Route.user_id == user.id)
                .order_by(Route.created_at.desc())
                .limit(20)
            )
        ).all()
    ]


@router.post("/agriculture/advice", tags=["Agriculture"])
async def crop_advice(
    data: AgricultureRequest,
    user: Principal = Depends(principal),
    db: AsyncSession = Depends(get_db),
):
    if not await cache.limit("crops:" + user.id, 15 if user.guest else 60, 3600):
        raise HTTPException(429, "Hourly crop-advice limit reached")
    result = await agriculture.advice(data)
    narrative = await ai.agricultural_narrative(result)
    result.update({"ai_summary": narrative, "ai_available": bool(narrative)})
    if not user.guest:
        record = AgricultureReport(
            user_id=user.id,
            crop=data.crop,
            latitude=data.latitude,
            longitude=data.longitude,
            report=result,
        )
        db.add(record)
        await db.commit()
        result["id"] = record.id
    return result


@router.get("/agriculture/reports", tags=["Agriculture"])
async def crop_reports(
    user: Principal = Depends(member), db: AsyncSession = Depends(get_db)
):
    return [
        {"id": r.id, "created_at": r.created_at, **r.report}
        for r in (
            await db.scalars(
                select(AgricultureReport)
                .where(AgricultureReport.user_id == user.id)
                .order_by(AgricultureReport.created_at.desc())
                .limit(20)
            )
        ).all()
    ]

@router.post("/ai/chat", tags=["AI"])
async def chat(data: ChatRequest, user: Principal = Depends(principal)):
    lat = data.latitude
    lon = data.longitude
    city_name = None

    # Hindi + English city detection
    patterns = [
        r"([A-Za-z ]+)\s+ka weather",
        r"weather in\s+([A-Za-z ]+)",
        r"([A-Za-z ]+)\s+weather",
    ]

    for p in patterns:
        m = re.search(p, data.message, re.IGNORECASE)
        if m:
            city_name = m.group(1).strip()
            break

    if city_name:
        place = await city_to_coordinates(city_name)
        if place:
            lat = place["latitude"]
            lon = place["longitude"]

    print(f"CITY={city_name} LAT={lat} LON={lon}")

    forecast = await weather.forecast(lat, lon)

    return await ai.chat(
        data,
        user,
        weather_data=forecast,
    )


@router.get("/ai/summary", tags=["AI"])
async def weather_summary(
    point: Coordinates = Depends(coordinates),
    user: Principal = Depends(principal),
):
    forecast = await weather.forecast(point.latitude, point.longitude)

    dummy = ChatRequest(
        latitude=point.latitude,
        longitude=point.longitude,
        message="Give me a concise weather summary.",
    )

    return await ai.chat(dummy, user, weather_data=forecast)


@router.get("/ai/history", tags=["AI"])
async def chat_history(
    conversation_id: UUID | None = None,
    user: Principal = Depends(member),
    db: AsyncSession = Depends(get_db),
):
    query = select(ChatHistory).where(ChatHistory.user_id == user.id)
    if conversation_id:
        query = query.where(ChatHistory.conversation_id == str(conversation_id))
    records = (
        await db.scalars(query.order_by(ChatHistory.created_at.desc()).limit(100))
    ).all()
    return [
        {
            "id": r.id,
            "conversation_id": r.conversation_id,
            "role": r.role,
            "content": r.content,
            "created_at": r.created_at,
        }
        for r in reversed(records)
    ]


from google.genai import types

@router.post("/ai/transcribe", tags=["AI"])
async def transcribe(file: UploadFile = File()):
    try:
        audio_bytes = await file.read()

        response = ai.client.models.generate_content(
            model="gemini-3.8-flash",
            contents=[
                types.Part.from_bytes(
                    data=audio_bytes,
                    mime_type=file.content_type or "audio/webm",
                ),
                "Transcribe this audio. Return only the spoken text.",
            ],
        )

        text = (response.text or "").strip()
        return {"text": text}

    except Exception as exc:
        raise HTTPException(502, f"Audio transcription failed: {exc}")

@router.post("/ai/speech", tags=["AI"])
async def speech(data: SpeechRequest):
    audio_bytes = await ai.text_to_speech(data.text)

    return Response(
        content=audio_bytes,
        media_type="audio/wav",
        headers={
            "Content-Disposition": "inline; filename=speech.wav",
        },
    )




