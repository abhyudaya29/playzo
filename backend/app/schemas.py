from datetime import datetime
import re
from uuid import UUID
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


SkillLevel = Literal["hobby", "beginner", "intermediate", "advanced", "pro"]


class SportInput(BaseModel):
    sport: str = Field(min_length=2, max_length=60)
    skill_level: SkillLevel
    play_intention: Literal["casual", "competitive", "both"] = "both"


class OnboardInput(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    phone: Optional[str] = Field(default=None, max_length=30)
    nickname: Optional[str] = Field(default=None, max_length=80)
    age: Optional[int] = Field(default=None, ge=1, le=120)
    gender: Optional[Literal["woman", "man", "non_binary", "other", "prefer_not_to_say"]] = None
    looking_for: Optional[Literal["join_individually", "find_group", "host_games"]] = None
    motivation: Optional[Literal["starting_out", "comeback", "try_something_new", "just_for_fun"]] = None
    languages: list[str] = Field(default_factory=list, max_length=10)
    pincode: str = Field(pattern=r"^[1-9]\d{5}$")
    locality: str = Field(min_length=1, max_length=160)
    city: str = Field(min_length=1, max_length=160)
    state: str = ""
    street_address: Optional[str] = None
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    search_radius_km: int = Field(default=5, ge=1, le=50)
    bio: Optional[str] = Field(default=None, max_length=1000)
    gender_self_description: Optional[str] = Field(default=None, max_length=100)
    gender_visibility: Literal["private", "public"] = "private"
    participation_interests: list[Literal["find_teammates", "join_groups", "create_groups", "join_games", "organize_games", "join_tournaments", "host_tournaments"]] = Field(default_factory=list, max_length=7)
    teammate_preference: Literal["women", "men", "mixed", "no_preference"] = "no_preference"
    discovery_visible: bool = True
    availability: list["AvailabilityInput"] = Field(default_factory=list, max_length=21)
    sports: list[SportInput] = Field(min_length=1, max_length=50)

    @field_validator("languages")
    @classmethod
    def clean_languages(cls, values: list[str]) -> list[str]:
        cleaned = list(dict.fromkeys(value.strip().title() for value in values))
        if any(not value or len(value) > 40 for value in cleaned):
            raise ValueError("Languages must contain 1–40 characters")
        return cleaned

    @field_validator("name")
    @classmethod
    def nonblank_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Enter your name")
        return value.strip()

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
    description: str = Field(default="", max_length=2000)
    sport: str
    visibility: Literal["public", "private"] = "public"
    capacity: Optional[int] = Field(default=None, ge=2, le=1000)


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


class AvailabilityInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    weekday: int = Field(ge=0, le=6)
    time_slot: Literal["morning", "afternoon", "evening"]


OnboardInput.model_rebuild()


class PreferencesInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    teammate_preference: Literal["women", "men", "mixed", "no_preference"] = "no_preference"
    discovery_visible: bool = True
    gender_visibility: Literal["private", "public"] = "private"
    search_radius_km: int = Field(default=5, ge=1, le=50)
    participation_interests: list[Literal["find_teammates", "join_groups", "create_groups", "join_games", "organize_games", "join_tournaments", "host_tournaments"]] = Field(default_factory=list, max_length=7)
    availability: list[AvailabilityInput] = Field(default_factory=list, max_length=21)


class DraftInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    step: int = Field(ge=0, le=6)
    # A typed partial profile allows incomplete steps, without allowing roles,
    # account status or unbounded arbitrary JSON through a draft endpoint.
    profile: dict

    @field_validator("profile")
    @classmethod
    def validate_partial_profile(cls, value):
        if set(value) - set(OnboardInput.model_fields):
            raise ValueError("Unknown profile field")
        import json
        if len(json.dumps(value)) > 16000:
            raise ValueError("Draft is too large")
        # Validate every populated field using the actual onboarding field type.
        from pydantic import TypeAdapter
        from typing import Annotated
        for key, item in value.items():
            if item is None or item == "" or item == []:
                continue
            if key == "pincode" and isinstance(item, str) and item.isdigit() and len(item) < 6:
                continue
            field = OnboardInput.model_fields[key]
            TypeAdapter(Annotated[field.annotation, *field.metadata]).validate_python(item)
        return value


class ProfilePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=150)
    bio: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value):
        if not value.strip():
            raise ValueError("Enter your display name")
        return value.strip()


class ReasonInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str = Field(min_length=5, max_length=1000)

    @field_validator("reason")
    @classmethod
    def reason_not_blank(cls, value):
        if len(value.strip()) < 5:
            raise ValueError("Give a meaningful reason")
        return value.strip()


class ReportInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    target_type: Literal["user", "group", "game", "tournament"]
    target_id: UUID
    reason: str = Field(min_length=5, max_length=2000)


class ReportReview(ReasonInput):
    status: Literal["open", "in_review", "resolved", "dismissed"]
    internal_notes: str = Field(default="", max_length=4000)


class OrganizerInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    organization: str = Field(min_length=2, max_length=150)
    experience: str = Field(min_length=20, max_length=2000)


class OrganizerReview(ReasonInput):
    status: Literal["verified", "rejected", "suspended"]


class TournamentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=2, max_length=120)
    sport: str = Field(min_length=2, max_length=60)
    city: str = Field(min_length=2, max_length=160)
    venue: str = Field(min_length=2, max_length=180)
    starts_at: datetime
    ends_at: datetime
    capacity: int = Field(ge=2, le=10000)
    rules: str = Field(default="", max_length=5000)

    @model_validator(mode="after")
    def valid_dates(self):
        from datetime import timezone
        if self.starts_at.tzinfo is None or self.ends_at.tzinfo is None:
            raise ValueError("Tournament dates must include a timezone")
        if self.starts_at <= datetime.now(timezone.utc) or self.ends_at <= self.starts_at:
            raise ValueError("Choose future start and end dates in order")
        return self


class TournamentTransition(ReasonInput):
    status: Literal["pending_approval", "published", "registration_open", "registration_closed", "in_progress", "completed", "cancelled", "draft"]


class MatchingWeights(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sport: float = Field(ge=0, le=1)
    distance: float = Field(ge=0, le=1)
    skill: float = Field(ge=0, le=1)
    availability: float = Field(ge=0, le=1)

    @model_validator(mode="after")
    def normalized(self):
        if abs(sum(self.model_dump().values()) - 1) > 0.00001:
            raise ValueError("Matching weights must sum to 1")
        return self


class SettingsInput(ReasonInput):
    default_radius_km: int = Field(ge=1, le=50)
    maximum_radius_km: int = Field(ge=1, le=50)
    matching_weights: MatchingWeights
    group_capacity: int = Field(ge=2, le=1000)
    organizer_approval_required: Literal[True]
    feature_flags: dict[Literal["tournaments"], bool]

    @model_validator(mode="after")
    def valid_radius(self):
        if self.default_radius_km > self.maximum_radius_km:
            raise ValueError("Default radius exceeds maximum radius")
        return self


class CatalogInput(ReasonInput):
    name: str = Field(min_length=2, max_length=60, pattern=r"^[A-Za-z][A-Za-z -]+$")
    active: bool = True


class AnalyticsConsentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    allowed: bool


class GroupSettingsInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    visibility: Literal["public", "private"]
    capacity: int = Field(ge=2, le=1000)


class GroupRoleInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["member", "admin"]


class GameTransitionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["cancelled", "completed"]
