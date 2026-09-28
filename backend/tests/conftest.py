import os
import tempfile
from pathlib import Path

# Isolated test database. Never point tests at a user's database.
TEST_DIR = tempfile.TemporaryDirectory(prefix="weathergpt-tests-")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{Path(TEST_DIR.name) / 'test.db'}"
os.environ["ENVIRONMENT"] = "test"
os.environ["JWT_SECRET_KEY"] = "isolated-test-key-not-used-by-any-running-app-123456789"
os.environ["REDIS_URL"] = ""
os.environ["OPENAI_API_KEY"] = ""
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from app.database import engine
from app.models import Base
from app.main import app
from app.services.cache import cache


@pytest_asyncio.fixture(autouse=True)
async def database():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    cache.memory.clear()
    yield
    await engine.dispose()


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        headers={"Origin": "http://127.0.0.1:3000"},
    ) as client:
        yield client


async def create_user(client, email="weather-test@example.com"):
    response = await client.post(
        "/auth/signup",
        json={
            "email": email,
            "password": "Test-only-password-491!",
            "display_name": "Test Explorer",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


