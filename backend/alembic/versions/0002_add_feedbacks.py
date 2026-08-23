"""add feedbacks table

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-13

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

feedback_category = postgresql.ENUM(
    "feature", "bug", "ui", "other", name="feedback_category", create_type=False
)


def upgrade() -> None:
    feedback_category.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "feedbacks",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column(
            "category",
            feedback_category,
            nullable=False,
        ),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("contact_email", sa.String(200), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], ondelete="SET NULL"
        ),
    )


def downgrade() -> None:
    op.drop_table("feedbacks")
    feedback_category.drop(op.get_bind(), checkfirst=True)
