import asyncio
import json
import logging
from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy import select, delete
from sqlalchemy.exc import IntegrityError
from shapely.geometry import Point, shape
from ..config import settings
from ..database import Session
from ..models import (
    Alert,
    Location,
    NotificationDelivery,
    NotificationSettings,
    PushSubscription,
    utcnow,
)
from ..schemas import Preferences
from .cache import cache
from .providers import fetch_json
from .risk import assess
from .weather import forecast

log = logging.getLogger(__name__)
SEVERITY = {
    "Extreme": "Red",
    "Severe": "Orange",
    "Moderate": "Yellow",
    "Minor": "Green",
    "Unknown": "Unknown",
}


def alert_type(event: str) -> str:
    text = event.lower()
    for words, kind in [
        (("flood",), "flood"),
        (("hurricane", "cyclone", "tropical"), "cyclone"),
        (("heat",), "heat"),
        (("cold", "freeze", "snow", "winter"), "cold"),
        (("fog",), "fog"),
        (("landslide",), "landslide"),
        (("thunder", "tornado", "lightning"), "thunderstorm"),
        (("wind",), "wind"),
        (("fire",), "fire"),
    ]:
        if any(word in text for word in words):
            return kind
    return "rain"


async def live(latitude: float, longitude: float) -> dict:
    alerts = []
    coverage = []
    if 18 <= latitude <= 72 and -180 <= longitude <= -60:
        try:
            data = await fetch_json(
                "https://api.weather.gov/alerts/active",
                {"point": f"{latitude:.4f},{longitude:.4f}"},
                120,
            )
            coverage.append(
                {"source": "NOAA / National Weather Service", "status": "available"}
            )
            for f in data.get("features", []):
                p = f["properties"]
                alerts.append(
                    {
                        "id": p.get("id", f.get("id")),
                        "event": p.get("event", "Weather alert"),
                        "type": alert_type(p.get("event", "")),
                        "severity": SEVERITY.get(p.get("severity"), "Unknown"),
                        "headline": p.get("headline"),
                        "description": p.get("description"),
                        "instruction": p.get("instruction"),
                        "effective": p.get("effective"),
                        "expires": p.get("expires"),
                        "geometry": f.get("geometry"),
                        "source": "NOAA / NWS",
                        "official": True,
                    }
                )
        except HTTPException:
            coverage.append(
                {"source": "NOAA / National Weather Service", "status": "unavailable"}
            )
    else:
        coverage.append({"source": "NOAA / NWS", "status": "outside coverage"})
    if settings.imd_alerts_url:
        try:
            data = await fetch_json(settings.imd_alerts_url, ttl=120)
            coverage.append(
                {"source": "Configured regional authority", "status": "available"}
            )
            for f in data.get("features", []):
                p = f.get("properties", {})
                if not f.get("geometry") or not shape(f["geometry"]).intersects(
                    Point(longitude, latitude)
                ):
                    continue
                expiry = p.get("expires")
                if (
                    expiry
                    and datetime.fromisoformat(expiry.replace("Z", "+00:00"))
                    <= utcnow()
                ):
                    continue
                alerts.append(
                    {
                        **p,
                        "id": str(p.get("id", f.get("id"))),
                        "type": p.get("type", alert_type(p.get("event", ""))),
                        "severity": SEVERITY.get(
                            p.get("severity"), p.get("severity", "Unknown")
                        ),
                        "geometry": f["geometry"],
                        "official": True,
                    }
                )
        except (HTTPException, ValueError, TypeError):
            coverage.append(
                {"source": "Configured regional authority", "status": "unavailable"}
            )
    elif 6 <= latitude <= 38 and 68 <= longitude <= 98:
        coverage.append(
            {
                "source": "India Meteorological Department",
                "status": "Regional alert feed not connected",
            }
        )
    async with Session() as db:
        for alert in alerts:
            existing = await db.scalar(
                select(Alert).where(Alert.source_id == alert["id"])
            )
            expiry = (
                datetime.fromisoformat(alert["expires"].replace("Z", "+00:00"))
                if alert.get("expires")
                else None
            )
            if existing:
                existing.payload, existing.expires_at = alert, expiry
            else:
                db.add(
                    Alert(
                        source_id=alert["id"],
                        latitude=latitude,
                        longitude=longitude,
                        severity=alert["severity"],
                        payload=alert,
                        expires_at=expiry,
                    )
                )
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
    data = await forecast(latitude, longitude)
    upcoming = [
        p
        for p in data["hourly"]
        if data["current"]["time"] <= p["time"] < data["current"]["time"] + 86400
    ]
    screened = [assess(p) | {"time": p["time"]} for p in upcoming]
    highest = max(screened, key=lambda x: x["score"], default=assess({}))
    return {
        "alerts": alerts,
        "coverage": coverage,
        "screening": highest,
        "updated_at": utcnow().isoformat(),
        "message": "No active alerts returned by connected providers"
        if not alerts
        else None,
    }


def firebase_app():
    import firebase_admin
    from firebase_admin import credentials

    try:
        return firebase_admin.get_app()
    except ValueError:
        return firebase_admin.initialize_app(
            credentials.Certificate(json.loads(settings.firebase_service_account_json))
        )


async def deliver(user_id: str, alert: dict):
    async with Session() as db:
        sent = await db.scalar(
            select(NotificationDelivery).where(
                NotificationDelivery.user_id == user_id,
                NotificationDelivery.source_id == alert["id"],
            )
        )
        if sent:
            return
        if cache.redis:
            await cache.redis.publish("wg:alerts:" + user_id, json.dumps(alert))
        tokens = list(
            (
                await db.scalars(
                    select(PushSubscription).where(PushSubscription.user_id == user_id)
                )
            ).all()
        )
        if not tokens or not settings.firebase_service_account_json:
            return
        from firebase_admin import messaging

        firebase_app()
        success = False
        for subscription in tokens:
            message = messaging.Message(
                token=subscription.token,
                notification=messaging.Notification(
                    title=alert.get("event", "Weather alert"),
                    body=(
                        alert.get("headline")
                        or alert.get("description")
                        or "Open WeatherGPT for details"
                    )[:300],
                ),
                data={
                    "alert_id": alert["id"],
                    "url": "/alerts",
                    "severity": alert["severity"],
                },
            )
            try:
                await asyncio.to_thread(messaging.send, message)
                success = True
            except messaging.UnregisteredError:
                await db.delete(subscription)
            except Exception:
                log.warning("Push delivery failed; will retry at next poll")
        if success:
            db.add(NotificationDelivery(user_id=user_id, source_id=alert["id"]))
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()


async def poll_forever():
    while True:
        try:
            # Run one dedicated worker in production; a Redis lease prevents duplicate polling.
            lease = (
                True
                if not cache.redis
                else await cache.redis.set(
                    "wg:alert-worker",
                    "active",
                    ex=max(300, settings.alert_poll_seconds),
                    nx=True,
                )
            )
            if lease:
                async with Session() as db:
                    places = list(
                        (
                            await db.scalars(
                                select(Location).join(
                                    NotificationSettings,
                                    NotificationSettings.user_id == Location.user_id,
                                )
                            )
                        ).all()
                    )
                    preferences = {
                        x.user_id: Preferences.model_validate(x.preferences)
                        for x in (await db.scalars(select(NotificationSettings))).all()
                    }
                for place in places:
                    pref = preferences.get(place.user_id, Preferences())
                    if not pref.push_enabled:
                        continue
                    try:
                        data = await live(place.latitude, place.longitude)
                        for alert in data["alerts"]:
                            if (
                                alert["type"] in pref.alert_types
                                and alert["severity"] in pref.severities
                            ):
                                await deliver(place.user_id, alert)
                    except Exception:
                        log.exception("Alert polling failed for a saved location")
        except Exception:
            log.exception("Alert worker iteration failed")
        await asyncio.sleep(settings.alert_poll_seconds)


if __name__ == "__main__":
    asyncio.run(poll_forever())



