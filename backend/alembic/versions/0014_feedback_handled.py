"""Đánh dấu góp ý đã xử lý, và index để đọc theo thứ tự mới nhất.

Bảng `feedbacks` trước đây chỉ có đường ghi: form gửi vào, không endpoint nào
đọc ra. Giờ có hộp thư cho admin, nên cần hai thứ:

1. `handled_at` — không có nó thì hộp thư chỉ là danh sách dài dần, mỗi lần mở
   lại phải đọc lại từ đầu để tìm cái chưa xem. Mốc thời gian (chứ không phải
   cờ boolean) để biết luôn là xử lý lúc nào.

2. Index trên `created_at DESC` — hộp thư luôn đọc theo mới nhất trước.

`ix_feedbacks_user_id`: khoá ngoại user_id vốn không có index, mà nó là
ON DELETE SET NULL — mỗi lần xoá một user, Postgres phải quét toàn bảng
feedbacks để tìm hàng cần cập nhật.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0014"
down_revision: Union[str, None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "feedbacks", sa.Column("handled_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_index(
        "ix_feedbacks_created_at",
        "feedbacks",
        [sa.text("created_at DESC")],
    )
    # Chỉ index phần chưa xử lý — đó là thứ hộp thư mở ra là muốn thấy.
    op.create_index(
        "ix_feedbacks_pending",
        "feedbacks",
        [sa.text("created_at DESC")],
        postgresql_where=sa.text("handled_at IS NULL"),
    )
    op.create_index("ix_feedbacks_user_id", "feedbacks", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_feedbacks_user_id", table_name="feedbacks")
    op.drop_index("ix_feedbacks_pending", table_name="feedbacks")
    op.drop_index("ix_feedbacks_created_at", table_name="feedbacks")
    op.drop_column("feedbacks", "handled_at")
