from datetime import date
from ..schemas import AgricultureRequest
from .weather import forecast

# FAO-56 crop coefficients (initial, mid-season, late season) and typical durations.
# Local cultivar and soil measurements should replace these generalized coefficients.
CROPS = {
    "rice": (1.05, 1.2, 0.9, 120, 35),
    "wheat": (0.3, 1.15, 0.25, 130, 30),
    "maize": (0.3, 1.2, 0.35, 125, 35),
    "cotton": (0.35, 1.15, 0.5, 180, 38),
    "tomato": (0.6, 1.15, 0.8, 120, 32),
    "potato": (0.5, 1.15, 0.75, 110, 30),
    "sugarcane": (0.4, 1.25, 0.75, 365, 38),
}


async def advice(request: AgricultureRequest) -> dict:
    weather = await forecast(request.latitude, request.longitude)
    initial, middle, late, duration, heat_threshold = CROPS[request.crop]
    age = (date.today() - request.sowing_date).days
    ratio = age / duration
    kc = initial if ratio < 0.2 else middle if ratio < 0.75 else late
    stage = (
        "Establishment"
        if ratio < 0.2
        else "Active growth"
        if ratio < 0.75
        else "Maturation"
    )
    days = weather["daily"][:3]
    rain = sum(d.get("precipitation_sum") or 0 for d in days)
    evap = sum(d.get("et0_fao_evapotranspiration") or 0 for d in days) * kc
    missing = any(
        d.get("precipitation_sum") is None
        or d.get("et0_fao_evapotranspiration") is None
        for d in days
    )
    water = None if missing else round(max(0, evap - 0.8 * rain), 1)
    now = weather["current"]["time"]
    hours = [p for p in weather["hourly"] if now <= p["time"] <= now + 72 * 3600]
    spray = [
        p["time"]
        for p in hours
        if p.get("precipitation_probability") is not None
        and p["precipitation_probability"] < 20
        and p.get("wind_speed_10m") is not None
        and 3 <= p["wind_speed_10m"] <= 15
        and p.get("temperature_2m") is not None
        and 10 <= p["temperature_2m"] <= 28
    ][:6]
    heat = any((p.get("temperature_2m") or -100) >= heat_threshold for p in hours)
    humid_hours = sum(
        1
        for p in hours
        if (p.get("relative_humidity_2m") or 0) >= 85
        and 15 <= (p.get("temperature_2m") or 0) <= 30
    )
    disease = "Elevated" if humid_hours >= 12 else "Lower"
    score = min(
        100,
        (40 if heat else 0)
        + (30 if humid_hours >= 12 else 0)
        + (30 if rain >= 50 else 0),
    )
    return {
        "crop": request.crop,
        "age_days": age,
        "stage": stage,
        "crop_coefficient": kc,
        "irrigation_mm_72h": water,
        "irrigation_advice": "Provider evapotranspiration data is incomplete"
        if water is None
        else f"Estimated atmospheric water deficit: {water} mm over 72 hours. Check root-zone soil moisture before irrigating.",
        "rain_mm_72h": round(rain, 1),
        "soil_moisture": weather["current"].get("soil_moisture_0_to_1cm"),
        "soil_depth": "0–1 cm model estimate; not a root-zone measurement",
        "spraying_windows": spray,
        "spraying_note": "Screened weather windows only; follow the product label, crop stage, and local advice.",
        "harvest_recommendation": "Crop may be near typical maturity; inspect the crop and prefer a dry window."
        if ratio >= 0.9
        else "Typical maturity has not been reached; inspect crop development before scheduling harvest.",
        "heat_stress": heat,
        "disease_weather_risk": disease,
        "risk_score": score,
        "risk_explanation": f"Heat flag: {heat}. Humid warm hours: {humid_hours}. Forecast 72-hour rain: {rain:.1f} mm.",
        "method": "FAO-56 coefficient × reference ET0 minus 80% of forecast rainfall; excludes soil storage and irrigation efficiency. Weather screening, not a disease diagnosis.",
        "sources": weather["sources"]
        + ["FAO Irrigation and Drainage Paper 56, generalized crop coefficients"],
        "ai_available": False,
    }



