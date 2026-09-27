"""Opt-in integration checks against actual providers and a running local API.

Run: .venv/bin/python scripts/smoke_live.py
No provider responses are substituted. Failures may indicate provider downtime.
"""

import asyncio
import json
from datetime import datetime, timedelta, timezone
import httpx
import websockets


async def main():
    async with httpx.AsyncClient(
        base_url="http://127.0.0.1:8000", timeout=150
    ) as client:
        session = (await client.post("/auth/guest")).json()
        client.headers["Authorization"] = "Bearer " + session["access_token"]
        now = datetime.now(timezone.utc)
        end = (now - timedelta(days=7)).date().isoformat()
        start = (now - timedelta(days=9)).date().isoformat()
        point = "latitude=28.6139&longitude=77.209"
        checks = [
            ("forecast", "/weather/forecast?" + point),
            ("history", f"/weather/history?{point}&start={start}&end={end}"),
            ("radar", "/map/layers"),
            ("forecast grid", f"/map/grid?{point}&hour={int(now.timestamp())}"),
            ("alerts", "/alerts/live?latitude=40.7128&longitude=-74.006"),
            ("climate scenario", f"/analytics/climate?{point}&start=2030&end=2031"),
            ("NASA POWER", f"/weather/nasa?{point}&start={start}&end={end}"),
        ]
        failures = []
        for name, path in checks:
            response = await client.get(path)
            print(f"{name}: HTTP {response.status_code}")
            if response.status_code != 200:
                failures.append(name)
                print(response.text[:200])
            elif name == "forecast":
                data = response.json()
                assert len(data["hourly"]) >= 72 and len(data["daily"]) == 15
                assert data["current"]["temperature_2m"] is not None
            elif name == "forecast grid":
                assert len(response.json()["features"]) == 25
        crop = await client.post(
            "/agriculture/advice",
            json={
                "latitude": 28.6139,
                "longitude": 77.209,
                "crop": "wheat",
                "sowing_date": (now - timedelta(days=60)).date().isoformat(),
            },
        )
        print(f"agriculture: HTTP {crop.status_code}")
        if crop.status_code != 200:
            failures.append("agriculture")
        route = await client.post(
            "/route/analyze",
            json={
                "origin": {"latitude": 28.6139, "longitude": 77.209},
                "destination": {"latitude": 28.5355, "longitude": 77.391},
                "name": "Live verification route",
            },
        )
        print(f"route: HTTP {route.status_code}")
        if route.status_code != 200:
            failures.append("route")
            print(route.text[:200])
        else:
            assert len(route.json()["samples"]) >= 2
        async with websockets.connect(
            "ws://127.0.0.1:8000/ws/live",
            origin="http://127.0.0.1:3000",
            max_size=2_000_000,
        ) as socket:
            await socket.send(
                json.dumps(
                    {
                        "token": session["access_token"],
                        "latitude": 28.6139,
                        "longitude": 77.209,
                    }
                )
            )
            message = json.loads(await asyncio.wait_for(socket.recv(), 40))
            assert (
                message["type"] == "weather"
                and message["data"]["current"]["temperature_2m"] is not None
            )
            print("authenticated WebSocket: live weather received")
        if failures:
            raise SystemExit("Provider checks failed: " + ", ".join(failures))
        print("All live integration checks passed.")


if __name__ == "__main__":
    asyncio.run(main())
