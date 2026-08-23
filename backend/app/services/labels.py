"""Nhãn tiếng Việt cho dữ liệu dạng slug, dùng khi backend phải sinh văn bản.

Bản sao của `frontend/lib/constants.ts` — giữ đồng bộ khi thêm chuyên môn mới.
Chỉ dùng cho chuỗi do backend tạo (nội dung lead, email thông báo); phần hiển
thị trên giao diện vẫn dịch ở frontend.
"""
from typing import Optional

SPECIALTY_LABELS = {
    "weight_loss": "Giảm cân",
    "muscle_gain": "Tăng cơ",
    "bodybuilding": "Bodybuilding",
    "female_fitness": "Fitness cho nữ",
    "beginner": "Fitness cho người mới",
    "senior": "Người lớn tuổi",
    "rehab": "Phục hồi chấn thương",
    "online_coaching": "Online Coaching",
}

GENDER_LABELS = {"male": "Nam", "female": "Nữ", "other": "Khác"}


def specialty_label(slug: Optional[str]) -> Optional[str]:
    if not slug:
        return None
    return SPECIALTY_LABELS.get(slug, slug)


def format_vnd(amount: Optional[int]) -> Optional[str]:
    """500000 -> '500.000đ'"""
    if amount is None:
        return None
    return "{:,}đ".format(int(amount)).replace(",", ".")


def format_budget_range(
    minimum: Optional[int], maximum: Optional[int]
) -> Optional[str]:
    """Khoảng ngân sách thành chuỗi đọc được, khớp cách Lead.budget đang lưu."""
    low, high = format_vnd(minimum), format_vnd(maximum)
    if low and high:
        return "%s - %s/buổi" % (low, high)
    if high:
        return "Dưới %s/buổi" % high
    if low:
        return "Từ %s/buổi" % low
    return None
