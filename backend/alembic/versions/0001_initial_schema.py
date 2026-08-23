"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-06-11

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

user_role = postgresql.ENUM("pt", "trainee", "admin", name="user_role", create_type=False)
gender = postgresql.ENUM("male", "female", "other", name="gender", create_type=False)
portfolio_type = postgresql.ENUM(
    "before_after", "photo", "video", name="portfolio_type", create_type=False
)
lead_status = postgresql.ENUM(
    "new", "contacted", "closed", "lost", name="lead_status", create_type=False
)


def upgrade() -> None:
    bind = op.get_bind()

    # unaccent + IMMUTABLE wrapper so ASCII queries match Vietnamese text
    # (unaccent() itself is STABLE and can't be used in a generated column).
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")
    op.execute(
        """
        CREATE OR REPLACE FUNCTION ptmatch_unaccent(text)
        RETURNS text AS
        $$ SELECT public.unaccent('public.unaccent', $1) $$
        LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
        """
    )

    user_role.create(bind, checkfirst=True)
    gender.create(bind, checkfirst=True)
    portfolio_type.create(bind, checkfirst=True)
    lead_status.create(bind, checkfirst=True)

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", user_role, nullable=False),
        sa.Column(
            "subscription_tier",
            sa.String(20),
            nullable=False,
            server_default="free",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "pt_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("slug", sa.String(150), nullable=False),
        sa.Column("full_name", sa.String(150), nullable=False),
        sa.Column("gender", gender, nullable=True),
        sa.Column("age", sa.Integer(), nullable=True),
        sa.Column("experience_years", sa.Integer(), nullable=True),
        sa.Column("bio", sa.Text(), nullable=True),
        sa.Column("avatar_url", sa.String(500), nullable=True),
        sa.Column(
            "certifications",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "specialties",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "social_links",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "pricing",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "avg_rating", sa.Float(), nullable=False, server_default=sa.text("0")
        ),
        sa.Column(
            "review_count", sa.Integer(), nullable=False, server_default=sa.text("0")
        ),
        sa.Column(
            "view_count", sa.Integer(), nullable=False, server_default=sa.text("0")
        ),
        sa.Column(
            "search_vector",
            postgresql.TSVECTOR(),
            sa.Computed(
                "to_tsvector('simple', ptmatch_unaccent(coalesce(full_name, '') || ' ' || coalesce(bio, '')))",
                persisted=True,
            ),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_pt_profiles_slug", "pt_profiles", ["slug"], unique=True)
    op.create_index(
        "ix_pt_profiles_active_rating",
        "pt_profiles",
        ["is_active", "avg_rating"],
    )
    op.create_index(
        "ix_pt_profiles_search_vector",
        "pt_profiles",
        ["search_vector"],
        postgresql_using="gin",
    )
    op.create_index(
        "ix_pt_profiles_specialties",
        "pt_profiles",
        ["specialties"],
        postgresql_using="gin",
    )

    op.create_table(
        "pt_locations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "pt_profile_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("pt_profiles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("gym_name", sa.String(200), nullable=True),
        sa.Column("district", sa.String(100), nullable=True),
        sa.Column("city", sa.String(100), nullable=True),
    )
    op.create_index(
        "ix_pt_locations_pt_profile_id", "pt_locations", ["pt_profile_id"]
    )
    op.create_index("ix_pt_locations_city", "pt_locations", ["city"])
    op.create_index("ix_pt_locations_district", "pt_locations", ["district"])

    op.create_table(
        "portfolio_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "pt_profile_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("pt_profiles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("type", portfolio_type, nullable=False),
        sa.Column("before_url", sa.String(500), nullable=True),
        sa.Column("after_url", sa.String(500), nullable=True),
        sa.Column("media_url", sa.String(500), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")
        ),
    )
    op.create_index(
        "ix_portfolio_items_pt_profile_id", "portfolio_items", ["pt_profile_id"]
    )

    op.create_table(
        "leads",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "pt_profile_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("pt_profiles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("trainee_name", sa.String(150), nullable=False),
        sa.Column("trainee_phone", sa.String(20), nullable=False),
        sa.Column("goal", sa.Text(), nullable=True),
        sa.Column("area", sa.String(200), nullable=True),
        sa.Column("budget", sa.String(100), nullable=True),
        sa.Column("status", lead_status, nullable=False, server_default="new"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_leads_pt_profile_id", "leads", ["pt_profile_id"])
    op.create_index("ix_leads_pt_profile_status", "leads", ["pt_profile_id", "status"])

    op.create_table(
        "reviews",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "pt_profile_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("pt_profiles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "trainee_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("reviewer_name", sa.String(150), nullable=False),
        sa.Column("reviewer_phone", sa.String(20), nullable=True),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column(
            "images",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("reply_content", sa.Text(), nullable=True),
        sa.Column("replied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint("rating >= 1 AND rating <= 5", name="ck_reviews_rating_range"),
    )
    op.create_index("ix_reviews_pt_profile_id", "reviews", ["pt_profile_id"])


def downgrade() -> None:
    op.drop_table("reviews")
    op.drop_table("leads")
    op.drop_table("portfolio_items")
    op.drop_table("pt_locations")
    op.drop_table("pt_profiles")
    op.drop_table("users")

    bind = op.get_bind()
    lead_status.drop(bind, checkfirst=True)
    portfolio_type.drop(bind, checkfirst=True)
    gender.drop(bind, checkfirst=True)
    user_role.drop(bind, checkfirst=True)

    op.execute("DROP FUNCTION IF EXISTS ptmatch_unaccent(text)")
    op.execute("DROP EXTENSION IF EXISTS unaccent")
