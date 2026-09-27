import httpx
from fastapi import HTTPException

async def city_to_coordinates(city: str):
    url = "https://geocoding-api.open-meteo.com/v1/search"

    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(url, params={
            "name": city,
            "count": 1,
            "language": "en",
            "format": "json"
        })

    if r.status_code != 200:
        raise HTTPException(502, "Geocoding failed")

    data = r.json()

    if not data.get("results"):
        return None

    place = data["results"][0]

    return {
        "name": place["name"],
        "latitude": place["latitude"],
        "longitude": place["longitude"],
        "country": place.get("country", "")
    }