"""Đánh giá phải được duyệt trước khi hiện công khai.

Trước migration này, bất kỳ ai có một số điện thoại đều đăng được 5 sao lên hồ
sơ bất kỳ và nó hiện ra ngay lập tức, tính luôn vào `avg_rating`. Admin chỉ có
một công cụ duy nhất là xoá cứng — tức là dọn *sau khi* nội dung đã công khai.
Trong khi đó trang tìm kiếm quảng cáo "đánh giá thật từ học viên", và điểm số
này là tín hiệu niềm tin chính của cả chợ.

Chọn `approved_at` (mốc thời gian) thay vì cờ boolean hay enum trạng thái, theo
đúng cách `handled_at`, `replied_at`, `first_response_at` đang làm trong dự án:
NULL nghĩa là chưa duyệt, có giá trị thì biết luôn duyệt lúc nào.

Backfill: mọi đánh giá đang có được đánh dấu đã duyệt bằng chính `created_at`.
Chúng đã hiển thị công khai từ trước; ẩn ngược lại sẽ làm điểm của PT tụt xuống
0 mà không ai hiểu vì sao.

Index một phần trên các đánh giá đã duyệt: đây là tập được đọc ở mọi lượt xem
hồ sơ và ở câu tính lại avg_rating.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "reviews", sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.execute("UPDATE reviews SET approved_at = created_at")
    op.create_index(
        "ix_reviews_pt_approved",
        "reviews",
        ["pt_profile_id"],
        postgresql_where=sa.text("approved_at IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_reviews_pt_approved", table_name="reviews")
    op.drop_column("reviews", "approved_at")
