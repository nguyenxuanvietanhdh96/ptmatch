from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import Favorite, PTProfile, User
from app.services.listing import reachable_clause
from app.schemas.favorite import FavoriteCreate, FavoriteToggleOut
from app.schemas.pt import PTListItem

router = APIRouter(prefix="/favorites", tags=["favorites"])


async def _profile_by_slug(db: AsyncSession, slug: str) -> PTProfile:
    profile = await db.scalar(
        select(PTProfile).where(PTProfile.slug == slug, reachable_clause())
    )
    if profile is None:
        raise HTTPException(status_code=404, detail="PT not found")
    return profile


@router.get("", response_model=List[PTListItem])
async def list_favorites(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    profiles = (
        await db.scalars(
            select(PTProfile)
            .join(Favorite, Favorite.pt_profile_id == PTProfile.id)
            .where(Favorite.user_id == user.id, reachable_clause())
            .order_by(Favorite.created_at.desc())
        )
    ).all()
    return [PTListItem.model_validate(p) for p in profiles]


@router.get("/ids", response_model=List[str])
async def list_favorite_slugs(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Slugs the current user has favorited — for rendering filled hearts."""
    slugs = (
        await db.scalars(
            select(PTProfile.slug)
            .join(Favorite, Favorite.pt_profile_id == PTProfile.id)
            # Cùng filter với list_favorites: PT đã tắt hiển thị (is_active=False)
            # thì trang của họ 404, nên không được trả về đây làm quả tim đầy
            # dẫn tới một link chết.
            .where(Favorite.user_id == user.id, reachable_clause())
        )
    ).all()
    return list(slugs)


@router.post("", response_model=FavoriteToggleOut, status_code=status.HTTP_201_CREATED)
async def add_favorite(
    body: FavoriteCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    profile = await _profile_by_slug(db, body.pt_slug)

    # ON CONFLICT DO NOTHING thay cho SELECT-rồi-INSERT: thêm yêu thích là thao
    # tác lũy đẳng, và hai cú bấm tim liên tiếp (hoặc double-click) trước đây
    # lọt qua cùng một lần kiểm tra rồi đụng uq_favorites_user_pt, trả về 500.
    await db.execute(
        pg_insert(Favorite)
        .values(user_id=user.id, pt_profile_id=profile.id)
        .on_conflict_do_nothing(index_elements=["user_id", "pt_profile_id"])
    )
    await db.commit()
    return FavoriteToggleOut(favorited=True, pt_slug=profile.slug)


@router.delete("/{pt_slug}", response_model=FavoriteToggleOut)
async def remove_favorite(
    pt_slug: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    profile = await _profile_by_slug(db, pt_slug)
    favorite = await db.scalar(
        select(Favorite).where(
            Favorite.user_id == user.id, Favorite.pt_profile_id == profile.id
        )
    )
    if favorite is not None:
        await db.delete(favorite)
        await db.commit()
    return FavoriteToggleOut(favorited=False, pt_slug=profile.slug)
