import asyncio
import hashlib
import json
import httpx
from fastapi import HTTPException
from ..config import settings
from .cache import cache

client = httpx.AsyncClient(
    timeout=httpx.Timeout(25, connect=10),
    limits=httpx.Limits(max_connections=30),
    headers={"User-Agent": settings.provider_user_agent},
)
semaphore = asyncio.Semaphore(8)


async def fetch_json(
    url: str, params: dict | None = None, ttl: int = 300
) -> dict | list:
    key = (
        "provider:"
        + hashlib.sha256(
            (url + json.dumps(params or {}, sort_keys=True)).encode()
        ).hexdigest()
    )
    cached = await cache.get(key)
    if cached is not None:
        return cached
    async with semaphore:
        for attempt in range(3):
            try:
                response = await client.get(url, params=params)
                if response.status_code in (429, 502, 503, 504) and attempt < 2:
                    await asyncio.sleep(0.5 * (attempt + 1))
                    continue
                response.raise_for_status()
                if len(response.content) > 20_000_000:
                    raise HTTPException(
                        502, "Provider response exceeds the supported size"
                    )
                result = response.json()
                if isinstance(result, dict) and result.get("error"):
                    raise HTTPException(
                        502,
                        "The data provider could not process this location or date range",
                    )
                await cache.set(key, result, ttl)
                return result
            except (httpx.HTTPError, ValueError) as exc:
                if attempt < 2:
                    await asyncio.sleep(0.3 * (attempt + 1))
                    continue
                raise HTTPException(
                    502, "A data provider is temporarily unavailable. Please retry."
                ) from exc
    raise HTTPException(502, "Data provider unavailable")


def meteo_url(kind: str = "forecast") -> tuple[str, dict]:
    hosts = {
        "forecast": ("api", "forecast"),
        "archive": ("archive-api", "archive"),
        "air": ("air-quality-api", "air-quality"),
        "historical-forecast": ("historical-forecast-api", "forecast"),
        "climate": ("climate-api", "climate"),
    }
    host, path = hosts[kind]
    if settings.open_meteo_api_key:
        host = "customer-" + host
    return f"https://{host}.open-meteo.com/v1/{path}", (
        {"apikey": settings.open_meteo_api_key} if settings.open_meteo_api_key else {}
    )



