import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func, text
from sqlalchemy.dialects.postgresql import ENUM as PgEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class FeedbackCategory(str, enum.Enum):
    feature = "feature"
    bug = "bug"
    ui = "ui"
    other = "other"


class Feedback(Base):
    __tablename__ = "feedbacks"
    __table_args__ = (
        Index("ix_feedbacks_created_at", text("created_at DESC")),
        # Chỉ phần chưa xử lý — đó là thứ hộp thư mở ra là muốn thấy.
        Index(
            "ix_feedbacks_pending",
            text("created_at DESC"),
            postgresql_where=text("handled_at IS NULL"),
        ),
        Index("ix_feedbacks_user_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    category: Mapped[FeedbackCategory] = mapped_column(
        PgEnum(
            FeedbackCategory,
            name="feedback_category",
            create_type=False,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    contact_email: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    # Admin đã xem và xử lý lúc nào. None = chưa xử lý.
    #
    # Mốc thời gian chứ không phải cờ boolean: biết "xử lý lúc nào" cho phép đo
    # được mình phản hồi người dùng nhanh hay chậm, còn true/false thì không.
    handled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
