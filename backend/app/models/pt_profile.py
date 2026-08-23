import enum
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import (
    Boolean,
    Computed,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ENUM as PgEnum
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

# Specialty slugs — CONTRACT with frontend, do not change.
SPECIALTY_SLUGS = (
    "weight_loss",
    "muscle_gain",
    "bodybuilding",
    "female_fitness",
    "beginner",
    "senior",
    "rehab",
    "online_coaching",
)


class Gender(str, enum.Enum):
    male = "male"
    female = "female"
    other = "other"


class PortfolioType(str, enum.Enum):
    before_after = "before_after"
    photo = "photo"
    video = "video"


class PTProfile(Base):
    __tablename__ = "pt_profiles"
    __table_args__ = (
    # Index dưới đây đã tồn tại trong DB (do migration tạo). Khai báo lại ở model
    # để `alembic revision --autogenerate` không coi chúng là thừa và sinh lệnh
    # DROP — một lần review vội là mất index, và mất index thì không có gì báo
    # lỗi, chỉ là truy vấn chậm dần.
        # Sắp xếp mặc định của trang tìm kiếm: lọc hồ sơ đang bật rồi xếp theo điểm.
        Index("ix_pt_profiles_active_rating", "is_active", "avg_rating"),
        # GIN cho tìm toàn văn (tsvector sinh sẵn) và lọc theo chuyên môn (JSONB).
        Index(
            "ix_pt_profiles_search_vector",
            "search_vector",
            postgresql_using="gin",
        ),
        Index(
            "ix_pt_profiles_specialties",
            "specialties",
            postgresql_using="gin",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    slug: Mapped[str] = mapped_column(
        String(150), unique=True, index=True, nullable=False
    )
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    gender: Mapped[Optional[Gender]] = mapped_column(
        PgEnum(
            Gender,
            name="gender",
            create_type=False,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=True,
    )
    age: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    experience_years: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    bio: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    certifications: Mapped[List[str]] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    specialties: Mapped[List[str]] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    social_links: Mapped[Dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb")
    )
    pricing: Mapped[Dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb")
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    avg_rating: Mapped[float] = mapped_column(
        Float, nullable=False, default=0, server_default=text("0")
    )
    review_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    view_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    search_vector = mapped_column(
        TSVECTOR,
        Computed(
            "to_tsvector('simple', ptmatch_unaccent(coalesce(full_name, '') || ' ' || coalesce(bio, '')))",
            persisted=True,
        ),
        nullable=True,
    )
    # Lần cuối PT dùng dashboard. Cập nhật có tiết chế (xem api/deps.py) chứ
    # không phải mỗi request, để tránh một lượt UPDATE cho mỗi lần gọi API.
    last_active_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    locations: Mapped[List["PTLocation"]] = relationship(
        back_populates="profile",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="PTLocation.gym_name",
    )
    portfolio_items: Mapped[List["PortfolioItem"]] = relationship(
        back_populates="profile",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="PortfolioItem.sort_order",
    )


class PTLocation(Base):
    __tablename__ = "pt_locations"
    __table_args__ = (
    # Index dưới đây đã tồn tại trong DB (do migration tạo). Khai báo lại ở model
    # để `alembic revision --autogenerate` không coi chúng là thừa và sinh lệnh
    # DROP — một lần review vội là mất index, và mất index thì không có gì báo
    # lỗi, chỉ là truy vấn chậm dần.
        Index("ix_pt_locations_city", "city"),
        Index("ix_pt_locations_ward", "ward"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    pt_profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pt_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    gym_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    # Phường/xã. Từ 01/07/2025 đây là cấp hành chính ngay dưới tỉnh/thành —
    # cấp huyện đã bị bỏ (xem alembic 0011).
    ward: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    profile: Mapped[PTProfile] = relationship(back_populates="locations")


class PortfolioItem(Base):
    __tablename__ = "portfolio_items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    pt_profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pt_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    type: Mapped[PortfolioType] = mapped_column(
        PgEnum(
            PortfolioType,
            name="portfolio_type",
            create_type=False,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
    )
    before_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    after_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    media_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )

    profile: Mapped[PTProfile] = relationship(back_populates="portfolio_items")
