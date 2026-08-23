"""add oauth fields to users

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-15

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("oauth_provider", sa.String(20), nullable=True))
    op.add_column("users", sa.Column("oauth_id", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("oauth_avatar_url", sa.String(500), nullable=True))

    # OAuth users have no password — make nullable
    op.alter_column("users", "password_hash", existing_type=sa.String(255), nullable=True)

    # Unique across (provider, id) — partial index ignores NULLs automatically
    op.create_index(
        "uq_users_oauth",
        "users",
        ["oauth_provider", "oauth_id"],
        unique=True,
        postgresql_where=sa.text("oauth_provider IS NOT NULL AND oauth_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_users_oauth", table_name="users")
    op.alter_column("users", "password_hash", existing_type=sa.String(255), nullable=False)
    op.drop_column("users", "oauth_avatar_url")
    op.drop_column("users", "oauth_id")
    op.drop_column("users", "oauth_provider")
