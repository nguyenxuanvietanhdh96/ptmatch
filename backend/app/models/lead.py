import enum
import secrets
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func, text
from sqlalchemy.dialects.postgresql import ENUM as PgEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class LeadStatus(str, enum.Enum):
    new = "new"
    contacted = "contacted"
    closed = "closed"
    lost = "lost"


class Lead(Base):
    __tablename__ = "leads"
    __table_args__ = (
    # Index dưới đây đã tồn tại trong DB (do migration tạo). Khai báo lại ở model
    # để `alembic revision --autogenerate` không coi chúng là thừa và sinh lệnh
    # DROP — một lần review vội là mất index, và mất index thì không có gì báo
    # lỗi, chỉ là truy vấn chậm dần.
        Index("ix_leads_pt_profile_status", "pt_profile_id", "status"),
        Index("uq_leads_track_token", "track_token", unique=True),
        # Job nhắc chỉ quan tâm lead còn 'new' và chưa nhắc lần nào.
        Index(
            "ix_leads_pending_reminder",
            "created_at",
            postgresql_where=text("status = 'new' AND reminder_sent_at IS NULL"),
        ),
        Index(
            "ix_leads_responded",
            "pt_profile_id",
            "first_response_at",
            postgresql_where=text("first_response_at IS NOT NULL"),
        ),
        # Một PT chỉ nhận được một yêu cầu đúng một lần.
        Index(
            "uq_leads_request_pt",
            "request_id",
            "pt_profile_id",
            unique=True,
            postgresql_where=text("request_id IS NOT NULL"),
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
        index=True,
    )
    # Lead sinh ra từ việc PT nhận một yêu cầu mở trên bảng "Học viên cần PT".
    # Null với lead gửi thẳng cho một PT từ trang hồ sơ.
    request_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("trainee_requests.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Mã tra cứu cho học viên, nằm trong URL /track/<token>.
    #
    # Phần lớn lead là ẩn danh (form ghi rõ "không cần tạo tài khoản"), nên đây
    # là thứ duy nhất chứng minh quyền xem một lead. Vì vậy nó phải là chuỗi
    # ngẫu nhiên đủ dài và unique — đoán được mã là xem được lead người khác.
    track_token: Mapped[str] = mapped_column(
        String(64), nullable=False, default=lambda: secrets.token_urlsafe(24)
    )
    # Lần cuối job nhắc PT về lead này; None nghĩa là chưa nhắc lần nào.
    reminder_sent_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Học viên tự báo "PT chưa liên hệ" — tín hiệu từ phía cầu, đối trọng với
    # trạng thái do chính PT khai.
    trainee_reported_no_contact_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    trainee_name: Mapped[str] = mapped_column(String(150), nullable=False)
    trainee_phone: Mapped[str] = mapped_column(String(20), nullable=False)
    goal: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    area: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    budget: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    status: Mapped[LeadStatus] = mapped_column(
        PgEnum(
            LeadStatus,
            name="lead_status",
            create_type=False,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        default=LeadStatus.new,
        server_default="new",
    )
    # Lần đầu PT đổi trạng thái khỏi 'new' — dùng để tính thời gian phản hồi.
    # Chỉ ghi một lần, các lần đổi trạng thái sau không làm thay đổi.
    first_response_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
