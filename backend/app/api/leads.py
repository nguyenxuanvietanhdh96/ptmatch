import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    Request,
    status,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_pt_profile, get_current_user, get_optional_user
from app.core.config import settings
from app.core.database import get_db
from app.core.ratelimit import limiter
from app.models import Lead, LeadStatus, PTProfile, User
from app.schemas.lead import (
    LeadCreate,
    LeadCreatedOut,
    LeadOut,
    LeadTrackOut,
    LeadStatusUpdate,
    MyLeadOut,
)
from app.services.notify import notify_new_lead
from app.services.privacy import mask_phone

router = APIRouter(prefix="/leads", tags=["leads"])


def _lead_for_pt(lead: Lead) -> LeadOut:
    """LeadOut dưới góc nhìn của PT, che SĐT nếu bật MASK_LEAD_PHONE."""
    out = LeadOut.model_validate(lead)
    if settings.mask_lead_phone:
        out.trainee_phone = mask_phone(out.trainee_phone)
    return out


@router.post("", response_model=LeadCreatedOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute;30/hour")
async def submit_lead(
    request: Request,
    body: LeadCreate,
    background_tasks: BackgroundTasks,
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    profile = await db.scalar(
        select(PTProfile).where(
            PTProfile.slug == body.pt_slug, PTProfile.is_active.is_(True)
        )
    )
    if profile is None:
        raise HTTPException(status_code=404, detail="PT not found")

    lead = Lead(
        pt_profile_id=profile.id,
        trainee_id=current_user.id if current_user else None,
        trainee_name=body.trainee_name,
        trainee_phone=body.trainee_phone,
        goal=body.goal,
        area=body.area,
        budget=body.budget,
    )
    db.add(lead)
    await db.commit()
    await db.refresh(lead)

    # Lấy đủ mọi địa chỉ liên hệ của PT một lượt; lớp kênh tự chọn cái nào dùng
    # được theo NOTIFY_CHANNELS (xem app/services/channels).
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
        )

    # track_token CHỈ trả về ở đây, ngay sau khi tạo. Đây là thứ duy nhất cho
    # người gửi ẩn danh quay lại xem tình trạng, nên phía client phải giữ lấy
    # (hiện link tra cứu) — mọi endpoint khác không bao giờ trả trường này.
    out = LeadCreatedOut.model_validate(lead)
    out.track_token = lead.track_token
    return out


# ---------------------------------------------------------------------------
# Tra cứu công khai bằng mã — dành cho người gửi ẩn danh
#
# Form lead quảng cáo "không cần tạo tài khoản", nên phần lớn lead không gắn với
# tài khoản nào. Không có đường này thì người gửi bấm xong là mất dấu hoàn toàn:
# không biết PT đã xem chưa, không báo lại được, và cũng không liên hệ lại được.
# ---------------------------------------------------------------------------


@router.get("/track/{token}", response_model=LeadTrackOut)
async def track_lead(token: str, db: AsyncSession = Depends(get_db)):
    row = (
        await db.execute(
            select(Lead, PTProfile.full_name, PTProfile.slug, PTProfile.avatar_url)
            .join(PTProfile, PTProfile.id == Lead.pt_profile_id)
            .where(Lead.track_token == token)
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy yêu cầu")

    lead, pt_name, pt_slug, pt_avatar_url = row
    return LeadTrackOut(
        pt_name=pt_name,
        pt_slug=pt_slug,
        pt_avatar_url=pt_avatar_url,
        trainee_name=lead.trainee_name,
        goal=lead.goal,
        area=lead.area,
        budget=lead.budget,
        status=lead.status.value,
        created_at=lead.created_at,
        first_response_at=lead.first_response_at,
        reported_no_contact=lead.trainee_reported_no_contact_at is not None,
    )


@router.post("/track/{token}/no-contact", response_model=LeadTrackOut)
@limiter.limit("10/hour")
async def report_no_contact(
    request: Request,
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """Học viên báo "PT chưa liên hệ tôi".

    Đây là tín hiệu chất lượng đáng giá nhất thu được từ phía cầu: trạng thái
    lead do chính PT khai, nên "đã liên hệ" không chứng minh được PT thật sự đã
    gọi. Một học viên bấm nút này là bằng chứng ngược lại, và nó vào thẳng bảng
    theo dõi của admin.

    Cố ý KHÔNG đổi `status` của lead: đó là cột của PT. Ghi mốc riêng để hai
    phía nói được hai chuyện khác nhau, và chênh lệch giữa chúng chính là thứ
    đáng xem.
    """
    lead = await db.scalar(select(Lead).where(Lead.track_token == token))
    if lead is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy yêu cầu")

    if lead.trainee_reported_no_contact_at is None:
        lead.trainee_reported_no_contact_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(lead)

    profile = await db.get(PTProfile, lead.pt_profile_id)
    return LeadTrackOut(
        pt_name=profile.full_name if profile else "",
        pt_slug=profile.slug if profile else "",
        pt_avatar_url=profile.avatar_url if profile else None,
        trainee_name=lead.trainee_name,
        goal=lead.goal,
        area=lead.area,
        budget=lead.budget,
        status=lead.status.value,
        created_at=lead.created_at,
        first_response_at=lead.first_response_at,
        reported_no_contact=True,
    )


@router.get("/mine", response_model=List[MyLeadOut])
async def list_leads_sent_by_me(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Leads the logged-in trainee has sent, newest first, with PT info."""
    rows = (
        await db.execute(
            select(Lead, PTProfile.full_name, PTProfile.slug, PTProfile.avatar_url)
            .join(PTProfile, PTProfile.id == Lead.pt_profile_id)
            .where(Lead.trainee_id == user.id)
            .order_by(Lead.created_at.desc())
        )
    ).all()
    return [
        MyLeadOut(
            id=lead.id,
            pt_name=pt_name,
            pt_slug=pt_slug,
            pt_avatar_url=pt_avatar_url,
            goal=lead.goal,
            area=lead.area,
            budget=lead.budget,
            status=lead.status.value,
            created_at=lead.created_at,
        )
        for lead, pt_name, pt_slug, pt_avatar_url in rows
    ]


@router.get("", response_model=List[LeadOut])
async def list_my_leads(
    status_filter: Optional[str] = Query(
        default=None,
        alias="status",
        pattern="^(new|contacted|closed|lost)$",
    ),
    profile: PTProfile = Depends(get_current_pt_profile),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Lead)
        .where(Lead.pt_profile_id == profile.id)
        .order_by(Lead.created_at.desc())
    )
    if status_filter:
        stmt = stmt.where(Lead.status == LeadStatus(status_filter))
    leads = (await db.scalars(stmt)).all()
    return [_lead_for_pt(lead) for lead in leads]


@router.patch("/{lead_id}/status", response_model=LeadOut)
async def update_lead_status(
    lead_id: uuid.UUID,
    body: LeadStatusUpdate,
    profile: PTProfile = Depends(get_current_pt_profile),
    db: AsyncSession = Depends(get_db),
):
    lead = await db.scalar(
        select(Lead).where(Lead.id == lead_id, Lead.pt_profile_id == profile.id)
    )
    if lead is None:
        raise HTTPException(status_code=404, detail="Lead not found")

    new_status = LeadStatus(body.status)
    # Lần đầu rời khỏi 'new' được tính là đã phản hồi. Ghi một lần duy nhất —
    # PT chuyển trạng thái qua lại về sau không được làm đẹp số liệu.
    if lead.first_response_at is None and new_status is not LeadStatus.new:
        lead.first_response_at = datetime.now(timezone.utc)
    lead.status = new_status
    await db.commit()
    await db.refresh(lead)
    return _lead_for_pt(lead)
