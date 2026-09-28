from datetime import date, datetime
from typing import Literal
from uuid import UUID
from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    HttpUrl,
    field_validator,
    model_validator,
)


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Coordinates(Input):
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)


class Signup(Input):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    display_name: str = Field(min_length=1, max_length=100)


class Login(Input):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class GoogleLogin(Input):
    credential: str = Field(min_length=20, max_length=10000)


class Profile(Input):
    display_name: str = Field(min_length=1, max_length=100)
    avatar: HttpUrl | None = None
    home_location: "Place | None" = None


class Place(Coordinates):
    name: str = Field(min_length=1, max_length=150)


class Reorder(Input):
    ids: list[UUID] = Field(max_length=30)


class Preferences(Input):
    alert_types: list[
        Literal[
            "rain",
            "flood",
            "cyclone",
            "heat",
            "cold",
            "fog",
            "landslide",
            "thunderstorm",
            "wind",
            "fire",
        ]
    ] = Field(
        default_factory=lambda: [
            "rain",
            "flood",
            "cyclone",
            "heat",
            "cold",
            "fog",
            "landslide",
            "thunderstorm",
            "wind",
            "fire",
        ]
    )
    severities: list[Literal["Green", "Yellow", "Orange", "Red"]] = Field(
        default_factory=lambda: ["Yellow", "Orange", "Red"]
    )
    push_enabled: bool = False
    voice_enabled: bool = False
    language: Literal["en", "hi"] = "en"
    voice: Literal[
        "alloy", "nova", "shimmer", "onyx", "echo", "fable", "sage", "coral"
    ] = "coral"


class PushToken(Input):
    token: str = Field(min_length=20, max_length=4096)


class AgricultureRequest(Coordinates):
    crop: Literal["rice", "wheat", "maize", "cotton", "tomato", "potato", "sugarcane"]
    sowing_date: date

    @field_validator("sowing_date")
    @classmethod
    def past_date(cls, v):
        if v > date.today():
            raise ValueError("Sowing date must not be in the future")
        return v


class RouteRequest(Input):
    origin: Coordinates
    destination: Coordinates
    departure: datetime | None = None
    name: str = Field(default="Trip", max_length=255)


class ChatRequest(Coordinates):
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: UUID | None = None


class SpeechRequest(Input):
    text: str = Field(min_length=1, max_length=1500)
    voice: Literal[
        "alloy", "nova", "shimmer", "onyx", "echo", "fable", "sage", "coral"
    ] = "coral"


class Observation(Input):
    time: datetime
    temperature: float = Field(ge=-100, le=70, allow_inf_nan=False)


class ComparisonRequest(Coordinates):
    observations: list[Observation] = Field(min_length=2, max_length=2000)

    @model_validator(mode="after")
    def unique_times(self):
        if len({o.time for o in self.observations}) != len(self.observations):
            raise ValueError("Observation timestamps must be unique")
        if any(o.time.tzinfo is None for o in self.observations):
            raise ValueError("Observation timestamps must include a timezone")
        return self



