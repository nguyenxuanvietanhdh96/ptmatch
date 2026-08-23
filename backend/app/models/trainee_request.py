"""Yêu cầu tìm PT do học viên đăng — chiều ngược của marketplace.

Luồng thường (Lead) là học viên xem hồ sơ rồi gửi yêu cầu cho MỘT PT cụ thể.
Khi nguồn cung còn mỏng, xác suất tìm đúng người hợp cả giá lẫn khu vực khá
thấp, và mỗi lần không hợp là mất luôn nhu cầu đó.

Chiều này đảo lại: học viên đăng nhu cầu một lần, mọi PT phù hợp đều nhìn thấy
và chủ động nhận. Số điện thoại KHÔNG nằm trong dữ liệu công khai của bảng —
PT phải "nhận" thì mới có, và hành động nhận đó chính là chỗ thu phí về sau.
"""
import enum
import uuid
from datetime import datetime
from typing import Optional

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
from sqlalchemy.dialects.postgresql import ENUM as PgEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models.pt_profile import Gender

# Không giới hạn số PT được nhận một yêu cầu.
#
# Từng có trần (3, rồi 10) với lý do "học viên không bị chục PT gọi cùng lúc".
# Nhưng nó chặn nhầm chỗ: bấm nhận chỉ là lấy số điện thoại, không có nghĩa là
# liên hệ, càng không có nghĩa là chốt. Đủ trần thì yêu cầu biến mất khỏi bảng
# ngay cả khi chưa PT nào gọi — học viên chờ vô ích, PT đến sau không thấy nó
# nữa. Trần đó tạo trạng thái chết chứ không bảo vệ ai.
#
# `claim_count` vẫn đếm, nhưng chỉ để hiển thị và đo phễu
# (GET /api/requests/stats). Nếu số liệu cho thấy học viên thật sự bị gọi quá
# nhiều thì mở lại — bằng dữ liệu, không bằng phỏng đoán.

# Nhu cầu tìm PT hết hạn nhanh: quá thời gian này thì học viên hầu như đã chọn
# được người khác, và một bảng đầy yêu cầu cũ làm PT mất niềm tin vào nó.
REQUEST_LIFETIME_DAYS = 14


class RequestStatus(str, enum.Enum):
    open = "open"
    closed = "closed"


class CloseReason(str, enum.Enum):
    """Vì sao học viên đóng yêu cầu — số liệu chuyển đổi đáng tin duy nhất.

    Trạng thái lead do chính PT tự khai, nên `Lead.closed` không chứng minh được
    học viên tìm được người. Còn chính học viên bấm thì đó là kết quả thật.

    Lưu dạng chuỗi (String 30) chứ không PgEnum: thêm lý do về sau sẽ chỉ là một
    dòng code, không cần migration đổi type.
    """

    found_pt = "found_pt"
    no_longer_needed = "no_longer_needed"


class TraineeRequest(Base):
    __tablename__ = "trainee_requests"
    __table_args__ = (
    # Index dưới đây đã tồn tại trong DB (do migration tạo). Khai báo lại ở model
    # để `alembic revision --autogenerate` không coi chúng là thừa và sinh lệnh
    # DROP — một lần review vội là mất index, và mất index thì không có gì báo
    # lỗi, chỉ là truy vấn chậm dần.
        # Truy vấn chính của bảng tin: lọc "còn nhận được" rồi sắp theo mới nhất.
        Index("ix_trainee_requests_board", "status", "expires_at", "created_at"),
        Index("ix_trainee_requests_area", "city", "ward"),
        # Ngân sách tối thiểu không được lớn hơn tối đa.
        CheckConstraint(
            "budget_min IS NULL OR budget_max IS NULL OR budget_min <= budget_max",
            name="ck_trainee_requests_budget_range",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    trainee_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    trainee_name: Mapped[str] = mapped_column(String(150), nullable=False)
    # Không bao giờ xuất hiện trong response công khai — xem schemas/request.py.
    trainee_phone: Mapped[str] = mapped_column(String(20), nullable=False)
    # Kênh liên hệ phụ (link Facebook, nick Zalo...). Kín y như số điện thoại:
    # để công khai là mất luôn ranh giới thu phí ở bước "nhận yêu cầu".
    contact_other: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    specialty: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    ward: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    # Ngân sách theo buổi (VNĐ). Dạng số chứ không phải chuỗi như Lead.budget,
    # để PT lọc được đúng khoảng giá mình nhận.
    budget_min: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    budget_max: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    preferred_gender: Mapped[Optional[Gender]] = mapped_column(
        PgEnum(
            Gender,
            name="gender",
            create_type=False,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=True,
    )
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    status: Mapped[RequestStatus] = mapped_column(
        PgEnum(
            RequestStatus,
            name="request_status",
            create_type=False,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        default=RequestStatus.open,
        server_default="open",
    )
    # Null khi còn mở hoặc khi hết hạn — hết hạn không phải một lựa chọn của học
    # viên nên không có lý do.
    close_reason: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    # Đếm sẵn thay vì COUNT() mỗi lần lọc — cùng cách làm với avg_rating/review_count.
    claim_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
