"""Điều kiện tối thiểu để một hồ sơ PT được bày ra chỗ công khai.

Đăng ký xong là `PTProfile` đã có `is_active = True`, nên trước đây một tài
khoản vừa tạo — không ảnh, không giá, không khu vực — đã nằm sẵn trên /pts và
trong sitemap. Vài hồ sơ như vậy xen giữa những hồ sơ thật là đủ để người xem
kết luận cả trang là chợ rác, và đó là ấn tượng đắt nhất trong giai đoạn đang
mua lưu lượng.

Ba yêu cầu dưới đây cố ý ít: chúng chỉ chặn hồ sơ *rỗng*, không phải hồ sơ
*sơ sài*. Mọi thứ khác (bio, chứng chỉ, portfolio) làm hồ sơ hấp dẫn hơn nhưng
không phải điều kiện để tồn tại.

Đình chỉ bởi admin (`suspended_at`) cũng loại hồ sơ khỏi mọi chỗ công khai,
nhưng KHÔNG phải một "yêu cầu còn thiếu" — PT không thể tự bổ sung để hết bị
đình chỉ. Nó được báo cho PT bằng một khối riêng, xem `PTDetail.suspended`.

`listable_clause()` và `missing_listing_requirements()` diễn đạt **cùng một
quy tắc** ở hai nơi — một cho câu SQL lọc danh sách, một cho Python để nói cho
PT biết họ còn thiếu gì. Sửa cái này thì phải sửa cái kia, nếu không dashboard
sẽ báo "hồ sơ đã hiển thị" trong khi truy vấn vẫn loại nó ra.
"""

from typing import Any, Dict, List, Optional

from sqlalchemy import Numeric, and_, case, func, select

from app.models import PTLocation, PTProfile

# Khoá kỹ thuật -> nhãn hiển thị cho PT. Frontend đọc khoá, không đọc nhãn.
LISTING_REQUIREMENT_LABELS: Dict[str, str] = {
    "avatar": "Ảnh đại diện",
    "price": "Giá theo buổi",
    "location": "Khu vực hoạt động",
}


def per_session_price_expr():
    """`pricing->>'per_session'` dưới dạng số, NULL nếu không phải số.

    `pricing` là JSONB tự do nên ép kiểu thẳng sẽ làm cả truy vấn tìm kiếm đổ
    500 ngay khi có một hồ sơ lưu giá trị không phải số. CASE giữ những dòng đó
    ra ngoài phép so sánh (NULL luôn so sánh false).
    """
    return case(
        (
            func.jsonb_typeof(PTProfile.pricing["per_session"]) == "number",
            PTProfile.pricing["per_session"].astext.cast(Numeric),
        ),
        else_=None,
    )


def listable_clause():
    """Mệnh đề WHERE cho mọi chỗ liệt kê hồ sơ ra công khai."""
    return and_(
        # Đình chỉ bởi admin. Phải nằm ở ĐÂY, không phải chỉ ở một truy vấn nào
        # đó: hồ sơ bị xử lý phải rời khỏi /pts, sitemap và trang chủ cùng lúc,
        # nếu không thì "đã xử lý" chỉ đúng ở một chỗ.
        PTProfile.suspended_at.is_(None),
        PTProfile.is_active.is_(True),
        func.coalesce(PTProfile.avatar_url, "") != "",
        per_session_price_expr() > 0,
        select(PTLocation.id)
        .where(PTLocation.pt_profile_id == PTProfile.id)
        .exists(),
    )


def reachable_clause():
    """Hồ sơ còn được TƯƠNG TÁC qua link trực tiếp: xem, gửi lead, đánh giá, lưu.

    Khác `listable_clause()`: KHÔNG đòi ảnh/giá/khu vực. Hồ sơ chưa đủ điều kiện
    vẫn phải xem được qua link để PT tự kiểm và chia sẻ trong lúc bổ sung — đó là
    chủ ý, không phải sơ hở.

    Nhưng hồ sơ bị đình chỉ thì mọi đường vào phải đóng, kể cả POST trực tiếp
    bằng slug. Quan trọng nhất là `/api/leads`: đình chỉ một PT thường xảy ra
    CHÍNH VÌ họ làm phiền học viên, nên một hồ sơ bị đình chỉ mà vẫn nhận được số
    điện thoại thì biện pháp xử lý chỉ là trang trí.

    Tồn tại như một hàm dùng chung vì mệnh đề này trước đây được viết lại ở bốn
    nơi (pts, leads, reviews, favorites). Bốn bản sao thì lần thêm điều kiện sau
    sẽ sửa được ba.
    """
    return and_(
        PTProfile.is_active.is_(True),
        PTProfile.suspended_at.is_(None),
    )


def _positive_number(value: Any) -> bool:
    # bool là subclass của int trong Python: `True` sẽ lọt qua isinstance(int)
    # và biến thành "giá 1đ" nếu không loại trừ ở đây.
    if isinstance(value, bool):
        return False
    return isinstance(value, (int, float)) and value > 0


def missing_listing_requirements(profile: PTProfile) -> List[str]:
    """Những yêu cầu hồ sơ này còn thiếu; rỗng nghĩa là đã đủ điều kiện hiển thị.

    Không xét `is_active`: đó là lựa chọn của PT (tạm ẩn hồ sơ), không phải
    thiếu sót cần đi bổ sung.
    """
    missing: List[str] = []
    if not (profile.avatar_url or "").strip():
        missing.append("avatar")
    pricing: Optional[Dict[str, Any]] = profile.pricing or {}
    if not _positive_number(pricing.get("per_session")):
        missing.append("price")
    if not profile.locations:
        missing.append("location")
    return missing
