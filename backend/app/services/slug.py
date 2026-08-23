"""Vietnamese-aware slugify + unique slug generation."""
import re
import secrets
import unicodedata

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


def strip_diacritics(value: str) -> str:
    """'Nguyễn Văn Đạt' -> 'Nguyen Van Dat' (đ -> d, remove combining marks)."""
    value = value.replace("đ", "d").replace("Đ", "D")
    value = unicodedata.normalize("NFD", value)
    return "".join(c for c in value if unicodedata.category(c) != "Mn")


def slugify(value: str) -> str:
    """'Nguyễn Văn A' -> 'nguyen-van-a' (strip diacritics, đ -> d)."""
    value = strip_diacritics(value)
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return value or "pt"


# Số lần thử hậu tố đếm tăng trước khi chuyển sang hậu tố ngẫu nhiên. Đếm tăng
# cho URL đẹp hơn ("nguyen-van-a-2"), nhưng mỗi lần thử là một SELECT, nên một
# cái tên phổ biến không được phép kéo theo hàng trăm truy vấn mỗi lần đăng ký.
_SEQUENTIAL_PROBES = 20


async def generate_unique_slug(db: AsyncSession, full_name: str) -> str:
    """Sinh slug chưa ai dùng cho hồ sơ PT.

    Đây chỉ là "chưa ai dùng TẠI THỜI ĐIỂM kiểm tra" — hai PT trùng tên đăng ký
    cùng lúc vẫn có thể nhận cùng một slug. Ràng buộc unique ở DB mới là chốt
    chặn; phía gọi phải bắt IntegrityError và thử lại (xem api/auth.py::register).
    """
    from app.models.pt_profile import PTProfile

    async def taken(candidate: str) -> bool:
        return (
            await db.scalar(select(PTProfile.id).where(PTProfile.slug == candidate))
        ) is not None

    base = slugify(full_name)
    if not await taken(base):
        return base

    for counter in range(2, _SEQUENTIAL_PROBES + 2):
        candidate = "%s-%d" % (base, counter)
        if not await taken(candidate):
            return candidate

    # Quá nhiều trùng lặp: bỏ đếm tăng, lấy hậu tố ngẫu nhiên. Vòng lặp phải có
    # điểm dừng — không thì một cái tên đủ phổ biến sẽ làm đăng ký chậm dần đều.
    return "%s-%s" % (base, secrets.token_hex(4))
