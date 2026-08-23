"""trainee requests board ("Học viên cần PT")

Revision ID: 0006
Revises: 0005
Create Date: 2026-08-17

Chiều ngược của marketplace: học viên đăng nhu cầu, PT chủ động nhận.
Việc "nhận" tạo ra một Lead trỏ ngược về yêu cầu, nhờ đó toàn bộ dashboard
Kanban sẵn có dùng lại được mà không phải sửa gì.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    request_status = postgresql.ENUM(
        "open", "closed", name="request_status", create_type=False
    )
    request_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "trainee_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "trainee_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("trainee_name", sa.String(150), nullable=False),
        sa.Column("trainee_phone", sa.String(20), nullable=False),
        sa.Column("specialty", sa.String(50), nullable=True),
        sa.Column("city", sa.String(100), nullable=True),
        sa.Column("district", sa.String(100), nullable=True),
        sa.Column("budget_min", sa.Integer(), nullable=True),
        sa.Column("budget_max", sa.Integer(), nullable=True),
        sa.Column(
            "preferred_gender",
            postgresql.ENUM(
                "male", "female", "other", name="gender", create_type=False
            ),
            nullable=True,
        ),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("status", request_status, nullable=False, server_default="open"),
        sa.Column("claim_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "budget_min IS NULL OR budget_max IS NULL OR budget_min <= budget_max",
            name="ck_trainee_requests_budget_range",
        ),
    )
    op.create_index("ix_trainee_requests_trainee_id", "trainee_requests", ["trainee_id"])
    # Truy vấn chủ đạo của bảng: các yêu cầu còn nhận được, mới nhất trước.
    op.create_index(
        "ix_trainee_requests_board",
        "trainee_requests",
        ["status", "expires_at", "created_at"],
    )

    op.add_column(
        "leads",
        sa.Column(
            "request_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("trainee_requests.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_leads_request_id", "leads", ["request_id"])
    # Một PT chỉ nhận được một yêu cầu đúng một lần.
    op.create_index(
        "uq_leads_request_pt",
        "leads",
        ["request_id", "pt_profile_id"],
        unique=True,
        postgresql_where=sa.text("request_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_leads_request_pt", table_name="leads")
    op.drop_index("ix_leads_request_id", table_name="leads")
    op.drop_column("leads", "request_id")
    op.drop_index("ix_trainee_requests_board", table_name="trainee_requests")
    op.drop_index("ix_trainee_requests_trainee_id", table_name="trainee_requests")
    op.drop_table("trainee_requests")
    postgresql.ENUM(name="request_status").drop(op.get_bind(), checkfirst=True)
