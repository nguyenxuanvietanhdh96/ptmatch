import uuid
from datetime import datetime
from typing import List, Optional

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Review(Base):
    __tablename__ = "reviews"
    __table_args__ = (
        CheckConstraint("rating >= 1 AND rating <= 5", name="ck_reviews_rating_range"),
        # Mỗi người một đánh giá cho mỗi PT — khai báo ở tầng DB vì kiểm tra
        # trong API là check-then-insert, hai request song song vẫn lọt cả hai.
        # Xem alembic 0009 để biết vì sao có cả nhánh ẩn danh theo SĐT.
        Index(
            "uq_reviews_pt_trainee",
            "pt_profile_id",
            "trainee_id",
            unique=True,
            postgresql_where=text("trainee_id IS NOT NULL"),
        ),
        Index(
            "uq_reviews_pt_anon_phone",
            "pt_profile_id",
            "reviewer_phone",
            unique=True,
            postgresql_where=text("trainee_id IS NULL AND reviewer_phone IS NOT NULL"),
        ),
        Index("ix_reviews_trainee_id", "trainee_id"),
        # Tập đánh giá đã duyệt — đọc ở mọi lượt xem hồ sơ và ở câu tính lại
        # avg_rating. Khai báo lại ở model để autogenerate không sinh lệnh DROP.
        Index(
            "ix_reviews_pt_approved",
            "pt_profile_id",
            postgresql_where=text("approved_at IS NOT NULL"),
        ),
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
    trainee_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    reviewer_name: Mapped[str] = mapped_column(String(150), nullable=False)
    reviewer_phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    images: Mapped[List[str]] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    reply_content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    replied_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # NULL = chờ duyệt: không hiện công khai và không tính vào avg_rating.
    # Xem alembic 0015 để biết vì sao là mốc thời gian chứ không phải cờ boolean.
    approved_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
