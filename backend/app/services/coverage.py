"""Vùng phục vụ — chặn dữ liệu khu vực nằm ngoài các tỉnh đang mở.

Vì sao chặn ở tầng GHI chứ không chỉ lọc ô chọn ở frontend: chợ hai chiều sống
bằng mật độ, không bằng độ phủ. Một PT ở tỉnh chưa mở và một học viên ở tỉnh
khác nữa sẽ không bao giờ gặp nhau — họ chỉ làm loãng số liệu kiểm chứng rồi bỏ
đi sau khi thấy chợ trống. Ô chọn đã lọc danh sách, nhưng đó là UI: API vẫn nhận
giá trị bất kỳ nếu ai đó gọi trực tiếp.

Việc canonicalize (trả về đúng tên trong danh mục) quan trọng ngang việc chặn.
Bộ lọc khu vực so khớp theo chuỗi con, nên "TP.HCM" lưu trong DB không bao giờ
gặp "Thành phố Hồ Chí Minh" mà học viên chọn từ ô chọn — đúng lỗi mà alembic
0012 đã phải dọn một lần. Ở đây nhận đầu vào khoan dung (thiếu dấu, thiếu tiền
tố "Thành phố"/"Tỉnh", hoa thường tuỳ ý) nhưng LƯU LẠI luôn dạng chuẩn, nên dữ
liệu không thể phân hoá thêm lần nữa.

Cấu hình ở settings.served_provinces; để rỗng là bỏ giới hạn.
"""
import re
from typing import List, Optional

from app.core.config import settings
from app.services.slug import strip_diacritics

# Bỏ tiền tố đơn vị hành chính khi so tên: người dùng (và dữ liệu cũ) viết
# "Đồng Nai" hay "TP. Hồ Chí Minh" trong khi danh mục ghi "Tỉnh Đồng Nai" /
# "Thành phố Hồ Chí Minh".
_UNIT_PREFIX_RE = re.compile(r"^(thanh pho|tinh|tp)\.?\s+")

# Viết tắt không thể nhầm của các tỉnh ĐANG MỞ, đã chuẩn hoá sẵn ở cả hai phía.
# Cùng tinh thần với alembic 0012 (nơi phải dọn hậu quả của việc lưu mỗi nơi một
# dạng): chấp nhận ở đầu vào rồi lưu dạng chuẩn thì không phải dọn lần nữa.
# Tỉnh chưa mở không cần có mặt ở đây — chúng bị từ chối dù viết dạng nào.
_ALIASES = {
    "hcm": "ho chi minh",
    "tphcm": "ho chi minh",
    "tp.hcm": "ho chi minh",
    "sai gon": "ho chi minh",
    "saigon": "ho chi minh",
}


def _normalize(name: str) -> str:
    """Khoá so sánh tên tỉnh. Giữ đồng bộ với normalizeProvinceName() ở
    frontend/lib/constants.ts — hai bên lệch nhau thì ô chọn cho qua mà API lại
    từ chối."""
    value = strip_diacritics(name).strip().lower()
    value = _UNIT_PREFIX_RE.sub("", value)
    return re.sub(r"\s+", " ", value).strip()


def _match_key(name: str) -> str:
    """Khoá so sánh, đã gộp các cách viết tắt về một dạng."""
    key = _normalize(name)
    return _ALIASES.get(key, key)


def served_provinces() -> List[str]:
    """Tên chuẩn của các tỉnh đang mở. Rỗng = không giới hạn."""
    return settings.served_province_list


def is_coverage_limited() -> bool:
    return bool(served_provinces())


def canonicalize_province(value: Optional[str]) -> Optional[str]:
    """Trả tên tỉnh dạng chuẩn, hoặc ném ValueError nếu ngoài vùng phục vụ.

    None/chuỗi rỗng đi qua nguyên vẹn: khu vực là trường không bắt buộc ở cả hồ
    sơ PT lẫn yêu cầu của học viên, và "chưa khai" khác với "khai sai".
    """
    if value is None:
        return None
    value = value.strip()
    if not value:
        return None

    allowed = served_provinces()
    if not allowed:
        return value

    wanted = _match_key(value)
    for canonical in allowed:
        if _match_key(canonical) == wanted:
            return canonical

    raise ValueError(
        "PTMatch hiện chỉ hoạt động ở %s. Khu vực \"%s\" chưa được hỗ trợ."
        % (" và ".join(allowed), value)
    )
