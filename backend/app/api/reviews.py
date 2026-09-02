import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_pt_profile, get_current_user, get_optional_user
from app.core.database import get_db
from app.core.ratelimit import limiter
from app.models import PTProfile, Review, User, UserRole
from app.services.listing import reachable_clause
from app.schemas.review import (
    MyReviewOut,
    ReviewCreate,
    ReviewListResponse,
    ReviewOut,
    ReviewReplyRequest,
    ReviewUpdate,
)
from app.services.rating import refresh_pt_rating

logger = logging.getLogger("ptmatch.reviews")

router = APIRouter(tags=["reviews"])


async def _get_active_profile_by_slug(db: AsyncSession, slug: str) -> PTProfile:
    profile = await db.scalar(
        select(PTProfile).where(PTProfile.slug == slug, reachable_clause())
    )
    if profile is None:
        raise HTTPException(status_code=404, detail="PT not found")
    return profile




@router.post(
    "/pts/{slug}/reviews",
    response_model=ReviewOut,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("5/minute;20/hour")
async def create_review(
    request: Request,
    slug: str,
    body: ReviewCreate,
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_active_profile_by_slug(db, slug)

    if current_user is not None:
        if current_user.id == profile.user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Bạn không thể tự đánh giá hồ sơ của mình",
            )
    else:
        # Đánh giá ẩn danh bắt buộc có SĐT. Đây là thứ duy nhất phân biệt được
        # hai người gửi ẩn danh, và là cái mà uq_reviews_pt_anon_phone dựa vào
        # để mỗi đánh giá giả phải tốn một số điện thoại khác nhau. Không có nó
        # thì chỉ cần đăng xuất là bấm 5 sao cho chính mình bao nhiêu lần cũng được.
        if not body.reviewer_phone:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Vui lòng nhập số điện thoại để gửi đánh giá.",
            )

    # Hiện ngay, không qua hàng chờ.
    #
    # Từng có hàng chờ duyệt, đã bỏ: nó chỉ có nghĩa khi ngày nào cũng có người
    # mở /admin/reviews, mà với đăng ký tự phục vụ thì không ai đảm bảo được
    # điều đó — và một hàng chờ không ai trực nghĩa là đánh giá thật không bao
    # giờ xuất hiện, tức là tệ hơn hẳn so với thi thoảng lọt một cái giả.
    #
    # `approved_at` ở lại với nghĩa "đang hiển thị": admin gỡ xuống được
    # (PATCH /api/admin/reviews/{id}) và bật lại được. Kiểm duyệt chuyển từ
    # chặn trước sang xử lý sau.
    review = Review(
        approved_at=datetime.now(timezone.utc),
        pt_profile_id=profile.id,
        trainee_id=current_user.id if current_user else None,
        reviewer_name=body.reviewer_name,
        reviewer_phone=body.reviewer_phone,
        rating=body.rating,
        content=body.content,
        images=body.images,
    )
    db.add(review)

    # Ràng buộc unique một phần ở DB (alembic 0009) là thứ chốt chặn thật; câu
    # SELECT kiểm tra trước không đủ vì hai request song song cùng lọt qua.
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bạn đã đánh giá PT này rồi. Hãy chỉnh sửa đánh giá cũ.",
        )

    await refresh_pt_rating(db, profile.id)
    await db.commit()
    await db.refresh(review)
    return ReviewOut.model_validate(review)


@router.get("/pts/{slug}/reviews", response_model=ReviewListResponse)
async def list_reviews(
    slug: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_active_profile_by_slug(db, slug)
    base = select(Review).where(
        Review.pt_profile_id == profile.id,
        Review.approved_at.isnot(None),
    )
    total = await db.scalar(
        select(func.count()).select_from(base.subquery())
    )
    reviews = (
        await db.scalars(
            base.order_by(Review.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    return ReviewListResponse(
        items=[ReviewOut.model_validate(r) for r in reviews],
        total=int(total or 0),
        page=page,
        page_size=page_size,
    )


@router.get("/reviews/mine", response_model=List[MyReviewOut])
async def list_my_reviews(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reviews written by the logged-in user, newest first, with PT info."""
    rows = (
        await db.execute(
            select(Review, PTProfile.full_name, PTProfile.slug, PTProfile.avatar_url)
            .join(PTProfile, PTProfile.id == Review.pt_profile_id)
            .where(Review.trainee_id == user.id)
            .order_by(Review.created_at.desc())
        )
    ).all()
    return [
        MyReviewOut(
            id=r.id,
            pt_name=pt_name,
            pt_slug=pt_slug,
            pt_avatar_url=pt_avatar_url,
            rating=r.rating,
            content=r.content,
            images=r.images,
            reply_content=r.reply_content,
            replied_at=r.replied_at,
            created_at=r.created_at,
            approved_at=r.approved_at,
        )
        for r, pt_name, pt_slug, pt_avatar_url in rows
    ]


async def _get_review(db: AsyncSession, review_id: uuid.UUID) -> Review:
    review = await db.scalar(select(Review).where(Review.id == review_id))
    if review is None:
        raise HTTPException(status_code=404, detail="Review not found")
    return review


async def _get_own_review(db: AsyncSession, review_id: uuid.UUID, user: User) -> Review:
    """Đánh giá do CHÍNH người này viết — dùng cho sửa nội dung.

    Đánh giá ẩn danh có `trainee_id = NULL`, không bao giờ khớp UUID nào, nên
    không ai sửa được nội dung của nó. Đó là đúng: không có cách nào chứng minh
    người đang gọi là tác giả. Xoá thì khác — xem delete_review.
    """
    review = await _get_review(db, review_id)
    if review.trainee_id is None or review.trainee_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn chỉ có thể chỉnh sửa đánh giá của chính mình",
        )
    return review


@router.patch("/reviews/{review_id}", response_model=ReviewOut)
async def update_my_review(
    review_id: uuid.UUID,
    body: ReviewUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    review = await _get_own_review(db, review_id, user)
    data = body.model_dump(exclude_unset=True)
    changed = any(getattr(review, field) != value for field, value in data.items())
    for field, value in data.items():
        setattr(review, field, value)
    # Sửa nội dung KHÔNG ẩn đánh giá đi.
    #
    # Trước đây có, để chặn mẹo "gửi câu vô hại, chờ duyệt, rồi sửa thành thứ
    # khác". Nhưng khi không còn ai trực hàng chờ thì ẩn đi là ẩn vĩnh viễn —
    # người sửa một lỗi chính tả sẽ mất luôn đánh giá của mình mà không hiểu vì
    # sao. Đổi lỗi sai: thà chịu rủi ro sửa trộm còn hơn nuốt mất đánh giá thật.
    await db.flush()
    if changed:
        await refresh_pt_rating(db, review.pt_profile_id)
    await db.commit()
    await db.refresh(review)
    return ReviewOut.model_validate(review)


@router.delete("/reviews/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_review(
    review_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Xoá đánh giá — tác giả tự xoá, hoặc admin xoá để kiểm duyệt.

    ADMIN ĐƯỢC PHÉP vì trước đây có một loại đánh giá KHÔNG AI xoá được: đánh
    giá ẩn danh (`trainee_id = NULL`) không khớp `trainee_id == user.id` của bất
    kỳ ai, nên một đánh giá 1 sao phá hoại là bất khả xâm phạm qua API. Đường
    duy nhất còn lại là SQL tay, mà xoá bằng SQL còn phải tự tính lại
    avg_rating/review_count — quên bước đó là điểm công khai của PT sai vĩnh
    viễn, không báo lỗi, không cách nào phát hiện.

    PT BỊ ĐÁNH GIÁ CỐ Ý KHÔNG ĐƯỢC PHÉP. Cho PT xoá đánh giá về chính mình là
    phá huỷ đúng tín hiệu niềm tin mà chợ dựa vào — họ chỉ giữ lại một điểm sai
    hoàn toàn có lợi cho mình. Công cụ của PT là trả lời công khai
    (POST /reviews/{id}/reply), không phải xoá.
    """
    is_admin = user.role == UserRole.admin
    review = (
        await _get_review(db, review_id)
        if is_admin
        else await _get_own_review(db, review_id, user)
    )

    if is_admin:
        # Xoá cứng nên không còn dấu vết trong DB — ghi log để còn lần lại được
        # ai xoá cái gì. Đây là bản ghi kiểm toán duy nhất của hành động này.
        logger.info(
            "Admin %s xoá đánh giá %s (PT %s, %s sao, tác giả %s)",
            user.email,
            review.id,
            review.pt_profile_id,
            review.rating,
            review.trainee_id or "ẩn danh",
        )

    pt_profile_id = review.pt_profile_id
    await db.delete(review)
    await db.flush()
    # BẮT BUỘC: avg_rating/review_count là cột phi chuẩn hoá, xoá hàng mà không
    # tính lại là để điểm công khai sai mãi.
    await refresh_pt_rating(db, pt_profile_id)
    await db.commit()


@router.post("/reviews/{review_id}/reply", response_model=ReviewOut)
async def reply_to_review(
    review_id: uuid.UUID,
    body: ReviewReplyRequest,
    profile: PTProfile = Depends(get_current_pt_profile),
    db: AsyncSession = Depends(get_db),
):
    review = await db.scalar(
        select(Review).where(
            Review.id == review_id, Review.pt_profile_id == profile.id
        )
    )
    if review is None:
        raise HTTPException(status_code=404, detail="Review not found")
    review.reply_content = body.content
    review.replied_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(review)
    return ReviewOut.model_validate(review)
