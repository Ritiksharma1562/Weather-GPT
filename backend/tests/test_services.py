from datetime import date, timedelta
import math
import pytest
from fastapi import HTTPException
from app.schemas import AgricultureRequest
from app.services import agriculture, weather
from app.services.risk import assess, metrics
from app.services.routing import sample_route


def test_statistics_pairwise_missing_and_zero_variance():
    result = metrics([1, 2, 3, None], [2, 4, 6, 5])
    assert result["n"] == 3
    assert result["mae"] == 2
    assert result["bias"] == 2
    assert result["rmse"] == pytest.approx(math.sqrt(14 / 3))
    assert result["correlation"] == pytest.approx(1)
    assert metrics([2, 2], [3, 3])["correlation"] is None
    assert metrics([None, 2], [3, None])["mae"] is None


def test_weather_screening_missing_is_unknown():
    assert assess({})["level"] == "Unknown"
    benign = {
        "temperature_2m": 24,
        "precipitation": 0,
        "wind_speed_10m": 12,
        "visibility": 10000,
        "weather_code": 0,
    }
    assert assess(benign)["level"] == "Low"
    extreme = assess({**benign, "visibility": 100, "precipitation": 18})
    assert extreme["level"] == "Severe"
    assert {f["type"] for f in extreme["factors"]} == {"fog", "rain"}
    assert all(
        f["type"] not in ("flood", "landslide", "accident") for f in extreme["factors"]
    )


def test_route_sampling_every_five_km_keeps_endpoints():
    path = [[0, 0], [0.12, 0]]
    samples = sample_route(path)
    assert [p["distance_m"] for p in samples[:-1]] == [0, 5000, 10000]
    assert samples[-1]["longitude"] == 0.12
    assert 13000 < samples[-1]["distance_m"] < 14000
    assert len(sample_route([[0, 0], [0.001, 0]])) == 2


async def test_crop_advice_computes_deficit_and_rejects_fake_rootzone(monkeypatch):
    async def fixture(*args):
        return {
            "current": {"time": 100, "soil_moisture_0_to_1cm": 0.25},
            "daily": [{"precipitation_sum": 1, "et0_fao_evapotranspiration": 4}] * 3,
            "hourly": [
                {
                    "time": 200,
                    "temperature_2m": 25,
                    "relative_humidity_2m": 50,
                    "wind_speed_10m": 8,
                    "precipitation_probability": 10,
                }
            ],
            "sources": ["Test weather fixture"],
        }

    monkeypatch.setattr(agriculture, "forecast", fixture)
    report = await agriculture.advice(
        AgricultureRequest(
            latitude=0,
            longitude=0,
            crop="wheat",
            sowing_date=date.today() - timedelta(days=60),
        )
    )
    assert report["irrigation_mm_72h"] == pytest.approx(11.4)
    assert report["spraying_windows"] == [200]
    assert "not a root-zone measurement" in report["soil_depth"]
    assert report["ai_available"] is False


async def test_crop_missing_et0_remains_unavailable(monkeypatch):
    async def fixture(*args):
        return {
            "current": {"time": 1},
            "daily": [{"precipitation_sum": 0, "et0_fao_evapotranspiration": None}],
            "hourly": [],
            "sources": [],
        }

    monkeypatch.setattr(agriculture, "forecast", fixture)
    report = await agriculture.advice(
        AgricultureRequest(
            latitude=0, longitude=0, crop="rice", sowing_date=date.today()
        )
    )
    assert report["irrigation_mm_72h"] is None


async def test_weather_failure_never_returns_fabricated_conditions(monkeypatch):
    async def unavailable(*args, **kwargs):
        raise HTTPException(502, "Provider down")

    monkeypatch.setattr(weather, "fetch_json", unavailable)
    with pytest.raises(HTTPException) as exc:
        await weather.forecast(12, 34)
    assert exc.value.status_code == 502


async def test_history_date_validation():
    with pytest.raises(HTTPException):
        await weather.history(0, 0, date.today(), date.today())
    with pytest.raises(HTTPException):
        await weather.history(0, 0, date(1900, 1, 1), date(1900, 1, 2))


async def test_aqi_failure_preserves_real_weather(monkeypatch):
    async def fixture(url, params, ttl):
        if "air-quality" in url:
            raise HTTPException(502, "AQI down")
        return {
            "current": {"time": 100, "temperature_2m": 20},
            "hourly": {"time": [100], "temperature_2m": [20], "visibility": [10000]},
            "daily": {"time": [100]},
            "timezone": "UTC",
        }

    monkeypatch.setattr(weather, "fetch_json", fixture)
    result = await weather.forecast(0, 0)
    assert result["current"]["temperature_2m"] == 20
    assert result["air_quality"] is None
    assert result["availability"]["air_quality"] == "unavailable"


