from datetime import datetime
import re
from uuid import UUID
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class SportInput(BaseModel):
    sport: str = Field(min_length=2, max_length=60)
    skill_level: str


class OnboardInput(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    phone: Optional[str] = Field(default=None, max_length=30)
    pincode: str = Field(pattern=r"^\d{6}$")
    locality: str = Field(min_length=1, max_length=160)
    city: str = Field(min_length=1, max_length=160)
    state: str = ""
    street_address: Optional[str] = None
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    search_radius_km: int = Field(default=5, ge=1, le=30)
    sports: list[SportInput] = Field(min_length=1)

    @field_validator("phone")
    @classmethod
    def normalize_phone(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        compact = re.sub(r"[\s()-]", "", value.strip())
        if not compact:
            return None
        if re.fullmatch(r"[6-9][0-9]{9}", compact):
            compact = "+91" + compact
        if not re.fullmatch(r"\+[1-9][0-9]{7,14}", compact):
            raise ValueError("Enter a valid phone number with its country code")
        return compact


class ConnectionInput(BaseModel):
    receiver_id: str
    introduction: Optional[str] = Field(default=None, max_length=500)
    sport: Optional[str] = Field(default=None, max_length=60)


class GroupInput(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    description: str = ""
    sport: str


class GameInput(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    sport: str
    venue: str = Field(min_length=2, max_length=180)
    starts_at: datetime
    capacity: int = Field(ge=2, le=100)
    approval_required: bool = False


class MessageInput(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    client_id: UUID

    @field_validator("body")
    @classmethod
    def nonblank_body(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Message cannot be blank")
        return value


class ReadInput(BaseModel):
    last_read_message_id: int = Field(ge=1)


class InvitationInput(BaseModel):
    receiver_id: str


class BlockInput(BaseModel):
    blocked_id: str
