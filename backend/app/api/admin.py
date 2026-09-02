"""Số liệu vận hành lead — chỉ admin xem.

Trả lời ba câu hỏi mà giai đoạn kiểm chứng cần và hiện không có chỗ nào trả lời:

1. Thông báo có tới được PT không? (theo từng kênh)
2. PT nào đang bỏ bê lead?
3. Học viên có phản bác trạng thái PT tự khai không?

Cố ý tách khỏi /requests/stats: chỗ đó đo phễu của chợ ngược (yêu cầu → nhận →
chốt), còn đây đo đường ống thông báo và độ tin cậy của từng PT. Hai thứ khác
nhau, gộp lại thành một endpoint thì không cái nào đọc được.
"""
import logging
import uuid
from datetime import timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Text, and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.core.database import get_db
from app.core.timeutils import now_vn
from app.models import (
    Favorite,
    Feedback,
    FeedbackCategory,
    Lead,
    LeadStatus,
    NotificationDelivery,
    PortfolioItem,
    PTLocation,
    PTProfile,
    Review,
    TraineeRequest,
    User,
    UserRole,
)
from app.schemas.admin import (
    AdminOverview,
    AdminReviewItem,
    AdminReviewList,
    AdminReviewModerate,
    ChannelStat,
    DemandSignal,
    FeatureUse,
    FeedbackItem,
    FeedbackListOut,
    LeadOpsOverview,
    PTResponsiveness,
    PTAccountState,
    PTBanRequest,
    PTCloseRequest,
    PTSuspendRequest,
    PTSuspendResult,
)
from app.services.account_closure import ban_user, close_account, unban_user
from app.services.labels import specialty_label
from app.services.rating import refresh_pt_rating

logger = logging.getLogger("ptmatch.admin")

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/lead-ops", response_model=LeadOpsOverview)
async def lead_ops_overview(
    days: int = Query(default=30, ge=1, le=365),
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    since = now_vn() - timedelta(days=days)

    # ---- Đường ống thông báo, theo kênh -----------------------------------
    channel_rows = (
        await db.execute(
            select(
                NotificationDelivery.channel,
                NotificationDelivery.status,
                func.count(),
            )
            .where(NotificationDelivery.created_at >= since)
            .group_by(NotificationDelivery.channel, NotificationDelivery.status)
        )
    ).all()

    by_channel: dict = {}
    for channel, status, count in channel_rows:
        entry = by_channel.setdefault(channel, {"sent": 0, "failed": 0, "skipped": 0})
        if status in entry:
            entry[status] = count

    channels = [
        ChannelStat(channel=name, sent=v["sent"], failed=v["failed"], skipped=v["skipped"])
        for name, v in sorted(by_channel.items())
    ]

    # ---- Tổng quan lead ----------------------------------------------------
    responded = Lead.first_response_at.is_not(None)
    lead_row = (
        await db.execute(
            select(
                func.count(),
                func.count().filter(responded),
                func.count().filter(Lead.status == LeadStatus.new),
                func.count().filter(Lead.trainee_reported_no_contact_at.is_not(None)),
                func.count().filter(Lead.reminder_sent_at.is_not(None)),
                # Thời gian phản hồi trung vị (giờ). Dùng trung vị chứ không
                # trung bình: một lead bị bỏ quên hai tuần sẽ kéo lệch trung bình
                # tới mức con số không còn mô tả trải nghiệm điển hình nữa.
                func.percentile_cont(0.5)
                .within_group(
                    func.extract("epoch", Lead.first_response_at - Lead.created_at) / 3600.0
                )
                .filter(responded),
            ).where(Lead.created_at >= since)
        )
    ).one()

    total, answered, still_new, disputed, reminded, median_hours = lead_row

    # ---- Xếp hạng PT theo mức độ phản hồi ----------------------------------
    pt_rows = (
        await db.execute(
            select(
                PTProfile.slug,
                PTProfile.full_name,
                func.count(Lead.id),
                func.count(Lead.id).filter(responded),
                func.count(Lead.id).filter(Lead.trainee_reported_no_contact_at.is_not(None)),
                PTProfile.suspended_at,
                User.banned_at,
                User.deleted_at,
                func.avg(
                    case(
                        (
                            responded,
                            func.extract("epoch", Lead.first_response_at - Lead.created_at)
                            / 3600.0,
                        ),
                        else_=None,
                    )
                ),
            )
            .join(Lead, Lead.pt_profile_id == PTProfile.id)
            .join(User, User.id == PTProfile.user_id)
            .where(Lead.created_at >= since)
            .group_by(
                PTProfile.slug,
                PTProfile.full_name,
                PTProfile.suspended_at,
                User.banned_at,
                User.deleted_at,
            )
            .order_by(func.count(Lead.id).filter(responded) * 1.0 / func.count(Lead.id))
        )
    ).all()

    pts: List[PTResponsiveness] = [
        PTResponsiveness(
            slug=slug,
            full_name=full_name,
            leads=leads,
            answered=answered_count,
            disputed=disputed_count,
            suspended=suspended_at is not None,
            banned=banned_at is not None,
            deleted=deleted_at is not None,
            avg_response_hours=round(float(avg_hours), 1) if avg_hours is not None else None,
        )
        for (
            slug,
            full_name,
            leads,
            answered_count,
            disputed_count,
            suspended_at,
            banned_at,
            deleted_at,
            avg_hours,
        ) in pt_rows
    ]

    return LeadOpsOverview(
        days=days,
        leads_total=int(total or 0),
        leads_answered=int(answered or 0),
        leads_still_new=int(still_new or 0),
        leads_disputed=int(disputed or 0),
        leads_reminded=int(reminded or 0),
        median_response_hours=round(float(median_hours), 1) if median_hours is not None else None,
        channels=channels,
        pts=pts,
    )


@router.get("/overview", response_model=AdminOverview)
async def overview(
    days: int = Query(default=30, ge=1, le=365),
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Ai đang dùng gì — tính hoàn toàn từ dữ liệu sẵn có, không cột tracking mới.

    Trả lời câu hỏi của giai đoạn kiểm chứng: tính năng nào có người dùng thật,
    tính năng nào chỉ tồn tại. Số NGƯỜI được ưu tiên hơn số lượt, vì 40 lead từ
    2 người là tín hiệu khác hẳn 40 lead từ 35 người.

    GIỚI HẠN cần biết: đây chỉ đo những gì để lại dấu trong DB. Lượt tìm kiếm,
    lượt xem trang, tỷ lệ rời trang nằm ở GA4/Plausible chứ không ở đây — bảng
    này không thay thế chúng.
    """
    since = now_vn() - timedelta(days=days)

    # ---- Người dùng --------------------------------------------------------
    users_row = (
        await db.execute(
            select(
                func.count(),
                func.count().filter(User.role == UserRole.pt),
                func.count().filter(User.role == UserRole.trainee),
                func.count().filter(User.created_at >= since),
            ).select_from(User)
        )
    ).one()
    users_total, users_pt, users_trainee, users_new = users_row

    # ---- Hồ sơ PT: bao nhiêu cái THẬT SỰ dùng được ------------------------
    #
    # Một hồ sơ tồn tại mà không có giá và không có địa điểm thì học viên không
    # chọn được — đếm riêng từng phần để biết nên đi giục PT bổ sung gì.
    has_pricing = PTProfile.pricing.op("->>")("per_session").is_not(None)
    # "Đang bật" phải là đang bật THẬT: một hồ sơ bị đình chỉ vẫn có
    # is_active=True nhưng đã rời khỏi mọi chỗ công khai, nên đếm nó vào đây là
    # báo cho chính mình một con số cung cao hơn thực tế — mà đây là bảng dùng để
    # quyết định qua/dừng giai đoạn kiểm chứng.
    is_live = and_(PTProfile.is_active.is_(True), PTProfile.suspended_at.is_(None))
    pt_row = (
        await db.execute(
            select(
                func.count(),
                func.count().filter(is_live),
                func.count().filter(has_pricing),
                func.count().filter(
                    select(PTLocation.id)
                    .where(PTLocation.pt_profile_id == PTProfile.id)
                    .exists()
                ),
                func.count().filter(
                    select(PortfolioItem.id)
                    .where(PortfolioItem.pt_profile_id == PTProfile.id)
                    .exists()
                ),
                func.count().filter(PTProfile.review_count > 0),
                func.count().filter(
                    select(Lead.id).where(Lead.pt_profile_id == PTProfile.id).exists()
                ),
            )
            .select_from(PTProfile)
            .where(PTProfile.deleted_at.is_(None))
        )
    ).one()

    # ---- Mức độ dùng từng tính năng ---------------------------------------
    async def counts(stmt) -> tuple:
        return (await db.execute(stmt)).one()

    # Lead: người ẩn danh không có tài khoản, nên đếm người theo SĐT.
    lead_people, lead_events = await counts(
        select(func.count(func.distinct(Lead.trainee_phone)), func.count()).where(
            Lead.created_at >= since
        )
    )
    req_people, req_events = await counts(
        select(
            func.count(func.distinct(TraineeRequest.trainee_phone)), func.count()
        ).where(TraineeRequest.created_at >= since)
    )
    # PT nhận yêu cầu = lead sinh ra từ bảng tin (request_id không rỗng).
    claim_people, claim_events = await counts(
        select(func.count(func.distinct(Lead.pt_profile_id)), func.count()).where(
            Lead.created_at >= since, Lead.request_id.is_not(None)
        )
    )
    review_people, review_events = await counts(
        select(
            func.count(func.distinct(func.coalesce(Review.trainee_id.cast(Text), Review.reviewer_phone))),
            func.count(),
        ).where(Review.created_at >= since)
    )
    fav_people, fav_events = await counts(
        select(func.count(func.distinct(Favorite.user_id)), func.count()).where(
            Favorite.created_at >= since
        )
    )
    fb_events = await db.scalar(
        select(func.count()).select_from(Feedback).where(Feedback.created_at >= since)
    )
    # Lượt xem hồ sơ là bộ đếm tích luỹ, không có mốc thời gian và không gắn
    # danh tính — nên đây là TỔNG TỪ ĐẦU, không theo khoảng, và không đếm được người.
    views_all_time = await db.scalar(select(func.coalesce(func.sum(PTProfile.view_count), 0)))

    features = [
        FeatureUse(key="lead", label="Gửi yêu cầu tư vấn cho PT", people=lead_people, events=lead_events),
        FeatureUse(key="request", label="Đăng yêu cầu tìm PT", people=req_people, events=req_events),
        FeatureUse(key="claim", label="PT nhận yêu cầu từ bảng tin", people=claim_people, events=claim_events),
        FeatureUse(key="review", label="Viết đánh giá", people=review_people, events=review_events),
        FeatureUse(key="favorite", label="Lưu PT yêu thích", people=fav_people, events=fav_events),
        FeatureUse(key="feedback", label="Gửi góp ý", people=None, events=int(fb_events or 0)),
        FeatureUse(key="profile_view", label="Xem hồ sơ PT (tổng từ đầu)", people=None, events=int(views_all_time or 0)),
    ]

    # ---- Nhu cầu tập trung ở đâu ------------------------------------------
    specialty_rows = (
        await db.execute(
            select(TraineeRequest.specialty, func.count())
            .where(TraineeRequest.created_at >= since, TraineeRequest.specialty.is_not(None))
            .group_by(TraineeRequest.specialty)
            .order_by(func.count().desc())
            .limit(5)
        )
    ).all()
    area_rows = (
        await db.execute(
            select(TraineeRequest.ward, func.count())
            .where(TraineeRequest.created_at >= since, TraineeRequest.ward.is_not(None))
            .group_by(TraineeRequest.ward)
            .order_by(func.count().desc())
            .limit(5)
        )
    ).all()

    pending = await db.scalar(
        select(func.count()).select_from(Feedback).where(Feedback.handled_at.is_(None))
    )

    return AdminOverview(
        days=days,
        users_total=users_total,
        users_pt=users_pt,
        users_trainee=users_trainee,
        users_new=users_new,
        pt_profiles=pt_row[0],
        pt_active=pt_row[1],
        pt_with_pricing=pt_row[2],
        pt_with_location=pt_row[3],
        pt_with_portfolio=pt_row[4],
        pt_with_review=pt_row[5],
        pt_receiving_leads=pt_row[6],
        features=features,
        top_specialties=[
            DemandSignal(label=specialty_label(s), count=c) for s, c in specialty_rows
        ],
        top_areas=[DemandSignal(label=w, count=c) for w, c in area_rows],
        feedback_pending=int(pending or 0),
    )


@router.get("/feedback", response_model=FeedbackListOut)
async def list_feedback(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    category: Optional[str] = Query(default=None, pattern="^(feature|bug|ui|other)$"),
    only_pending: bool = False,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Hộp thư góp ý.

    Trước khi có endpoint này, bảng `feedbacks` chỉ có đường ghi: form gửi vào,
    không gì đọc ra được. Giao diện lại nói với người gửi là "chúng tôi sẽ xem
    xét" — một lời hứa với cái bảng không ai đọc.
    """
    stmt = select(Feedback, User.email).outerjoin(User, User.id == Feedback.user_id)
    if category:
        stmt = stmt.where(Feedback.category == FeedbackCategory(category))
    if only_pending:
        stmt = stmt.where(Feedback.handled_at.is_(None))

    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    pending = await db.scalar(
        select(func.count()).select_from(Feedback).where(Feedback.handled_at.is_(None))
    )

    rows = (
        await db.execute(
            stmt.order_by(Feedback.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()

    return FeedbackListOut(
        items=[
            FeedbackItem(
                id=fb.id,
                category=fb.category.value,
                message=fb.message,
                contact_email=fb.contact_email,
                user_email=user_email,
                created_at=fb.created_at,
                handled_at=fb.handled_at,
            )
            for fb, user_email in rows
        ],
        total=int(total or 0),
        page=page,
        page_size=page_size,
        pending=int(pending or 0),
    )


@router.patch("/feedback/{feedback_id}", response_model=FeedbackItem)
async def toggle_feedback_handled(
    feedback_id: uuid.UUID,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Bật/tắt trạng thái đã xử lý.

    Không có cái này thì hộp thư chỉ dài dần ra, mỗi lần mở phải đọc lại từ đầu
    để tìm cái chưa xem — và đúng lúc đó thì người ta thôi mở nó.
    """
    fb = await db.get(Feedback, feedback_id)
    if fb is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy góp ý")

    fb.handled_at = None if fb.handled_at else now_vn()
    await db.commit()
    await db.refresh(fb)

    user_email = (
        await db.scalar(select(User.email).where(User.id == fb.user_id))
        if fb.user_id
        else None
    )
    return FeedbackItem(
        id=fb.id,
        category=fb.category.value,
        message=fb.message,
        contact_email=fb.contact_email,
        user_email=user_email,
        created_at=fb.created_at,
        handled_at=fb.handled_at,
    )


@router.get("/reviews", response_model=AdminReviewList)
async def list_reviews_for_moderation(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    only_anonymous: bool = False,
    only_pending: bool = False,
    max_rating: Optional[int] = Query(default=None, ge=1, le=5),
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Đánh giá xuyên tất cả PT, mới nhất trước — để kiểm duyệt.

    Trước endpoint này, admin không có cách nào NHÌN THẤY một đánh giá phá hoại:
    đọc công khai thì phải biết trước slug của PT bị nhắm, mà nếu hồ sơ đã bị
    tắt thì không đọc được nữa.

    `only_anonymous` và `max_rating` là hai bộ lọc thực dụng: phá hoại gần như
    luôn là đánh giá điểm thấp gửi ẩn danh.
    """
    stmt = select(
        Review,
        PTProfile.full_name,
        PTProfile.slug,
        PTProfile.suspended_at,
        User.banned_at,
        User.deleted_at,
    ).join(
        PTProfile, PTProfile.id == Review.pt_profile_id
    ).join(
        User, User.id == PTProfile.user_id
    )
    if only_anonymous:
        stmt = stmt.where(Review.trainee_id.is_(None))
    if max_rating is not None:
        stmt = stmt.where(Review.rating <= max_rating)
    if only_pending:
        stmt = stmt.where(Review.approved_at.is_(None))

    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = (
        await db.execute(
            stmt.order_by(Review.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()

    return AdminReviewList(
        items=[
            AdminReviewItem(
                id=r.id,
                pt_name=pt_name,
                pt_slug=pt_slug,
                pt_suspended=pt_suspended_at is not None,
                pt_banned=pt_banned_at is not None,
                pt_deleted=pt_deleted_at is not None,
                reviewer_name=r.reviewer_name,
                reviewer_phone=r.reviewer_phone,
                rating=r.rating,
                content=r.content,
                image_count=len(r.images or []),
                is_anonymous=r.trainee_id is None,
                has_reply=bool(r.reply_content),
                created_at=r.created_at,
                approved_at=r.approved_at,
            )
            for (
                r,
                pt_name,
                pt_slug,
                pt_suspended_at,
                pt_banned_at,
                pt_deleted_at,
            ) in rows
        ],
        total=int(total or 0),
        page=page,
        page_size=page_size,
    )


@router.patch("/reviews/{review_id}", response_model=AdminReviewItem)
async def moderate_review(
    review_id: uuid.UUID,
    body: AdminReviewModerate,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Duyệt hoặc gỡ duyệt một đánh giá.

    Đánh giá gửi lên nằm ở hàng chờ (`approved_at IS NULL`): không hiện trên hồ
    sơ và không tính vào `avg_rating`. Trước đây mọi đánh giá lên thẳng công
    khai và công cụ duy nhất của admin là xoá cứng — tức là chỉ dọn được sau khi
    người xem đã đọc.
    """
    row = (
        await db.execute(
            select(Review, PTProfile.full_name, PTProfile.slug)
            .join(PTProfile, PTProfile.id == Review.pt_profile_id)
            .where(Review.id == review_id)
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy đánh giá")
    review, pt_name, pt_slug = row

    review.approved_at = now_vn() if body.approved else None
    await db.flush()
    # BẮT BUỘC: avg_rating/review_count chỉ đếm đánh giá đã duyệt, đổi trạng
    # thái mà không tính lại là để điểm công khai sai vĩnh viễn.
    await refresh_pt_rating(db, review.pt_profile_id)
    await db.commit()
    await db.refresh(review)

    logger.info(
        "Admin %s %s đánh giá %s (PT %s, %s sao)",
        admin.email,
        "duyệt" if body.approved else "gỡ duyệt",
        review.id,
        pt_slug,
        review.rating,
    )

    return AdminReviewItem(
        id=review.id,
        pt_name=pt_name,
        pt_slug=pt_slug,
        reviewer_name=review.reviewer_name,
        reviewer_phone=review.reviewer_phone,
        rating=review.rating,
        content=review.content,
        image_count=len(review.images or []),
        is_anonymous=review.trainee_id is None,
        has_reply=bool(review.reply_content),
        created_at=review.created_at,
        approved_at=review.approved_at,
    )

@router.patch("/pts/{slug}/suspension", response_model=PTSuspendResult)
async def suspend_pt_profile(
    slug: str,
    body: PTSuspendRequest,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Đình chỉ (hoặc bỏ đình chỉ) một hồ sơ PT.

    Trang chính sách quyền riêng tư hứa với học viên: "Nếu bị làm phiền, hãy báo
    cho chúng tôi để xử lý tài khoản PT đó." Trước endpoint này, cách duy nhất
    để làm việc đó là UPDATE thẳng vào DB — một lời hứa không có công cụ chống
    lưng.

    KHÔNG dùng `is_active`: cột đó là lựa chọn của PT và `PUT /pts/me` cho phép
    PT tự đặt, nên admin tắt xong PT bật lại được ngay. `suspended_at` chỉ
    endpoint này đổi được.

    Hồ sơ bị đình chỉ rời khỏi /pts, trang chủ và sitemap (listable_clause) và
    404 cả với link trực tiếp. Dữ liệu không bị xoá và PT vẫn đăng nhập được —
    dashboard sẽ nói rõ hồ sơ đang bị đình chỉ vì lý do gì.
    """
    profile = await db.scalar(select(PTProfile).where(PTProfile.slug == slug))
    if profile is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ PT")

    if body.suspended:
        reason = (body.reason or "").strip()
        if not reason:
            raise HTTPException(
                status_code=422, detail="Phải ghi lý do khi đình chỉ hồ sơ"
            )
        profile.suspended_at = now_vn()
        profile.suspended_reason = reason
    else:
        profile.suspended_at = None
        profile.suspended_reason = None

    await db.commit()
    await db.refresh(profile)

    # Ghi log để còn tra được ai làm gì: đây là thao tác ảnh hưởng tới sinh kế
    # của một người, không phải một lần bật/tắt cấu hình.
    logger.info(
        "admin %s %s hồ sơ %s%s",
        admin.email,
        "đình chỉ" if body.suspended else "bỏ đình chỉ",
        slug,
        " — lý do: %s" % profile.suspended_reason if profile.suspended_reason else "",
    )

    return PTSuspendResult(
        slug=profile.slug,
        full_name=profile.full_name,
        suspended=profile.suspended_at is not None,
        suspended_at=profile.suspended_at,
        suspended_reason=profile.suspended_reason,
    )


async def _profile_and_owner(db: AsyncSession, slug: str) -> tuple[PTProfile, User]:
    row = (
        await db.execute(
            select(PTProfile, User)
            .join(User, User.id == PTProfile.user_id)
            .where(PTProfile.slug == slug)
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ PT")
    return row[0], row[1]


def _refuse_on_admin(owner: User) -> None:
    """Chặn khoá/đóng một tài khoản quản trị.

    Không có chốt này thì một cú bấm nhầm dòng có thể tự khoá chính mình ra khỏi
    khu quản trị, và khu đó không có đường tự phục hồi qua web — phải SSH vào
    server chạy script. Đúng loại bẫy đã xảy ra một lần khi nâng quyền cho tài
    khoản PT rồi mất luôn dashboard.

    Đổi role vẫn làm được, nhưng bằng `python -m app.jobs.grant_admin` — có chủ ý,
    không phải một cú bấm.
    """
    if owner.role is UserRole.admin:
        raise HTTPException(
            status_code=409,
            detail="Không thao tác được trên tài khoản quản trị. "
            "Hạ quyền bằng grant_admin trước nếu thật sự cần.",
        )


def _account_state(profile: PTProfile, owner: User) -> PTAccountState:
    return PTAccountState(
        slug=profile.slug,
        full_name=profile.full_name,
        suspended=profile.suspended_at is not None,
        suspended_reason=profile.suspended_reason,
        banned=owner.banned_at is not None,
        ban_reason=owner.ban_reason,
        deleted=owner.deleted_at is not None,
    )


@router.patch("/pts/{slug}/ban", response_model=PTAccountState)
async def ban_pt_account(
    slug: str,
    body: PTBanRequest,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Khoá (hoặc mở khoá) tài khoản chủ hồ sơ này.

    Mạnh hơn đình chỉ hồ sơ: đình chỉ chỉ ẩn hồ sơ, PT vẫn đăng nhập và vẫn xem
    được danh sách lead cũ kèm số điện thoại học viên. Khoá tài khoản cắt hẳn
    đường vào, và cắt cả phiên đang mở.

    Đình chỉ hồ sơ KHÔNG bị đặt kèm ở đây: hai biện pháp độc lập, gộp lại thì
    mở khoá sẽ vô tình bỏ luôn đình chỉ đang có lý do riêng.
    """
    profile, owner = await _profile_and_owner(db, slug)
    _refuse_on_admin(owner)
    if owner.deleted_at is not None:
        raise HTTPException(status_code=409, detail="Tài khoản này đã được đóng")

    if body.banned:
        reason = (body.reason or "").strip()
        if not reason:
            raise HTTPException(
                status_code=422, detail="Phải ghi lý do khi khoá tài khoản"
            )
        ban_user(owner, reason)
    else:
        unban_user(owner)

    await db.commit()
    await db.refresh(profile)
    await db.refresh(owner)
    logger.info(
        "admin %s %s tài khoản %s (hồ sơ %s)%s",
        admin.email,
        "khoá" if body.banned else "mở khoá",
        owner.email,
        slug,
        " — lý do: %s" % owner.ban_reason if owner.ban_reason else "",
    )
    return _account_state(profile, owner)


@router.post("/pts/{slug}/close", response_model=PTAccountState)
async def close_pt_account(
    slug: str,
    body: PTCloseRequest,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Đóng tài khoản PT: khử danh tính + xoá mềm. KHÔNG hoàn tác được.

    Xem app/services/account_closure.py để biết cái gì bị khử và cái gì được
    giữ, cùng lý do (chính sách quyền riêng tư hứa cả "xoá dữ liệu tài khoản"
    lẫn "giữ lead để đối chiếu tranh chấp", mà lead chứa số của học viên).

    POST chứ không phải DELETE: đây không phải xoá một tài nguyên theo nghĩa
    HTTP — hàng dữ liệu vẫn còn, và có body cần xác nhận.
    """
    profile, owner = await _profile_and_owner(db, slug)
    _refuse_on_admin(owner)
    if body.confirm_slug.strip() != slug:
        raise HTTPException(
            status_code=422, detail="Chuỗi xác nhận không khớp slug hồ sơ"
        )
    if owner.deleted_at is not None:
        raise HTTPException(status_code=409, detail="Tài khoản này đã được đóng")

    old_email = owner.email
    old_slug = await close_account(db, owner)
    await db.commit()
    await db.refresh(profile)
    await db.refresh(owner)
    logger.info(
        "admin %s đóng tài khoản %s (hồ sơ %s) — đã khử danh tính",
        admin.email,
        old_email,
        old_slug or slug,
    )
    return _account_state(profile, owner)
