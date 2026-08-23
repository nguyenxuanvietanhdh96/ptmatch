import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_pt_profile
from app.core.database import get_db
from app.models import Lead, LeadStatus, PortfolioItem, PTLocation, PTProfile, Review
from app.models.pt_profile import PortfolioType
from app.services.listing import (
    listable_clause,
    missing_listing_requirements,
    per_session_price_expr as _per_session_price,
)
from app.services.slug import strip_diacritics
from app.schemas.pt import (
    DailyLeadPoint,
    LocationCreate,
    LocationOut,
    PortfolioCreate,
    PortfolioOut,
    PortfolioUpdate,
    PTActivity,
    PTAnalytics,
    PTDetail,
    PTListItem,
    PTProfileUpdate,
    PTPublicDetail,
    PTSearchResponse,
    PTSitemapItem,
    PTStats,
)
from app.core.ratelimit import limiter
from app.core.timeutils import VN_TZ_NAME, now_vn, vn_day_start, vn_month_start

router = APIRouter(prefix="/pts", tags=["pts"])


@router.get("", response_model=PTSearchResponse)
async def search_pts(
    q: Optional[str] = Query(default=None, max_length=200),
    gender: Optional[Literal["male", "female", "other"]] = None,
    specialty: Optional[str] = Query(default=None, max_length=50),
    city: Optional[str] = Query(default=None, max_length=100),
    ward: Optional[str] = Query(default=None, max_length=100),
    price_min: Optional[int] = Query(default=None, ge=0),
    price_max: Optional[int] = Query(default=None, ge=0),
    experience_min: Optional[int] = Query(default=None, ge=0),
    sort: Literal["rating", "price", "experience"] = "rating",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(PTProfile).where(listable_clause())

    if q:
        q = q.strip()
    if q:
        # tsvector (unaccented, 'simple' config) is the primary path so that
        # ASCII queries ("tuan") match accented names ("Tuấn"); ILIKE on the
        # raw text remains as fallback for partial words / exact diacritics.
        like = "%{0}%".format(q)
        stmt = stmt.where(
            or_(
                PTProfile.search_vector.op("@@")(
                    func.plainto_tsquery("simple", strip_diacritics(q))
                ),
                PTProfile.full_name.ilike(like),
                PTProfile.bio.ilike(like),
            )
        )

    if gender:
        stmt = stmt.where(PTProfile.gender == gender)
    if specialty:
        stmt = stmt.where(PTProfile.specialties.contains([specialty]))

    if city or ward:
        loc_query = select(PTLocation.id).where(
            PTLocation.pt_profile_id == PTProfile.id
        )
        if city:
            loc_query = loc_query.where(
                func.lower(func.ptmatch_unaccent(PTLocation.city)).ilike(
                    "%" + strip_diacritics(city).lower() + "%"
                )
            )
        if ward:
            loc_query = loc_query.where(
                func.lower(func.ptmatch_unaccent(PTLocation.ward)).ilike(
                    "%" + strip_diacritics(ward).lower() + "%"
                )
            )
        stmt = stmt.where(loc_query.exists())

    price = _per_session_price()
    if price_min is not None:
        stmt = stmt.where(price >= price_min)
    if price_max is not None:
        stmt = stmt.where(price <= price_max)
    if experience_min is not None:
        stmt = stmt.where(PTProfile.experience_years >= experience_min)

    total = await db.scalar(
        select(func.count()).select_from(stmt.subquery())
    )

    if sort == "price":
        stmt = stmt.order_by(price.asc().nulls_last(), PTProfile.avg_rating.desc())
    elif sort == "experience":
        stmt = stmt.order_by(
            PTProfile.experience_years.desc().nulls_last(),
            PTProfile.avg_rating.desc(),
        )
    else:
        stmt = stmt.order_by(
            PTProfile.avg_rating.desc(),
            PTProfile.review_count.desc(),
            PTProfile.created_at.desc(),
        )

    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    profiles = (await db.scalars(stmt)).all()

    return PTSearchResponse(
        items=[PTListItem.model_validate(p) for p in profiles],
        total=int(total or 0),
        page=page,
        page_size=page_size,
    )


# ---- static /pts/* routes MUST be declared before /pts/{slug} ----


@router.get("/sitemap", response_model=List[PTSitemapItem])
async def list_sitemap_entries(db: AsyncSession = Depends(get_db)):
    """Every indexable PT profile, for the frontend's sitemap.xml."""
    rows = (
        await db.execute(
            select(PTProfile.slug, PTProfile.updated_at)
            .where(listable_clause())
            .order_by(PTProfile.updated_at.desc())
        )
    ).all()
    return [PTSitemapItem(slug=slug, updated_at=updated_at) for slug, updated_at in rows]


def _my_profile_response(profile: PTProfile) -> PTDetail:
    detail = PTDetail.model_validate(profile)
    detail.missing_listing = missing_listing_requirements(profile)
    return detail


@router.get("/me", response_model=PTDetail)
async def get_my_profile(profile: PTProfile = Depends(get_current_pt_profile)):
    return _my_profile_response(profile)


@router.get("/me/check-slug")
async def check_slug_availability(
    slug: str = Query(min_length=3, max_length=60),
    profile: PTProfile = Depends(get_current_pt_profile),
    db: AsyncSession = Depends(get_db),
):
    slug = slug.strip().lower()
    if slug == profile.slug:
        return {"available": True, "slug": slug}
    existing = await db.scalar(
        select(PTProfile.id).where(PTProfile.slug == slug)
    )
    return {"available": existing is None, "slug": slug}


@router.put("/me", response_model=PTDetail)
async def update_my_profile(
    body: PTProfileUpdate,
    profile: PTProfile = Depends(get_current_pt_profile),
    db: AsyncSession = Depends(get_db),
):
    data = body.model_dump(exclude_unset=True)
    if "slug" in data and data["slug"] is not None and data["slug"] != profile.slug:
        existing = await db.scalar(
            select(PTProfile.id).where(PTProfile.slug == data["slug"])
        )
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="URL '%s' đã được sử dụng bởi PT khác" % data["slug"],
            )
    for field, value in data.items():
        if field in ("social_links", "pricing") and value is not None:
            value = {k: v for k, v in value.items() if v is not None}
        if field == "certifications" and value is not None:
            value = [
                {k: v for k, v in cert.items() if v is not None}
                for cert in value
            ]
        setattr(profile, field, value)
    await db.commit()
    await db.refresh(profile)
    return _my_profile_response(profile)


@router.get("/me/stats", response_model=PTStats)
async def get_my_stats(
    profile: PTProfile = Depends(get_current_pt_profile),
    db: AsyncSession = Depends(get_db),
):
    rows = await db.execute(
        select(Lead.status, func.count())
        .where(Lead.pt_profile_id == profile.id)
        .group_by(Lead.status)
    )
    by_status = {status_: count for status_, count in rows.all()}

    # Đầu tháng theo giờ VN, không phải giờ UTC — xem app/core/timeutils.py.
    month_start = vn_month_start(now_vn())
    leads_this_month = await db.scalar(
        select(func.count())
        .select_from(Lead)
        .where(Lead.pt_profile_id == profile.id, Lead.created_at >= month_start)
    )

    return PTStats(
        profile_views=profile.view_count,
        leads_total=sum(by_status.values()),
        leads_new=by_status.get(LeadStatus.new, 0),
        leads_contacted=by_status.get(LeadStatus.contacted, 0),
        leads_closed=by_status.get(LeadStatus.closed, 0),
        leads_lost=by_status.get(LeadStatus.lost, 0),
        leads_this_month=int(leads_this_month or 0),
        avg_rating=profile.avg_rating,
        review_count=profile.review_count,
    )


@router.get("/me/analytics", response_model=PTAnalytics)
async def get_my_analytics(
    days: int = Query(default=30, ge=7, le=90),
    profile: PTProfile = Depends(get_current_pt_profile),
    db: AsyncSession = Depends(get_db),
):
    # Cửa sổ và cách chia ô đều theo giờ VN: PT xem biểu đồ này để biết "hôm qua
    # có mấy lead", mốc phải trùng với ngày họ đang sống.
    window_start = vn_day_start(now_vn() - timedelta(days=days - 1))

    # Daily lead counts within the window
    day_col = func.date_trunc("day", func.timezone(VN_TZ_NAME, Lead.created_at))
    rows = await db.execute(
        select(day_col, func.count())
        .where(Lead.pt_profile_id == profile.id, Lead.created_at >= window_start)
        .group_by(day_col)
    )
    counts_by_day = {day.date().isoformat(): count for day, count in rows.all()}
    leads_by_day = [
        DailyLeadPoint(
            date=(window_start + timedelta(days=i)).date().isoformat(),
            count=counts_by_day.get(
                (window_start + timedelta(days=i)).date().isoformat(), 0
            ),
        )
        for i in range(days)
    ]

    # All-time status breakdown
    status_rows = await db.execute(
        select(Lead.status, func.count())
        .where(Lead.pt_profile_id == profile.id)
        .group_by(Lead.status)
    )
    by_status = {status_: count for status_, count in status_rows.all()}
    leads_total = sum(by_status.values())
    leads_closed = by_status.get(LeadStatus.closed, 0)

    # Review rating distribution
    rating_rows = await db.execute(
        select(Review.rating, func.count())
        .where(Review.pt_profile_id == profile.id)
        .group_by(Review.rating)
    )
    rating_distribution = {star: 0 for star in range(1, 6)}
    for rating, count in rating_rows.all():
        if rating in rating_distribution:
            rating_distribution[rating] = count

    return PTAnalytics(
        days=days,
        leads_by_day=leads_by_day,
        leads_in_window=sum(p.count for p in leads_by_day),
        leads_total=leads_total,
        leads_new=by_status.get(LeadStatus.new, 0),
        leads_contacted=by_status.get(LeadStatus.contacted, 0),
        leads_closed=leads_closed,
        leads_lost=by_status.get(LeadStatus.lost, 0),
        conversion_rate=(leads_closed / leads_total) if leads_total else 0.0,
        profile_views=profile.view_count,
        avg_rating=profile.avg_rating,
        review_count=profile.review_count,
        rating_distribution=rating_distribution,
    )


@router.post(
    "/me/locations", response_model=LocationOut, status_code=status.HTTP_201_CREATED
)
async def add_location(
    body: LocationCreate,
    profile: PTProfile = Depends(get_current_pt_profile),
    db: AsyncSession = Depends(get_db),
):
    location = PTLocation(pt_profile_id=profile.id, **body.model_dump())
    db.add(location)
    await db.commit()
    await db.refresh(location)
    return LocationOut.model_validate(location)


@router.delete("/me/locations/{location_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_location(
    location_id: uuid.UUID,
    profile: PTProfile = Depends(get_current_pt_profile),
    db: AsyncSession = Depends(get_db),
):
    location = await db.scalar(
        select(PTLocation).where(
            PTLocation.id == location_id,
            PTLocation.pt_profile_id == profile.id,
        )
    )
    if location is None:
        raise HTTPException(status_code=404, detail="Location not found")
    await db.delete(location)
    await db.commit()


@router.post(
    "/me/portfolio", response_model=PortfolioOut, status_code=status.HTTP_201_CREATED
)
async def add_portfolio_item(
    body: PortfolioCreate,
    profile: PTProfile = Depends(get_current_pt_profile),
    db: AsyncSession = Depends(get_db),
):
    data = body.model_dump()
    data["type"] = PortfolioType(data["type"])
    item = PortfolioItem(pt_profile_id=profile.id, **data)
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return PortfolioOut.model_validate(item)


@router.patch("/me/portfolio/{item_id}", response_model=PortfolioOut)
async def update_portfolio_item(
    item_id: uuid.UUID,
    body: PortfolioUpdate,
    profile: PTProfile = Depends(get_current_pt_profile),
    db: AsyncSession = Depends(get_db),
):
    item = await db.scalar(
        select(PortfolioItem).where(
            PortfolioItem.id == item_id,
            PortfolioItem.pt_profile_id == profile.id,
        )
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Portfolio item not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    await db.commit()
    await db.refresh(item)
    return PortfolioOut.model_validate(item)


@router.delete("/me/portfolio/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_portfolio_item(
    item_id: uuid.UUID,
    profile: PTProfile = Depends(get_current_pt_profile),
    db: AsyncSession = Depends(get_db),
):
    item = await db.scalar(
        select(PortfolioItem).where(
            PortfolioItem.id == item_id,
            PortfolioItem.pt_profile_id == profile.id,
        )
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Portfolio item not found")
    await db.delete(item)
    await db.commit()


# Dưới ngưỡng này, thời gian phản hồi trung bình chỉ là nhiễu — một lead trả
# lời nhanh sẽ thành "luôn phản hồi trong 5 phút". Thà không hiện còn hơn.
MIN_LEADS_FOR_RESPONSE_TIME = 3
RESPONSE_WINDOW_DAYS = 90


async def _activity_for(db: AsyncSession, pt_profile_id: uuid.UUID) -> PTActivity:
    """Thống kê hoạt động của một PT trong một lượt truy vấn."""
    since = datetime.now(timezone.utc) - timedelta(days=RESPONSE_WINDOW_DAYS)
    responded = Lead.first_response_at.is_not(None)

    row = (
        await db.execute(
            select(
                # Đã chốt: tính toàn thời gian, đây là thành tích tích luỹ.
                func.count().filter(Lead.status == LeadStatus.closed),
                # Thời gian phản hồi: chỉ lấy cửa sổ gần đây, để PT từng chăm
                # chỉ nhưng nay bỏ bê không giữ mãi được con số đẹp.
                func.count().filter(responded, Lead.created_at >= since),
                func.avg(
                    func.extract("epoch", Lead.first_response_at - Lead.created_at)
                ).filter(responded, Lead.created_at >= since),
            ).where(Lead.pt_profile_id == pt_profile_id)
        )
    ).one()

    closed_count, responded_count, avg_seconds = row
    response_hours = None
    if responded_count >= MIN_LEADS_FOR_RESPONSE_TIME and avg_seconds is not None:
        response_hours = round(float(avg_seconds) / 3600, 1)

    return PTActivity(
        response_hours=response_hours,
        students_coached=int(closed_count or 0),
    )


@router.get("/{slug}", response_model=PTPublicDetail)
async def get_pt_detail(slug: str, db: AsyncSession = Depends(get_db)):
    profile = await db.scalar(
        select(PTProfile).where(
            PTProfile.slug == slug, PTProfile.is_active.is_(True)
        )
    )
    if profile is None:
        raise HTTPException(status_code=404, detail="PT not found")

    detail = PTPublicDetail.model_validate(profile)
    detail.activity = await _activity_for(db, profile.id)
    detail.activity.last_active_at = profile.last_active_at
    return detail


@router.post("/{slug}/view", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
async def register_profile_view(
    request: Request,
    slug: str,
    db: AsyncSession = Depends(get_db),
):
    """Count one profile view.

    Kept separate from GET /pts/{slug} so that the detail response stays
    cacheable (the page is served with ISR) and so views reflect real browsers
    rather than every SSR render or crawler fetch.
    """
    result = await db.execute(
        update(PTProfile)
        .where(PTProfile.slug == slug, PTProfile.is_active.is_(True))
        .values(
            view_count=PTProfile.view_count + 1,
            # Giữ nguyên updated_at: cột này có onupdate=now() nên mặc định MỌI
            # câu UPDATE đều đẩy nó lên, kể cả lượt xem trang. Mà updated_at là
            # nguồn cho <lastmod> trong sitemap, nên để vậy thì mỗi lượt xem lại
            # báo với Google là hồ sơ vừa đổi nội dung — tín hiệu tươi mới giả,
            # và Google học được rằng lastmod của site này không đáng tin.
            updated_at=PTProfile.updated_at,
        )
    )
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="PT not found")
