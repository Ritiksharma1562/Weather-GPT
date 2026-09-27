from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import (
    JSON,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Record:
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class User(Record, Base):
    __tablename__ = "users"
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    google_sub: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True
    )
    display_name: Mapped[str] = mapped_column(String(100))
    avatar: Mapped[str | None] = mapped_column(Text, nullable=True)
    home_location: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class RefreshSession(Record, Base):
    __tablename__ = "refresh_sessions"
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    family: Mapped[str] = mapped_column(String(36), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(default=False)


class Location(Record, Base):
    __tablename__ = "locations"
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(150))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    position: Mapped[int] = mapped_column(Integer, default=0)


class WeatherCache(Record, Base):
    __tablename__ = "weather_cache"
    cache_key: Mapped[str] = mapped_column(String(128), unique=True)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    payload: Mapped[dict] = mapped_column(JSON)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class Alert(Record, Base):
    __tablename__ = "alerts"
    source_id: Mapped[str] = mapped_column(Text, unique=True)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    severity: Mapped[str] = mapped_column(String(20))
    payload: Mapped[dict] = mapped_column(JSON)
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class Route(Record, Base):
    __tablename__ = "routes"
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255))
    geojson: Mapped[dict] = mapped_column(JSON)
    analysis: Mapped[dict] = mapped_column(JSON)


class AgricultureReport(Record, Base):
    __tablename__ = "agriculture_reports"
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    crop: Mapped[str] = mapped_column(String(40))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    report: Mapped[dict] = mapped_column(JSON)


class ChatHistory(Record, Base):
    __tablename__ = "chat_history"
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    conversation_id: Mapped[str] = mapped_column(String(36), index=True)
    role: Mapped[str] = mapped_column(String(20))
    content: Mapped[dict] = mapped_column(JSON)


class HistoricalWeather(Record, Base):
    __tablename__ = "historical_weather"
    cache_key: Mapped[str] = mapped_column(String(128), unique=True)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    start_date: Mapped[str] = mapped_column(String(10))
    end_date: Mapped[str] = mapped_column(String(10))
    payload: Mapped[dict] = mapped_column(JSON)


class NotificationSettings(Record, Base):
    __tablename__ = "notification_settings"
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )
    preferences: Mapped[dict] = mapped_column(JSON, default=dict)


class PushSubscription(Record, Base):
    __tablename__ = "push_subscriptions"
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token: Mapped[str] = mapped_column(Text, unique=True)


class NotificationDelivery(Record, Base):
    __tablename__ = "notification_deliveries"
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    source_id: Mapped[str] = mapped_column(Text)
    __table_args__ = (UniqueConstraint("user_id", "source_id"),)


Index(
    "ix_history_location_dates",
    HistoricalWeather.latitude,
    HistoricalWeather.longitude,
    HistoricalWeather.start_date,
)
