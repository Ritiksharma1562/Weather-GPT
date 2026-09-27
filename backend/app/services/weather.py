import asyncio
import hashlib
from datetime import date, datetime, timedelta, timezone
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from ..database import Session
from ..models import HistoricalWeather, WeatherCache, utcnow
from .providers import fetch_json, meteo_url

CURRENT = "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m"
HOURLY = "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation_probability,precipitation,weather_code,cloud_cover,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,pressure_msl,soil_moisture_0_to_1cm,et0_fao_evapotranspiration"
DAILY = "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,et0_fao_evapotranspiration"


def rows(section: dict | None) -> list[dict]:
    if not section:
        return []
    return [
        {
            key: values[i] if i < len(values) else None
            for key, values in section.items()
            if isinstance(values, list)
        }
        for i in range(len(section.get("time", [])))
    ]


def aware(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


async def forecast(latitude: float, longitude: float) -> dict:
    key = f"forecast:{latitude:.3f}:{longitude:.3f}"
    async with Session() as db:
        cached = await db.scalar(
            select(WeatherCache).where(WeatherCache.cache_key == key)
        )
        if cached and aware(cached.expires_at) > utcnow():
            return cached.payload
    url, auth = meteo_url()
    air_url, air_auth = meteo_url("air")
    results = await asyncio.gather(
        fetch_json(
            url,
            {
                **auth,
                "latitude": latitude,
                "longitude": longitude,
                "current": CURRENT,
                "hourly": HOURLY,
                "daily": DAILY,
                "forecast_days": 15,
                "timezone": "auto",
                "timeformat": "unixtime",
            },
            300,
        ),
        fetch_json(
            air_url,
            {
                **air_auth,
                "latitude": latitude,
                "longitude": longitude,
                "current": "us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide",
                "hourly": "us_aqi",
                "forecast_days": 3,
                "timeformat": "unixtime",
            },
            900,
        ),
        return_exceptions=True,
    )
    raw, air = results
    if isinstance(raw, Exception):
        raise raw
    hourly = rows(raw.get("hourly"))
    current = raw.get("current") or {}
    if not hourly or current.get("temperature_2m") is None:
        raise HTTPException(502, "No forecast is available for this location")
    nearest = min(hourly, key=lambda p: abs(p["time"] - current["time"]))
    current.update(
        {
            k: nearest.get(k)
            for k in (
                "visibility",
                "uv_index",
                "precipitation_probability",
                "soil_moisture_0_to_1cm",
            )
        }
    )
    data = {
        "current": current,
        "hourly": hourly,
        "daily": rows(raw.get("daily")),
        "air_quality": None if isinstance(air, Exception) else air.get("current"),
        "air_hourly": [] if isinstance(air, Exception) else rows(air.get("hourly")),
        "timezone": raw.get("timezone", "UTC"),
        "latitude": latitude,
        "longitude": longitude,
        "elevation": raw.get("elevation"),
        "fetched_at": utcnow().isoformat(),
        "sources": ["Open-Meteo numerical weather models"]
        + ([] if isinstance(air, Exception) else ["CAMS via Open-Meteo"]),
        "availability": {
            "weather": "available",
            "air_quality": "unavailable" if isinstance(air, Exception) else "available",
        },
        "units": {
            "temperature": "°C",
            "wind": "km/h",
            "precipitation": "mm",
            "pressure": "hPa",
            "visibility": "m",
        },
    }
    async with Session() as db:
        existing = await db.scalar(
            select(WeatherCache).where(WeatherCache.cache_key == key)
        )
        if existing:
            existing.payload, existing.expires_at = (
                data,
                utcnow() + timedelta(minutes=5),
            )
        else:
            db.add(
                WeatherCache(
                    cache_key=key,
                    latitude=latitude,
                    longitude=longitude,
                    payload=data,
                    expires_at=utcnow() + timedelta(minutes=5),
                )
            )
        try:
            await db.commit()
        except IntegrityError:
            await (
                db.rollback()
            )  # A concurrent request already cached the same forecast.
    return data


async def history(latitude: float, longitude: float, start: date, end: date) -> dict:
    if (
        start > end
        or (end - start).days > 731
        or start < date(1940, 1, 1)
        or end > date.today() - timedelta(days=5)
    ):
        raise HTTPException(
            422,
            "Choose up to two years between 1940 and five days ago (archive publication delay).",
        )
    key = hashlib.sha256(
        f"{latitude:.3f}:{longitude:.3f}:{start}:{end}".encode()
    ).hexdigest()
    async with Session() as db:
        cached = await db.scalar(
            select(HistoricalWeather).where(HistoricalWeather.cache_key == key)
        )
        if cached:
            return cached.payload
    url, auth = meteo_url("archive")
    raw = await fetch_json(
        url,
        {
            **auth,
            "latitude": latitude,
            "longitude": longitude,
            "start_date": str(start),
            "end_date": str(end),
            "hourly": "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,pressure_msl,cloud_cover",
            "daily": "temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,relative_humidity_2m_mean",
            "timezone": "auto",
            "timeformat": "unixtime",
        },
        86400,
    )
    result = {
        "hourly": rows(raw.get("hourly")),
        "daily": rows(raw.get("daily")),
        "timezone": raw.get("timezone", "UTC"),
        "sources": ["ERA5 / ERA5-Land reanalysis via Open-Meteo"],
        "latitude": latitude,
        "longitude": longitude,
    }
    async with Session() as db:
        db.add(
            HistoricalWeather(
                cache_key=key,
                latitude=latitude,
                longitude=longitude,
                start_date=str(start),
                end_date=str(end),
                payload=result,
            )
        )
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
    return result


async def geocode(query: str) -> list[dict]:
    raw = await fetch_json(
        "https://geocoding-api.open-meteo.com/v1/search",
        {"name": query, "count": 8, "language": "en", "format": "json"},
        86400,
    )
    return [
        {
            "name": x["name"],
            "latitude": x["latitude"],
            "longitude": x["longitude"],
            "country": x.get("country", ""),
            "admin1": x.get("admin1", ""),
            "timezone": x.get("timezone", "UTC"),
        }
        for x in raw.get("results", [])
    ]


async def nasa_history(
    latitude: float, longitude: float, start: date, end: date
) -> dict:
    if (
        start > end
        or (end - start).days > 366
        or start < date(1981, 1, 1)
        or end > date.today() - timedelta(days=7)
    ):
        raise HTTPException(
            422,
            "NASA POWER supports up to one year per request, ending at least seven days ago",
        )
    return await fetch_json(
        "https://power.larc.nasa.gov/api/temporal/daily/point",
        {
            "parameters": "T2M,RH2M,WS10M,PRECTOTCORR,PS",
            "community": "AG",
            "longitude": longitude,
            "latitude": latitude,
            "start": start.strftime("%Y%m%d"),
            "end": end.strftime("%Y%m%d"),
            "format": "JSON",
        },
        86400,
    )


async def weather_points(points: list[tuple[float, float]]) -> list[dict]:
    url, auth = meteo_url()
    all_rows = []
    for offset in range(0, len(points), 25):
        batch = points[offset : offset + 25]
        raw = await fetch_json(
            url,
            {
                **auth,
                "latitude": ",".join(str(round(p[0], 4)) for p in batch),
                "longitude": ",".join(str(round(p[1], 4)) for p in batch),
                "hourly": "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,cloud_cover,visibility,wind_speed_10m,wind_direction_10m",
                "forecast_days": 4,
                "timeformat": "unixtime",
                "timezone": "UTC",
            },
            600,
        )
        locations = raw if isinstance(raw, list) else [raw]
        if len(locations) != len(batch):
            raise HTTPException(502, "Incomplete route weather response")
        all_rows.extend(locations)
    return all_rows
