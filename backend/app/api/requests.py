"""Bảng "Học viên cần PT" — học viên đăng nhu cầu, PT chủ động nhận."""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Literal, Optional, Sequence

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    Request,
    status,
)
from sqlalchemy import case, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_current_admin,
    get_current_pt_profile,
    get_current_user,
    get_optional_user,
)
from app.core.database import get_db
from app.core.ratelimit import limiter
from app.models import (
    REQUEST_LIFETIME_DAYS,
    CloseReason,
    Lead,
    LeadStatus,
    PTProfile,
    RequestStatus,
    TraineeRequest,
    User,
    UserRole,
)
from app.schemas.request import (
    ClaimingPT,
    MyTraineeRequestOut,
    RequestClaimOut,
    RequestCloseIn,
    RequestFunnelOut,
    TraineeRequestCreate,
    TraineeRequestListResponse,
    TraineeRequestOut,
)
from app.services.labels import format_budget_range, specialty_label
from app.services.notify import notify_new_lead
from app.services.slug import strip_diacritics

router = APIRouter(prefix="/requests", tags=["requests"])


def _to_out(
    request: TraineeRequest, claimed_ids: Optional[set] = None
) -> TraineeRequestOut:
    out = TraineeRequestOut.model_validate(request)
    if claimed_ids is not None:
        out.claimed_by_me = request.id in claimed_ids
    return out


async def _claimed_ids_for(
    db: AsyncSession, user: Optional[User], request_ids: Sequence[uuid.UUID]
) -> Optional[set]:
    """Tập yêu cầu mà PT đang đăng nhập đã nhận — để nút bấm hiện đúng trạng thái."""
    if user is None or user.role != UserRole.pt or not request_ids:
        return None
    profile_id = await db.scalar(
        select(PTProfile.id).where(PTProfile.user_id == user.id)
    )
    if profile_id is None:
        return None
    rows = await db.scalars(
        select(Lead.request_id).where(
            Lead.pt_profile_id == profile_id, Lead.request_id.in_(request_ids)
        )
    )
    return set(rows.all())


@router.post("", response_model=TraineeRequestOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("3/hour;10/day")
async def create_request(
    request: Request,
    body: TraineeRequestCreate,
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    trainee_request = TraineeRequest(
        trainee_id=current_user.id if current_user else None,
        trainee_name=body.trainee_name,
        trainee_phone=body.trainee_phone,
        contact_other=body.contact_other,
        specialty=body.specialty,
        city=body.city,
        ward=body.ward,
        budget_min=body.budget_min,
        budget_max=body.budget_max,
        preferred_gender=body.preferred_gender,
        note=body.note,
        expires_at=now + timedelta(days=REQUEST_LIFETIME_DAYS),
    )
    db.add(trainee_request)
    await db.commit()
    await db.refresh(trainee_request)
    return _to_out(trainee_request)


@router.get("", response_model=TraineeRequestListResponse)
async def list_requests(
    specialty: Optional[str] = Query(default=None, max_length=50),
    city: Optional[str] = Query(default=None, max_length=100),
    ward: Optional[str] = Query(default=None, max_length=100),
    # PT lọc "yêu cầu có ngân sách kham nổi mức giá của tôi".
    budget_min: Optional[int] = Query(default=None, ge=0),
    # Giới tính của chính PT, để bỏ qua yêu cầu chỉ định giới tính khác.
    gender: Optional[Literal["male", "female", "other"]] = None,
    include_closed: bool = False,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, ge=1, le=50),
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(TraineeRequest)

    if not include_closed:
        # "Còn nhận được" = học viên chưa tự đóng và chưa hết hạn. Không xét
        # claim_count: đã có PT nhận không có nghĩa là học viên tìm được người.
        stmt = stmt.where(
            TraineeRequest.status == RequestStatus.open,
            TraineeRequest.expires_at > datetime.now(timezone.utc),
        )

    if specialty:
        stmt = stmt.where(TraineeRequest.specialty == specialty)
    # So khớp gần đúng, bỏ dấu — giống hệt bộ lọc khu vực của /api/pts.
    #
    # Trước đây chỗ này dùng so sánh bằng tuyệt đối trên dữ liệu người dùng tự
    # gõ, nên "quận 7" hay "Quan 7" đều trả về rỗng, và "Bình Thạnh" không khớp
    # "Quận Bình Thạnh". Hai đầu của cùng một chợ mà lọc theo hai luật khác nhau
    # là lỗi tự tạo ra: học viên đăng ở một dạng, PT tìm ở dạng khác, không ai
    # thấy ai.
    if city:
        stmt = stmt.where(
            func.lower(func.ptmatch_unaccent(TraineeRequest.city)).ilike(
                "%" + strip_diacritics(city).lower() + "%"
            )
        )
    if ward:
        stmt = stmt.where(
            func.lower(func.ptmatch_unaccent(TraineeRequest.ward)).ilike(
                "%" + strip_diacritics(ward).lower() + "%"
            )
        )
    if budget_min is not None:
        # Yêu cầu không ghi ngân sách vẫn hiện — chưa nói gì thì chưa loại.
        stmt = stmt.where(
            or_(
                TraineeRequest.budget_max.is_(None),
                TraineeRequest.budget_max >= budget_min,
            )
        )
    if gender:
        stmt = stmt.where(
            or_(
                TraineeRequest.preferred_gender.is_(None),
                TraineeRequest.preferred_gender == gender,
            )
        )

    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))

    stmt = (
        stmt.order_by(TraineeRequest.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    requests = (await db.scalars(stmt)).all()
    claimed_ids = await _claimed_ids_for(db, current_user, [r.id for r in requests])

    return TraineeRequestListResponse(
        items=[_to_out(r, claimed_ids) for r in requests],
        total=int(total or 0),
        page=page,
        page_size=page_size,
    )


# ---- /requests/mine phải khai báo trước /requests/{request_id} ----


@router.get("/mine", response_model=List[MyTraineeRequestOut])
async def list_my_requests(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Yêu cầu do chính học viên đăng, kèm danh sách PT đã nhận."""
    requests = (
        await db.scalars(
            select(TraineeRequest)
            .where(TraineeRequest.trainee_id == user.id)
            .order_by(TraineeRequest.created_at.desc())
        )
    ).all()
    if not requests:
        return []

    rows = (
        await db.execute(
            select(
                Lead.request_id,
                PTProfile.slug,
                PTProfile.full_name,
                PTProfile.avatar_url,
                PTProfile.avg_rating,
                PTProfile.review_count,
                Lead.created_at,
            )
            .join(PTProfile, PTProfile.id == Lead.pt_profile_id)
            .where(Lead.request_id.in_([r.id for r in requests]))
            .order_by(Lead.created_at)
        )
    ).all()

    by_request: Dict[uuid.UUID, List[ClaimingPT]] = {}
    for request_id, slug, full_name, avatar_url, rating, reviews, claimed_at in rows:
        by_request.setdefault(request_id, []).append(
            ClaimingPT(
                slug=slug,
                full_name=full_name,
                avatar_url=avatar_url,
                avg_rating=rating,
                review_count=reviews,
                claimed_at=claimed_at,
            )
        )

    out = []
    for request in requests:
        item = MyTraineeRequestOut.model_validate(request)
        item.claimed_by = by_request.get(request.id, [])
        out.append(item)
    return out


@router.get("/stats", response_model=RequestFunnelOut)
async def request_funnel(
    days: Optional[int] = Query(default=None, ge=1, le=365),
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Phễu chợ ngược: đăng → có PT nhận → PT thật sự liên hệ → chốt được.

    Lý do tồn tại: "3 PT đã nhận" KHÔNG có nghĩa là học viên tìm được người.
    Bấm nhận chỉ là lấy số điện thoại. Không tách được hai bước đó thì tiêu chí
    dừng của giai đoạn kiểm chứng đang đo nhầm số — và sẽ kết luận chợ chạy được
    trong khi chưa ai tập với ai.

    Tính hoàn toàn từ dữ liệu sẵn có, không cột mới:
    - có PT nhận  = tồn tại lead sinh từ yêu cầu này
    - đã liên hệ  = lead đó có first_response_at (PT đổi trạng thái khỏi 'new')
    - chốt được   = lead đó ở trạng thái closed
    """
    since = (
        datetime.now(timezone.utc) - timedelta(days=days) if days is not None else None
    )

    def scoped(stmt):
        return stmt.where(TraineeRequest.created_at >= since) if since else stmt

    # Một yêu cầu đếm một lần ở mỗi bước, dù có mấy PT nhận.
    reached = (
        select(
            func.count(func.distinct(TraineeRequest.id)).label("claimed"),
            func.count(
                func.distinct(
                    case((Lead.first_response_at.isnot(None), TraineeRequest.id))
                )
            ).label("contacted"),
            func.count(
                func.distinct(
                    case((Lead.status == LeadStatus.closed, TraineeRequest.id))
                )
            ).label("won"),
        )
        .select_from(TraineeRequest)
        .join(Lead, Lead.request_id == TraineeRequest.id)
    )
    step = (await db.execute(scoped(reached))).one()

    posted = await db.scalar(
        scoped(select(func.count()).select_from(TraineeRequest))
    )
    # Chưa ai nhận mà đã hết hạn — số này lớn nghĩa là thiếu PT, không phải
    # thiếu học viên. Hai chẩn đoán đó dẫn tới hai việc làm khác nhau.
    expired_untouched = await db.scalar(
        scoped(
            select(func.count())
            .select_from(TraineeRequest)
            .where(
                TraineeRequest.claim_count == 0,
                TraineeRequest.expires_at <= datetime.now(timezone.utc),
            )
        )
    )
    claims = await db.scalar(
        scoped(
            select(func.count())
            .select_from(Lead)
            .join(TraineeRequest, TraineeRequest.id == Lead.request_id)
        )
    )
    # Chính học viên bấm — tin được hơn requests_won, vốn dựa vào trạng thái lead
    # do PT tự khai.
    closed = dict(
        (
            await db.execute(
                scoped(
                    select(TraineeRequest.close_reason, func.count())
                    .where(TraineeRequest.close_reason.isnot(None))
                    .group_by(TraineeRequest.close_reason)
                )
            )
        ).all()
    )

    return RequestFunnelOut(
        window_days=days,
        requests_posted=posted or 0,
        requests_claimed=step.claimed or 0,
        requests_contacted=step.contacted or 0,
        requests_won=step.won or 0,
        requests_expired_unclaimed=expired_untouched or 0,
        claims_total=claims or 0,
        closed_found_pt=closed.get(CloseReason.found_pt.value, 0),
        closed_no_longer_needed=closed.get(CloseReason.no_longer_needed.value, 0),
    )


@router.get("/{request_id}", response_model=TraineeRequestOut)
async def get_request(
    request_id: uuid.UUID,
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    trainee_request = await db.get(TraineeRequest, request_id)
    if trainee_request is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy yêu cầu")
    claimed_ids = await _claimed_ids_for(db, current_user, [trainee_request.id])
    return _to_out(trainee_request, claimed_ids)


@router.post("/{request_id}/claim", response_model=RequestClaimOut)
async def claim_request(
    request_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    profile: PTProfile = Depends(get_current_pt_profile),
    db: AsyncSession = Depends(get_db),
):
    """PT nhận một yêu cầu: tạo Lead trong dashboard của chính họ.

    Lead mang số điện thoại, còn bảng công khai thì không — đây chính là ranh
    giới sẽ đặt cổng thu phí khi bắt đầu bán gói nhận lead.
    """
    trainee_request = await db.get(TraineeRequest, request_id)
    if trainee_request is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy yêu cầu")

    already = await db.scalar(
        select(Lead.id).where(
            Lead.request_id == request_id, Lead.pt_profile_id == profile.id
        )
    )
    if already:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bạn đã nhận yêu cầu này rồi",
        )

    # Tăng bộ đếm bằng một câu UPDATE có điều kiện. Không còn trần suất, nhưng
    # điều kiện open/chưa hết hạn vẫn phải nằm trong chính câu UPDATE: học viên
    # bấm đóng đúng lúc PT bấm nhận thì không được lọt.
    claimed = (
        await db.execute(
            update(TraineeRequest)
            .where(
                TraineeRequest.id == request_id,
                TraineeRequest.status == RequestStatus.open,
                TraineeRequest.expires_at > datetime.now(timezone.utc),
            )
            .values(claim_count=TraineeRequest.claim_count + 1)
            .returning(TraineeRequest.claim_count)
        )
    ).first()

    if claimed is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Yêu cầu này đã đóng hoặc đã hết hạn",
        )

    area = ", ".join(
        part for part in (trainee_request.ward, trainee_request.city) if part
    )
    goal_parts = [
        part
        for part in (specialty_label(trainee_request.specialty), trainee_request.note)
        if part
    ]
    # Kênh liên hệ phụ chỉ lộ ra ở đây — sau khi PT đã nhận. Gộp vào goal thay
    # vì thêm cột cho Lead: đây là ô đầu tiên PT đọc trên thẻ Kanban.
    if trainee_request.contact_other:
        goal_parts.append(f"Liên hệ thêm: {trainee_request.contact_other}")

    lead = Lead(
        request_id=trainee_request.id,
        pt_profile_id=profile.id,
        trainee_id=trainee_request.trainee_id,
        trainee_name=trainee_request.trainee_name,
        trainee_phone=trainee_request.trainee_phone,
        goal=" — ".join(goal_parts) or None,
        area=area or None,
        budget=format_budget_range(
            trainee_request.budget_min, trainee_request.budget_max
        ),
    )
    db.add(lead)
    try:
        await db.commit()
    except IntegrityError:
        # Chỉ số duy nhất (request_id, pt_profile_id) chặn double-click; rollback
        # trả lại luôn lần tăng claim_count vừa rồi.
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bạn đã nhận yêu cầu này rồi",
        )

    await db.refresh(lead)

    # Gửi thông tin liên hệ về hộp thư của PT.
    #
    # PT vừa thấy số trên màn hình, nên đây không phải là báo tin — mà là để họ
    # gọi được từ điện thoại mà không phải mở lại site, và để lượt nhận này có
    # bản ghi trong notification_deliveries giống như lead đến từ form. Thiếu nó
    # thì phễu chợ ngược là chỗ duy nhất không đo được kênh nào đã tới tay ai.
    pt_user = await db.scalar(select(User).where(User.id == profile.user_id))
    if pt_user is not None:
        background_tasks.add_task(
            notify_new_lead,
            lead_id=lead.id,
            pt_name=profile.full_name,
            trainee_name=lead.trainee_name,
            trainee_phone=lead.trainee_phone,
            goal=lead.goal,
            area=lead.area,
            budget=lead.budget,
            pt_email=pt_user.email,
            pt_phone=pt_user.phone,
            pt_zalo_user_id=pt_user.zalo_user_id,
            is_claim=True,
        )

    return RequestClaimOut(
        request_id=trainee_request.id,
        lead_id=lead.id,
        # Để PT thấy ngay mình là người thứ mấy — thông tin thật, khác hẳn
        # "còn N suất" vốn chỉ nói "chưa ai nhận".
        claim_count=claimed[0],
    )


@router.patch("/{request_id}/close", response_model=MyTraineeRequestOut)
async def close_request(
    request_id: uuid.UUID,
    body: RequestCloseIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Học viên đóng yêu cầu — kèm lý do, và lý do là bắt buộc.

    Chỉ có hai lựa chọn, cố ý: "đã tìm được PT" và "không còn nhu cầu". Đây là
    tín hiệu chuyển đổi đáng tin duy nhất của chợ ngược — trạng thái lead do
    chính PT tự khai nên không chứng minh được điều gì, còn học viên bấm thì đó
    là kết quả thật.
    """
    trainee_request = await db.get(TraineeRequest, request_id)
    if trainee_request is None or trainee_request.trainee_id != user.id:
        raise HTTPException(status_code=404, detail="Không tìm thấy yêu cầu")

    # Chỉ đóng được yêu cầu đang mở.
    #
    # Trước đây gọi lại lần hai là ghi đè close_reason cũ, và một yêu cầu đã hết
    # hạn vẫn "đóng" được để gán lý do hồi tố. Cả hai đều làm hỏng đúng con số
    # mà endpoint này sinh ra để bảo vệ: tỉ lệ "đã tìm được PT" là bằng chứng
    # chuyển đổi của chợ, nên nó phải phản ánh thời điểm và lý do thật.
    if trainee_request.status is not RequestStatus.open:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Yêu cầu này đã đóng trước đó",
        )
    if trainee_request.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Yêu cầu đã hết hạn, không cần đóng nữa",
        )

    trainee_request.status = RequestStatus.closed
    trainee_request.close_reason = body.reason
    await db.commit()
    await db.refresh(trainee_request)
    return MyTraineeRequestOut.model_validate(trainee_request)
