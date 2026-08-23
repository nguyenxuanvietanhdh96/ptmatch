"""Tính lại điểm trung bình và số đánh giá của một PT.

Tách khỏi api/reviews.py vì giờ có hai đường thay đổi tập đánh giá đã duyệt:
người dùng gửi/sửa/xoá đánh giá, và admin duyệt hoặc gỡ duyệt. Cả hai bắt buộc
phải dùng chung một định nghĩa — `avg_rating`/`review_count` là cột phi chuẩn
hoá, sai một lần là sai vĩnh viễn, không có gì báo lỗi.
"""
import uuid

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PTProfile, Review


async def refresh_pt_rating(db: AsyncSession, pt_profile_id: uuid.UUID) -> None:
    """Tính lại avg_rating / review_count từ các đánh giá ĐÃ DUYỆT.

    Viết thành một câu UPDATE ... = (SELECT ...) để hai đánh giá về cùng lúc
    không ghi đè lên nhau bằng giá trị đọc từ trước.

    Chỉ đếm `approved_at IS NOT NULL` — đúng bằng tập hiện ra công khai. Lệch
    nhau thì hồ sơ khoe "4.8 sao · 12 đánh giá" trong khi bên dưới đếm được 5.
    """
    approved = (
        Review.pt_profile_id == pt_profile_id,
        Review.approved_at.isnot(None),
    )
    avg_sq = (
        select(func.coalesce(func.round(func.avg(Review.rating), 2), 0))
        .where(*approved)
        .scalar_subquery()
    )
    count_sq = (
        select(func.count()).select_from(Review).where(*approved).scalar_subquery()
    )
    await db.execute(
        update(PTProfile)
        .where(PTProfile.id == pt_profile_id)
        .values(avg_rating=avg_sq, review_count=count_sq)
    )
