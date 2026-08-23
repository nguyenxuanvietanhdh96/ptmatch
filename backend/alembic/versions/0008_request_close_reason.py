"""Lý do học viên đóng yêu cầu.

Đây là số liệu chuyển đổi duy nhất đáng tin của chợ ngược. Trạng thái lead do
chính PT tự khai — PT quên chuyển cột, hoặc chuyển bừa, thì `closed` không nói
được gì. Còn học viên bấm "đã tìm được PT" thì đó là kết quả thật.

Hai lý do được tách ra vì chúng dẫn tới hai việc làm khác nhau:
- found_pt: chợ chạy. Đếm cái này lên là bằng chứng để đi tiếp.
- no_longer_needed: mất nhu cầu. Nhiều thì phải hỏi tại sao — chờ lâu, PT gọi
  không hợp, hay tự tìm được ở nơi khác.

Nullable: yêu cầu hết hạn không có lý do, và các bản ghi cũ trước migration này
cũng không có.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.add_column(
        "trainee_requests",
        sa.Column("close_reason", sa.String(length=30), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("trainee_requests", "close_reason")
