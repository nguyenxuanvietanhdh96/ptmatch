"""Theo dõi lead: nhật ký gửi thông báo, mã tra cứu cho học viên, mốc nhắc PT.

Ba thứ độc lập nhưng cùng phục vụ một câu hỏi: sau khi học viên bấm gửi, chuyện
gì thực sự xảy ra?

1. `notification_deliveries` — mỗi lần thử gửi một dòng. Trước đây kết quả gửi
   chỉ nằm trong log rồi trôi, nên không trả lời được "PT có nhận được không"
   và cũng không so sánh được kênh nào hiệu quả hơn.

2. `leads.track_token` — người gửi ẩn danh (phần lớn lead, vì form quảng cáo
   "không cần tạo tài khoản") hiện không có đường nào quay lại xem tình trạng.
   Mã ngẫu nhiên trong URL cho họ một trang tra cứu mà không cần tài khoản.

3. `leads.reminder_sent_at` — để job nhắc biết đã nhắc lead nào rồi, không nhắc
   lặp mỗi lần chạy.

`trainee_reported_no_contact_at`: học viên tự báo "PT chưa liên hệ". Đây là tín
hiệu chất lượng quý nhất có thể thu được — trạng thái lead do PT tự khai, còn
đây là phía cầu nói ngược lại.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Zalo user_id của PT theo Official Account — kênh zalo_oa cần nó để gửi tin.
    #
    # Cột riêng, KHÔNG dùng lại users.oauth_id: oauth_id là định danh theo ứng
    # dụng Zalo (đăng nhập), còn gửi tin OA cần định danh theo OA. Hai thứ này
    # không đảm bảo trùng nhau, và gộp chung thì lúc lệch sẽ rất khó lần.
    op.add_column("users", sa.Column("zalo_user_id", sa.String(64), nullable=True))

    op.add_column("leads", sa.Column("track_token", sa.String(64), nullable=True))
    op.add_column(
        "leads", sa.Column("reminder_sent_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "leads",
        sa.Column("trainee_reported_no_contact_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Sinh mã cho lead cũ để trang tra cứu dùng được với toàn bộ dữ liệu, không
    # chỉ lead tạo sau migration này.
    op.execute(
        "UPDATE leads SET track_token = replace(gen_random_uuid()::text, '-', '') "
        "WHERE track_token IS NULL"
    )
    op.alter_column("leads", "track_token", nullable=False)

    # Unique: mã là thứ duy nhất chứng minh quyền xem một lead, trùng nhau nghĩa
    # là người này xem được lead của người kia.
    op.create_index("uq_leads_track_token", "leads", ["track_token"], unique=True)

    # Job nhắc quét đúng các lead còn 'new' — index một phần để không phải duyệt
    # cả bảng mỗi lần chạy.
    op.create_index(
        "ix_leads_pending_reminder",
        "leads",
        ["created_at"],
        postgresql_where=sa.text("status = 'new' AND reminder_sent_at IS NULL"),
    )

    op.create_table(
        "notification_deliveries",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "lead_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("leads.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # "new_lead" | "lead_reminder" — cố ý dùng String chứ không enum, để
        # thêm loại thông báo mới không phải ALTER TYPE.
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column("channel", sa.String(40), nullable=False),
        # sent | failed | skipped
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    # KHÔNG lưu địa chỉ nhận (email/SĐT) ở bảng này: đó là PII đã có trong
    # users/leads, nhân bản ra chỉ tăng chỗ có thể rò rỉ mà không thêm thông tin.
    op.create_index(
        "ix_notification_deliveries_lead", "notification_deliveries", ["lead_id"]
    )
    op.create_index(
        "ix_notification_deliveries_channel_status",
        "notification_deliveries",
        ["channel", "status"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_notification_deliveries_channel_status", table_name="notification_deliveries"
    )
    op.drop_index("ix_notification_deliveries_lead", table_name="notification_deliveries")
    op.drop_table("notification_deliveries")
    op.drop_index("ix_leads_pending_reminder", table_name="leads")
    op.drop_index("uq_leads_track_token", table_name="leads")
    op.drop_column("leads", "trainee_reported_no_contact_at")
    op.drop_column("leads", "reminder_sent_at")
    op.drop_column("leads", "track_token")
    op.drop_column("users", "zalo_user_id")
