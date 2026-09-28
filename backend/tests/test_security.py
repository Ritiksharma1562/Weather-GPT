import pytest
from .conftest import create_user


async def test_signup_login_and_wrong_password(client):
    account = await create_user(client)
    assert "password" not in str(account["user"])
    assert (
        "httponly"
        in client.cookies.jar._cookies["test.local"]["/"]["wg_refresh"]
        ._rest.keys()
        .__str__()
        .lower()
    )
    bad = await client.post(
        "/auth/login",
        json={"email": "weather-test@example.com", "password": "wrong-password"},
    )
    assert bad.status_code == 401
    good = await client.post(
        "/auth/login",
        json={
            "email": "weather-test@example.com",
            "password": "Test-only-password-491!",
        },
    )
    assert good.status_code == 200
    assert good.json()["user"]["id"] == account["user"]["id"]


async def test_refresh_rotation_reuse_revokes_entire_family(client):
    first = await create_user(client)
    old_cookie = client.cookies.get("wg_refresh")
    refreshed = await client.post("/auth/refresh")
    assert refreshed.status_code == 200
    new_token = refreshed.json()["access_token"]
    assert client.cookies.get("wg_refresh") != old_cookie
    replay = await client.post(
        "/auth/refresh", headers={"Cookie": f"wg_refresh={old_cookie}"}
    )
    assert replay.status_code == 401
    profile = await client.get(
        "/profile", headers={"Authorization": f"Bearer {new_token}"}
    )
    assert profile.status_code == 401


async def test_guest_cannot_save_and_owner_isolation(client):
    guest = (await client.post("/auth/guest")).json()["access_token"]
    place = {"name": "Test field", "latitude": 28.6, "longitude": 77.2}
    assert (
        await client.post(
            "/places", headers={"Authorization": f"Bearer {guest}"}, json=place
        )
    ).status_code == 403
    a = await create_user(client, "a@example.com")
    headers_a = {"Authorization": f"Bearer {a['access_token']}"}
    saved = await client.post("/places", headers=headers_a, json=place)
    assert saved.status_code == 201
    b = await create_user(client, "b@example.com")
    headers_b = {"Authorization": f"Bearer {b['access_token']}"}
    assert (await client.get("/places", headers=headers_b)).json() == []
    assert (
        await client.delete(f"/places/{saved.json()['id']}", headers=headers_b)
    ).status_code == 404
    assert len((await client.get("/places", headers=headers_a)).json()) == 1


async def test_reorder_requires_complete_owned_set(client):
    a = await create_user(client)
    headers = {"Authorization": f"Bearer {a['access_token']}"}
    ids = []
    for name in ("First", "Second"):
        response = await client.post(
            "/places",
            headers=headers,
            json={"name": name, "latitude": 0, "longitude": 0},
        )
        ids.append(response.json()["id"])
    assert (
        await client.put(
            "/places/order", headers=headers, json={"ids": [ids[0], ids[0]]}
        )
    ).status_code == 422
    assert (
        await client.put(
            "/places/order", headers=headers, json={"ids": list(reversed(ids))}
        )
    ).status_code == 200
    assert [
        p["name"] for p in (await client.get("/places", headers=headers)).json()
    ] == ["Second", "First"]


async def test_cross_origin_and_logout(client):
    a = await create_user(client)
    assert (
        await client.post("/auth/refresh", headers={"Origin": "https://evil.example"})
    ).status_code == 403
    assert (await client.post("/auth/logout")).status_code == 200
    assert (
        await client.get(
            "/profile", headers={"Authorization": f"Bearer {a['access_token']}"}
        )
    ).status_code == 401


@pytest.mark.parametrize(
    "lat,lon", [(91, 0), (0, 181), (-91, 0), ("nan", 0), (0, "inf")]
)
async def test_coordinate_validation(client, lat, lon):
    assert (
        await client.get(f"/weather/forecast?latitude={lat}&longitude={lon}")
    ).status_code == 422


async def test_unconfigured_ai_is_explicit(client):
    guest = (await client.post("/auth/guest")).json()["access_token"]
    response = await client.post(
        "/ai/chat",
        headers={"Authorization": f"Bearer {guest}"},
        json={"latitude": 0, "longitude": 0, "message": "Will it rain?"},
    )
    assert response.status_code == 503
    assert "OPENAI_API_KEY" in response.json()["detail"]


