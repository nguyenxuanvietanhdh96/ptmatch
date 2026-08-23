"""trainee features: user full_name, lead trainee_id, favorites

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-13

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # users.full_name + backfill existing PT names from their profile
    op.add_column("users", sa.Column("full_name", sa.String(100), nullable=True))
    op.execute(
        """
        UPDATE users u
        SET full_name = p.full_name
        FROM pt_profiles p
        WHERE p.user_id = u.id AND u.full_name IS NULL
        """
    )

    # leads.trainee_id — link a lead to the trainee account that sent it
    op.add_column(
        "leads", sa.Column("trainee_id", sa.UUID(), nullable=True)
    )
    op.create_index("ix_leads_trainee_id", "leads", ["trainee_id"])
    op.create_foreign_key(
        "fk_leads_trainee_id_users",
        "leads",
        "users",
        ["trainee_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # favorites — trainee saved PTs
    op.create_table(
        "favorites",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("pt_profile_id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["pt_profile_id"], ["pt_profiles.id"], ondelete="CASCADE"
        ),
        sa.UniqueConstraint(
            "user_id", "pt_profile_id", name="uq_favorites_user_pt"
        ),
    )
    op.create_index("ix_favorites_user_id", "favorites", ["user_id"])
    op.create_index("ix_favorites_pt_profile_id", "favorites", ["pt_profile_id"])


def downgrade() -> None:
    op.drop_table("favorites")
    op.drop_constraint("fk_leads_trainee_id_users", "leads", type_="foreignkey")
    op.drop_index("ix_leads_trainee_id", table_name="leads")
    op.drop_column("leads", "trainee_id")
    op.drop_column("users", "full_name")
