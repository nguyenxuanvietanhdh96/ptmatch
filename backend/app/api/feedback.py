from typing import Optional

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_optional_user
from app.core.database import get_db
from app.core.ratelimit import limiter
from app.models import User
from app.models.feedback import Feedback
from app.schemas.feedback import FeedbackCreate, FeedbackOut

router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post("", response_model=FeedbackOut, status_code=201)
@limiter.limit("5/minute;30/hour")
async def submit_feedback(
    request: Request,
    body: FeedbackCreate,
    user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    # Dùng get_optional_user thay vì tự giải mã token: hàm cũ chỉ lấy `sub` từ
    # JWT rồi ghi thẳng vào user_id mà không kiểm tra người đó còn tồn tại,
    # nên token của một tài khoản đã xoá làm vỡ khoá ngoại và trả 500.
    fb = Feedback(
        category=body.category,
        message=body.message.strip(),
        contact_email=body.contact_email.strip() if body.contact_email else None,
        user_id=user.id if user else None,
    )
    db.add(fb)
    await db.commit()
    await db.refresh(fb)
    return FeedbackOut.model_validate(fb)
