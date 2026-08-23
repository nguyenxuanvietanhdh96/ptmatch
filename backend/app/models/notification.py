import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class NotificationDelivery(Base):
    """Một lần THỬ gửi thông báo — thành công hay không đều ghi.

    Trước khi có bảng này, kết quả gửi chỉ nằm trong log ứng dụng rồi trôi theo
    log rotation. Hai câu hỏi quan trọng nhất của luồng lead vì thế không trả
    lời được: "PT có thật sự nhận được không" và "kênh nào khiến PT phản hồi
    nhanh hơn". Nối bảng này với `Lead.first_response_at` là ra cả hai.

    KHÔNG lưu địa chỉ nhận (email/SĐT): đó là PII đã nằm ở users/leads, chép ra
    đây chỉ thêm một chỗ có thể rò rỉ mà không thêm thông tin gì.
    """

    __tablename__ = "notification_deliveries"
    __table_args__ = (
        Index("ix_notification_deliveries_lead", "lead_id"),
        Index("ix_notification_deliveries_channel_status", "channel", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    lead_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leads.id", ondelete="CASCADE"), nullable=False
    )
    # "new_lead" | "lead_reminder". String chứ không enum để thêm loại thông báo
    # mới không kéo theo một migration ALTER TYPE.
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    channel: Mapped[str] = mapped_column(String(40), nullable=False)
    # sent | failed | skipped
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
