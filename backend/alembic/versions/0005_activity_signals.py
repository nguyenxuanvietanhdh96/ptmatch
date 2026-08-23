"""activity signals: pt last_active_at + lead first_response_at

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-17

Hai cột phục vụ các tín hiệu "PT này còn hoạt động và có trả lời không" hiển
thị trên hồ sơ công khai — nỗi lo lớn nhất của học viên khi gửi yêu cầu là
không ai phản hồi.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "pt_profiles",
        sa.Column("last_active_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "leads",
        sa.Column("first_response_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Lead đã có index trên pt_profile_id; index riêng phần này giúp truy vấn
    # thống kê thời gian phản hồi chỉ quét các lead đã được trả lời.
    op.create_index(
        "ix_leads_responded",
        "leads",
        ["pt_profile_id", "first_response_at"],
        postgresql_where=sa.text("first_response_at IS NOT NULL"),
    )

    # KHÔNG backfill first_response_at cho lead cũ.
    #
    # Bản đầu của migration này đặt first_response_at = created_at cho mọi lead
    # đã rời trạng thái 'new', với ý định "không làm số liệu đẹp giả". Nhưng đó
    # chính là làm số liệu đẹp giả: hiệu hai mốc bằng 0, nên hồ sơ công khai
    # hiện "phản hồi trong 0 giờ" — đúng cái tín hiệu phản hồi tức thì mà tính
    # năng này sinh ra để giữ cho trung thực.
    #
    # Để NULL là biểu đạt đúng sự thật "không biết PT trả lời lúc nào". Truy vấn
    # thống kê lọc theo `first_response_at IS NOT NULL` (app/api/pts.py) nên các
    # lead này được loại khỏi phép tính thay vì kéo trung bình về 0.


def downgrade() -> None:
    op.drop_index("ix_leads_responded", table_name="leads")
    op.drop_column("leads", "first_response_at")
    op.drop_column("pt_profiles", "last_active_at")
