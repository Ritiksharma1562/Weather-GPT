import asyncio
from pathlib import Path
from sqlalchemy import text
from .database import engine
from .models import Base


async def migrate():
    async with engine.begin() as conn:
        if engine.dialect.name == "sqlite":
            await conn.run_sync(Base.metadata.create_all)
            return
        await conn.execute(text("SELECT pg_advisory_xact_lock(8242171)"))
        await conn.execute(
            text(
                "CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz DEFAULT now())"
            )
        )
        applied = set(
            (
                await conn.execute(text("SELECT version FROM schema_migrations"))
            ).scalars()
        )
        for path in sorted((Path(__file__).parent.parent / "migrations").glob("*.sql")):
            if path.name in applied:
                continue
            # Migrations contain plain DDL only; never user-supplied SQL.
            for statement in path.read_text().split(";"):
                if statement.strip():
                    await conn.execute(text(statement))
            await conn.execute(
                text("INSERT INTO schema_migrations(version) VALUES (:version)"),
                {"version": path.name},
            )
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(migrate())



