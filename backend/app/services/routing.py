import asyncio
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from ..config import settings
from ..schemas import RouteRequest
from .maps import configured, geojson, nearby_hazards
from .providers import client, fetch_json
from .risk import assess, haversine
from .weather import rows, weather_points


def sample_route(coordinates: list[list[float]], spacing: float = 5000) -> list[dict]:
    if len(coordinates) < 2:
        raise HTTPException(502, "The routing provider returned an invalid route")
    result = [
        {
            "latitude": coordinates[0][1],
            "longitude": coordinates[0][0],
            "distance_m": 0,
            "vertex": 0,
        }
    ]
    travelled, next_sample = 0.0, spacing
    for index, (a, b) in enumerate(zip(coordinates, coordinates[1:])):
        distance = haversine((a[1], a[0]), (b[1], b[0]))
        while distance and travelled + distance >= next_sample:
            fraction = (next_sample - travelled) / distance
            result.append(
                {
                    "latitude": a[1] + fraction * (b[1] - a[1]),
                    "longitude": a[0] + fraction * (b[0] - a[0]),
                    "distance_m": next_sample,
                    "vertex": index + 1,
                }
            )
            next_sample += spacing
        travelled += distance
    if travelled - result[-1]["distance_m"] > 1:
        result.append(
            {
                "latitude": coordinates[-1][1],
                "longitude": coordinates[-1][0],
                "distance_m": travelled,
                "vertex": len(coordinates) - 1,
            }
        )
    return result


async def analyze(request: RouteRequest) -> dict:
    departure = request.departure or datetime.now(timezone.utc)
    if departure.tzinfo is None:
        raise HTTPException(422, "Departure time must include a timezone")
    now = datetime.now(timezone.utc)
    if departure < now - timedelta(minutes=15) or departure > now + timedelta(hours=72):
        raise HTTPException(422, "Departure must be within the next 72 hours")
    a, b = request.origin, request.destination
    if haversine((a.latitude, a.longitude), (b.latitude, b.longitude)) > 500000:
        raise HTTPException(422, "Please analyze a trip of up to 500 km at a time")
    coordinates = [[a.longitude, a.latitude], [b.longitude, b.latitude]]
    if settings.openrouteservice_api_key:
        response = await client.post(
            "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
            headers={"Authorization": settings.openrouteservice_api_key},
            json={"coordinates": coordinates},
        )
        if response.is_error:
            raise HTTPException(502, "OpenRouteService could not calculate this route")
        feature = response.json()["features"][0]
        path = feature["geometry"]["coordinates"]
        distance, duration = (
            feature["properties"]["summary"]["distance"],
            feature["properties"]["summary"]["duration"],
        )
        source = "OpenRouteService / OpenStreetMap"
    else:
        raw = await fetch_json(
            f"{settings.osrm_base_url}/route/v1/driving/{a.longitude},{a.latitude};{b.longitude},{b.latitude}",
            {"overview": "full", "geometries": "geojson", "steps": "false"},
            900,
        )
        if raw.get("code") != "Ok" or not raw.get("routes"):
            raise HTTPException(422, "No drivable route found between these locations")
        route = raw["routes"][0]
        path, distance, duration = (
            route["geometry"]["coordinates"],
            route["distance"],
            route["duration"],
        )
        source = "OSRM / OpenStreetMap"
    if distance > 500000:
        raise HTTPException(
            422, "Calculated driving route exceeds 500 km; choose a shorter section"
        )
    samples = sample_route(path)
    provider_rows = await weather_points(
        [(s["latitude"], s["longitude"]) for s in samples]
    )
    configured_layers = [
        k for k, v in configured().items() if v.get("type", "geojson") == "geojson"
    ]
    layer_results = await asyncio.gather(
        *(geojson(k) for k in configured_layers), return_exceptions=True
    )
    datasets = {
        k: r if isinstance(r, dict) else None
        for k, r in zip(configured_layers, layer_results)
    }
    unavailable = set()
    segments = []
    total = samples[-1]["distance_m"] or 1
    for i, (sample, raw) in enumerate(zip(samples, provider_rows)):
        eta = departure.timestamp() + duration * sample["distance_m"] / total
        available = rows(raw.get("hourly"))
        if not available or eta > available[-1]["time"]:
            raise HTTPException(
                422, "Arrival is outside the available weather forecast"
            )
        weather = min(available, key=lambda p: abs(p["time"] - eta))
        hazards = await nearby_hazards(
            sample["latitude"], sample["longitude"], datasets
        )
        unavailable.update(hazards["unavailable"])
        sample.update(
            {
                "eta": int(eta),
                "weather": weather,
                "risk": assess(weather),
                "hazards": hazards["hazards"],
            }
        )
        if i < len(samples) - 1:
            nxt = samples[i + 1]
            section = (
                [[sample["longitude"], sample["latitude"]]]
                + path[sample["vertex"] : nxt["vertex"]]
                + [[nxt["longitude"], nxt["latitude"]]]
            )
            segments.append(
                {
                    "type": "Feature",
                    "geometry": {"type": "LineString", "coordinates": section},
                    "properties": {
                        "risk": sample["risk"]["level"],
                        "score": sample["risk"]["score"],
                    },
                }
            )
    rest_stops = []
    stops_status = "unavailable"
    try:
        lats, lons = [p[1] for p in path], [p[0] for p in path]
        bbox = f"{min(lats) - 0.015},{min(lons) - 0.015},{max(lats) + 0.015},{max(lons) + 0.015}"
        query = f'[out:json][timeout:12];nwr[highway~"^(services|rest_area)$"]({bbox});out center 50;'
        poi = await fetch_json(
            "https://overpass-api.de/api/interpreter", {"data": query}, 3600
        )
        for element in poi.get("elements", []):
            loc = element.get("center", element)
            if "lat" in loc:
                rest_stops.append(
                    {
                        "name": element.get("tags", {}).get("name", "Mapped rest area"),
                        "latitude": loc["lat"],
                        "longitude": loc["lon"],
                        "safety_verified": False,
                    }
                )
        stops_status = "available"
    except HTTPException:
        pass
    return {
        "name": request.name,
        "distance_km": round(distance / 1000, 1),
        "duration_minutes": round(duration / 60),
        "departure": departure.isoformat(),
        "samples": samples,
        "geometry": {"type": "LineString", "coordinates": path},
        "segments": {"type": "FeatureCollection", "features": segments},
        "sources": [source, "Open-Meteo", "OpenStreetMap rest areas (where available)"],
        "unavailable_feeds": sorted(unavailable),
        "rest_stops": rest_stops,
        "rest_stops_status": stops_status,
        "max_risk_score": max(s["risk"]["score"] for s in samples),
        "limitations": "Weather sampled about every 5 km at estimated arrival times, using constant average route speed. No live traffic adjustment. Unconnected incident/flood/landslide feeds are unknown, and mapped rest areas are not verified safe.",
    }



