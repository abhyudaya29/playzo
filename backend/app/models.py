import uuid
from datetime import datetime
from typing import Optional

from geoalchemy2 import Geography
from sqlalchemy import (
    BigInteger,
    JSON,
    DateTime,
    func,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    clerk_id: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(150), default="Player")
    # Self-reported contact number only; saving it does not verify ownership.
    phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    bio: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    onboarding_completed: Mapped[bool] = mapped_column(default=False)
    search_radius_km: Mapped[int] = mapped_column(Integer, default=5)


class Location(Base):
    __tablename__ = "user_locations"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    pincode: Mapped[str] = mapped_column(String(6))
    locality: Mapped[str] = mapped_column(String(160))
    city: Mapped[str] = mapped_column(String(160))
    state: Mapped[str] = mapped_column(String(160), default="")
    street_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    discovery_point: Mapped[Optional[str]] = mapped_column(
        Geography(geometry_type="POINT", srid=4326), nullable=True
    )


class Sport(Base):
    __tablename__ = "user_sports"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    sport: Mapped[str] = mapped_column(String(60), primary_key=True)
    skill_level: Mapped[str] = mapped_column(String(20))


class Connection(Base):
    __tablename__ = "connections"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    requester_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    receiver_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(20), default="pending")

    introduction: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    sport: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (UniqueConstraint("requester_id", "receiver_id"),)


class Group(Base):
    __tablename__ = "groups"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text, default="")
    sport: Mapped[str] = mapped_column(String(60))
    locality: Mapped[str] = mapped_column(String(160), default="")


class GroupMember(Base):
    __tablename__ = "group_members"

    group_id: Mapped[str] = mapped_column(ForeignKey("groups.id"), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    role: Mapped[str] = mapped_column(String(20), default="member")


class Game(Base):
    __tablename__ = "games"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    host_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(120))
    sport: Mapped[str] = mapped_column(String(60))
    venue: Mapped[str] = mapped_column(String(180))
    locality: Mapped[str] = mapped_column(String(160), default="")
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    capacity: Mapped[int] = mapped_column(Integer, default=4)
    status: Mapped[str] = mapped_column(String(20), default="open")
    approval_required: Mapped[bool] = mapped_column(
        default=False, server_default="false"
    )


class GameParticipant(Base):
    __tablename__ = "game_participants"

    game_id: Mapped[str] = mapped_column(ForeignKey("games.id"), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    kind: Mapped[str] = mapped_column(String(12))
    direct_key: Mapped[Optional[str]] = mapped_column(
        String(80), unique=True, nullable=True
    )
    group_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE"), unique=True
    )
    game_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("games.id", ondelete="CASCADE"), unique=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class ConversationMember(Base):
    __tablename__ = "conversation_members"

    conversation_id: Mapped[str] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_read_message_id: Mapped[int] = mapped_column(
        BigInteger, default=0, server_default="0"
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    conversation_id: Mapped[str] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    sender_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    client_id: Mapped[str] = mapped_column(String(36))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (UniqueConstraint("conversation_id", "sender_id", "client_id"),)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(40))
    payload: Mapped[dict] = mapped_column(JSON)
    is_read: Mapped[bool] = mapped_column(default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class UserBlock(Base):
    __tablename__ = "user_blocks"

    blocker_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    blocked_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class MembershipRequest(Base):
    __tablename__ = "membership_requests"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    group_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE")
    )
    game_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("games.id", ondelete="CASCADE")
    )
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint("group_id", "user_id"),
        UniqueConstraint("game_id", "user_id"),
    )


class GameInvitation(Base):
    __tablename__ = "game_invitations"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    game_id: Mapped[str] = mapped_column(
        ForeignKey("games.id", ondelete="CASCADE"), index=True
    )
    sender_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    receiver_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (UniqueConstraint("game_id", "receiver_id"),)
