import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Index, String, func, text
from sqlalchemy.dialects.postgresql import ENUM as PgEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class UserRole(str, enum.Enum):
    pt = "pt"
    trainee = "trainee"
    admin = "admin"


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
    # Index dưới đây đã tồn tại trong DB (do migration tạo). Khai báo lại ở model
    # để `alembic revision --autogenerate` không coi chúng là thừa và sinh lệnh
    # DROP — một lần review vội là mất index, và mất index thì không có gì báo
    # lỗi, chỉ là truy vấn chậm dần.
        # Một danh tính OAuth chỉ gắn được vào một tài khoản.
        Index(
            "uq_users_oauth",
            "oauth_provider",
            "oauth_id",
            unique=True,
            postgresql_where=text("oauth_provider IS NOT NULL AND oauth_id IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )
    full_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    oauth_provider: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    oauth_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    oauth_avatar_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    role: Mapped[UserRole] = mapped_column(
        PgEnum(
            UserRole,
            name="user_role",
            create_type=False,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
    )
    subscription_tier: Mapped[str] = mapped_column(
        String(20), nullable=False, default="free", server_default="free"
    )
    # Định danh Zalo theo Official Account, để gửi thông báo lead qua kênh
    # zalo_oa. Chỉ có khi PT đã quan tâm (follow) OA. Khác oauth_id — xem
    # alembic 0013.
    zalo_user_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    # Mốc thời gian đổi mật khẩu / thêm email thật gần nhất. NULL = chưa bao
    # giờ đổi — không hạn chế gì (tương thích ngược, tránh phải backfill mọi
    # user cũ). Token có `iat` TRƯỚC mốc này bị coi là đã thu hồi: kẻ giữ một
    # refresh token trộm được không còn giữ được phiên sau khi chủ tài khoản
    # đặt lại mật khẩu — trước đây reset-password chỉ cấp token mới, không thu
    # hồi token cũ, nên phiên bị đánh cắp sống tới hết hạn 30 ngày kể cả sau khi
    # "khôi phục" tài khoản.
    credentials_changed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
