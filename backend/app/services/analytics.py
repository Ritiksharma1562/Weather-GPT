import asyncio
import math
from collections import defaultdict
from datetime import date, datetime, timezone
from fastapi import HTTPException
from ..config import settings
from ..schemas import ComparisonRequest
from .providers import fetch_json, meteo_url
from .risk import metrics
from .weather import history, rows


async def trends(
    latitude: float, longitude: float, start: date, end: date, period: str = "month"
) -> dict:
    data = await history(latitude, longitude, start, end)
    buckets = defaultdict(list)
    for p in data["hourly"]:
        dt = datetime.fromtimestamp(p["time"], timezone.utc)
        key = dt.strftime("%Y-%m" if period == "month" else "%Y")
        buckets[key].append(p)

    def mean(points, field):
        values = [p[field] for p in points if p.get(field) is not None]
        return round(sum(values) / len(values), 2) if values else None

    result = [
        {
            "period": k,
            "temperature": mean(v, "temperature_2m"),
            "rainfall": round(sum(p.get("precipitation") or 0 for p in v), 2),
            "humidity": mean(v, "relative_humidity_2m"),
            "wind": mean(v, "wind_speed_10m"),
            "pressure": mean(v, "pressure_msl"),
            "aqi": None,
            "hours": len(v),
        }
        for k, v in sorted(buckets.items())
    ]
    aqi_status = "Archive unavailable for this date range"
    if start >= date(2022, 8, 1):
        try:
            url, auth = meteo_url("air")
            raw = await fetch_json(
                url,
                {
                    **auth,
                    "latitude": latitude,
                    "longitude": longitude,
                    "start_date": str(start),
                    "end_date": str(end),
                    "hourly": "us_aqi",
                    "timeformat": "unixtime",
                },
                86400,
            )
            air = defaultdict(list)
            for row in rows(raw.get("hourly")):
                key = datetime.fromtimestamp(row["time"], timezone.utc).strftime(
                    "%Y-%m" if period == "month" else "%Y"
                )
                air[key].append(row)
            for row in result:
                row["aqi"] = mean(air[row["period"]], "us_aqi")
            aqi_status = "available"
        except HTTPException:
            aqi_status = "Air-quality archive could not be retrieved"
    deltas = {}
    if len(result) > 1:
        for key in ("temperature", "rainfall", "humidity", "wind", "aqi"):
            a, b = result[-2][key], result[-1][key]
            deltas[key] = None if a is None or b is None else round(b - a, 2)
    return {
        "series": result,
        "deltas": deltas,
        "aqi_status": aqi_status,
        "sources": data["sources"]
        + (["CAMS via Open-Meteo"] if aqi_status == "available" else []),
        "period": period,
    }


async def compare(request: ComparisonRequest) -> dict:
    ordered = sorted(request.observations, key=lambda o: o.time)
    start, end = ordered[0].time.date(), ordered[-1].time.date()
    if (end - start).days > 90 or start < date(2022, 1, 1) or end > date.today():
        raise HTTPException(
            422, "Choose measurements from 2022 onward, spanning at most 90 past days"
        )
    url, auth = meteo_url("historical-forecast")
    common = {
        **auth,
        "latitude": request.latitude,
        "longitude": request.longitude,
        "start_date": str(start),
        "end_date": str(end),
        "hourly": "temperature_2m",
        "timeformat": "unixtime",
        "timezone": "UTC",
    }
    tasks = [
        fetch_json(url, common, 86400),
        fetch_json(url, {**common, "models": "ecmwf_ifs025"}, 86400),
    ]
    names = ["Open-Meteo", "ECMWF"]
    if settings.wrf_forecast_url:
        tasks.append(
            fetch_json(
                settings.wrf_forecast_url,
                {k: v for k, v in common.items() if k != "apikey"},
                3600,
            )
        )
        names.append("WRF")
    responses = await asyncio.gather(*tasks, return_exceptions=True)
    series = [
        {"time": int(o.time.timestamp()), "observed": o.temperature} for o in ordered
    ]
    summaries, availability = (
        {},
        {"WRF": "Connect a WRF forecast service to compare this model"},
    )
    for name, response in zip(names, responses):
        if isinstance(response, Exception):
            availability[name] = "unavailable"
            continue
        available = rows(response.get("hourly"))
        if not available:
            availability[name] = "unavailable"
            continue
        predicted = []
        for row in series:
            nearest = min(available, key=lambda p: abs(p["time"] - row["time"]))
            value = (
                nearest.get("temperature_2m")
                if abs(nearest["time"] - row["time"]) <= 1800
                else None
            )
            row[name] = value
            predicted.append(value)
        summaries[name] = metrics([x["observed"] for x in series], predicted)
        availability[name] = "available"
    return {
        "series": series,
        "metrics": summaries,
        "availability": availability,
        "sources": [
            "User-provided sensor observations",
            "Open-Meteo historical forecast archive",
            "ECMWF IFS via Open-Meteo",
        ],
        "method": "Nearest-hour alignment within 30 minutes; bias = prediction minus observation. Archived stitched model output, not a fixed forecast lead-time skill evaluation.",
    }


async def projections(latitude: float, longitude: float, start: int, end: int) -> dict:
    if start < 1950 or end > 2050 or start > end or end - start > 10:
        raise HTTPException(422, "Select up to 10 years within 1950–2050")
    url, auth = meteo_url("climate")
    data = await fetch_json(
        url,
        {
            **auth,
            "latitude": latitude,
            "longitude": longitude,
            "start_date": f"{start}-01-01",
            "end_date": f"{end}-12-31",
            "models": "EC_Earth3P_HR",
            "daily": "temperature_2m_mean,precipitation_sum",
            "disable_bias_correction": "false",
        },
        86400,
    )
    annual = defaultdict(list)
    for p in rows(data.get("daily")):
        annual[str(p["time"])[:4]].append(p)
    return {
        "series": [
            {
                "year": year,
                "temperature": sum(
                    p["temperature_2m_mean"]
                    for p in values
                    if p.get("temperature_2m_mean") is not None
                )
                / max(1, sum(p.get("temperature_2m_mean") is not None for p in values)),
                "rainfall": sum(p.get("precipitation_sum") or 0 for p in values),
            }
            for year, values in sorted(annual.items())
        ],
        "source": "EC-Earth3P-HR climate simulation via Open-Meteo",
        "note": "Climate-model scenario estimates; not predictions of weather on a particular day.",
    }
