import math

LEVELS = [
    (75, "Severe", "Red"),
    (50, "High", "Orange"),
    (25, "Moderate", "Yellow"),
    (0, "Low", "Green"),
]


def assess(point: dict) -> dict:
    factors: list[dict] = []

    def flag(condition, kind, score, description):
        if condition:
            factors.append({"type": kind, "score": score, "description": description})

    temp, rain, wind, visibility, code = (
        point.get(k)
        for k in (
            "temperature_2m",
            "precipitation",
            "wind_speed_10m",
            "visibility",
            "weather_code",
        )
    )
    flag(
        temp is not None and temp >= 40,
        "heat",
        60,
        "Forecast temperature at or above 40°C",
    )
    flag(
        temp is not None and temp <= 0,
        "cold",
        40,
        "Freezing temperatures; ice may form where moisture is present",
    )
    flag(
        rain is not None and rain >= 5,
        "rain",
        50 if (rain or 0) < 15 else 80,
        "Heavy hourly precipitation; reduced visibility and standing water are possible",
    )
    flag(
        wind is not None and wind >= 40,
        "wind",
        45 if (wind or 0) < 70 else 80,
        "Strong forecast winds",
    )
    flag(
        visibility is not None and visibility < 1000,
        "fog",
        55 if (visibility or 0) >= 200 else 85,
        "Low forecast visibility; fog or precipitation may obscure the road",
    )
    flag(
        code is not None and code >= 95,
        "thunderstorm",
        70,
        "Thunderstorm weather code in forecast",
    )
    score = max((f["score"] for f in factors), default=0)
    _, level, color = next(x for x in LEVELS if score >= x[0])
    missing = [
        key
        for key in ("temperature_2m", "precipitation", "wind_speed_10m", "visibility")
        if point.get(key) is None
    ]
    return {
        "score": score,
        "level": level if not missing else "Unknown",
        "severity": color if not missing else "Unknown",
        "factors": factors,
        "missing_metrics": missing,
        "basis": "Threshold-based weather screening, not an official warning or road-safety determination",
    }


def metrics(observed: list[float], predicted: list[float]) -> dict:
    pairs = [
        (a, b)
        for a, b in zip(observed, predicted)
        if a is not None and b is not None and math.isfinite(a) and math.isfinite(b)
    ]
    if len(pairs) < 2:
        return {
            "n": len(pairs),
            "mae": None,
            "rmse": None,
            "bias": None,
            "correlation": None,
        }
    n = len(pairs)
    a_mean, b_mean = sum(a for a, _ in pairs) / n, sum(b for _, b in pairs) / n
    denominator = math.sqrt(
        sum((a - a_mean) ** 2 for a, _ in pairs)
        * sum((b - b_mean) ** 2 for _, b in pairs)
    )
    return {
        "n": n,
        "mae": sum(abs(b - a) for a, b in pairs) / n,
        "rmse": math.sqrt(sum((b - a) ** 2 for a, b in pairs) / n),
        "bias": sum(b - a for a, b in pairs) / n,
        "correlation": sum((a - a_mean) * (b - b_mean) for a, b in pairs) / denominator
        if denominator
        else None,
    }


def haversine(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lat2 = math.radians(a[0]), math.radians(b[0])
    dlat, dlon = lat2 - lat1, math.radians(b[1] - a[1])
    h = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    )
    return 6371008.8 * 2 * math.asin(min(1, math.sqrt(h)))
