"""kênh liên hệ phụ cho yêu cầu tìm PT (Facebook/Zalo/...)

Revision ID: 0007
Revises: 0006
Create Date: 2026-08-17

Số điện thoại vẫn bắt buộc (ở Việt Nam nó cũng chính là Zalo), nhưng nhiều
người trẻ chỉ muốn được nhắn qua Facebook. Cột này giữ kênh liên hệ phụ và
được bảo vệ y hệt trainee_phone: không bao giờ nằm trong response công khai,
PT chỉ thấy sau khi nhận yêu cầu.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "trainee_requests",
        sa.Column("contact_other", sa.String(length=200), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("trainee_requests", "contact_other")
