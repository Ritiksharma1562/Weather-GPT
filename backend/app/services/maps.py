import json
import math
from pathlib import Path
from fastapi import HTTPException
from shapely.geometry import Point, shape
from ..config import settings
from .providers import fetch_json
from .weather import rows, weather_points

LAYER_NAMES = {
    "radar": "Rain radar",
    "temperature": "Temperature",
    "precipitation": "Precipitation",
    "wind": "Wind",
    "humidity": "Humidity",
    "feels_like": "Feels like",
    "wind_chill": "Wind chill",
    "clouds": "Cloud cover",
    "satellite": "Satellite infrared",
    "lightning": "Lightning",
    "flood": "Flood zones",
    "landslide": "Landslide risk",
    "cyclone": "Cyclone tracks",
    "safe_zones": "Safe zones",
    "fires": "Fires",
    "incidents": "Road incidents",
    "alerts": "Official alerts",
}
GRID_LAYERS = {
    "temperature",
    "precipitation",
    "wind",
    "humidity",
    "feels_like",
    "wind_chill",
    "clouds",
}


def configured() -> dict:
    if not settings.layer_config_path:
        return {}
    path = Path(settings.layer_config_path)
    data = json.loads(path.read_text())
    if not isinstance(data, dict):
        raise ValueError("Layer configuration must be an object")
    return data


async def layers() -> dict:
    config = configured()
    frames = []
    radar_host = None
    try:
        raw = await fetch_json(
            "https://api.rainviewer.com/public/weather-maps.json", ttl=300
        )
        radar_host = raw.get("host")
        frames = [
            {"time": f["time"], "path": f["path"]}
            for f in raw.get("radar", {}).get("past", [])
        ]
    except HTTPException:
        pass
    result = []
    for key, name in LAYER_NAMES.items():
        external = config.get(key, {})
        available = (
            key in GRID_LAYERS
            or (key == "radar" and bool(frames))
            or key == "alerts"
            or bool(external.get("url"))
        )
        result.append(
            {
                "id": key,
                "name": name,
                "available": available,
                "type": "grid"
                if key in GRID_LAYERS
                else "raster"
                if key == "radar"
                else external.get("type", "geojson"),
                "source": "Open-Meteo model grid"
                if key in GRID_LAYERS
                else "RainViewer"
                if key == "radar"
                else "NOAA / configured regional feeds"
                if key == "alerts"
                else external.get("source", "Provider connection required"),
                "reason": None if available else f"No {name.lower()} feed configured",
                "frames": external.get("frames", []),
            }
        )
    return {
        "layers": result,
        "radar_frames": frames,
        "radar_host": radar_host,
        "grid_note": "A sampled forecast grid around the selected location; not a continuous global observation layer",
    }


async def geojson(layer: str) -> dict:
    config = configured().get(layer)
    if not config or config.get("type", "geojson") != "geojson":
        raise HTTPException(
            503, f"No {LAYER_NAMES.get(layer, layer)} GeoJSON provider configured"
        )
    data = await fetch_json(config["url"], ttl=300)
    if data.get("type") != "FeatureCollection":
        raise HTTPException(
            502, "Risk provider must return a GeoJSON FeatureCollection"
        )
    return {
        **data,
        "source": config.get("source", layer),
        "fetched_from": "configured provider",
    }


async def grid(latitude: float, longitude: float, hour: int) -> dict:
    points = [
        (
            max(-85, min(85, latitude + y * 0.3)),
            ((longitude + x * 0.3 + 180) % 360) - 180,
        )
        for y in range(-2, 3)
        for x in range(-2, 3)
    ]
    forecasts = await weather_points(points)
    features = []
    for (lat, lon), raw in zip(points, forecasts):
        forecast_rows = rows(raw.get("hourly"))
        if not forecast_rows:
            continue
        p = min(forecast_rows, key=lambda r: abs(r["time"] - hour))
        t, v = p.get("temperature_2m"), p.get("wind_speed_10m")
        chill = (
            round(13.12 + 0.6215 * t - 11.37 * v**0.16 + 0.3965 * t * v**0.16, 1)
            if t is not None and v is not None and t <= 10 and v >= 4.8
            else None
        )
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                "properties": {**p, "wind_chill": chill},
            }
        )
    return {
        "type": "FeatureCollection",
        "features": features,
        "source": "Open-Meteo sampled model grid",
    }


async def nearby_hazards(
    latitude: float, longitude: float, datasets: dict | None = None
) -> dict:
    config = configured()
    result = {"hazards": [], "unavailable": []}
    point = Point(longitude, latitude)
    for layer in (
        "flood",
        "landslide",
        "incidents",
        "safe_zones",
        "cyclone",
        "fires",
        "lightning",
    ):
        if layer not in config:
            result["unavailable"].append(layer)
            continue
        try:
            data = datasets.get(layer) if datasets is not None else await geojson(layer)
            if not data:
                result["unavailable"].append(layer)
                continue
            for feature in data.get("features", []):
                geometry = shape(feature["geometry"])
                # Latitude-adjusted local proximity; exact intersections take priority.
                nearby = geometry.intersects(point) or geometry.distance(point) <= 0.01
                if nearby:
                    result["hazards"].append(
                        {
                            "layer": layer,
                            "properties": feature.get("properties", {}),
                            "source": config[layer].get("source", layer),
                        }
                    )
        except (HTTPException, ValueError, KeyError, TypeError):
            result["unavailable"].append(layer)
    return result



