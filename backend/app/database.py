from sqlalchemy import event
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from .config import settings
from .models import Base

engine = create_async_engine(settings.database_url, pool_pre_ping=True)
Session = async_sessionmaker(engine, expire_on_commit=False)

if settings.database_url.startswith("sqlite"):

    @event.listens_for(engine.sync_engine, "connect")
    def sqlite_fk(connection, _):
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()


async def get_db():
    async with Session() as session:
        yield session


async def init_db():
    # Local convenience only; production uses the versioned migration command.
    if settings.environment != "production":
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)



