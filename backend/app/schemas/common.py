"""Kiểu dữ liệu dùng chung cho các schema."""
import re
from typing import Optional
from urllib.parse import urlsplit

# Chỉ hai scheme này được phép xuất hiện trong URL do người dùng nhập.
#
# Mọi URL ở đây rốt cuộc đều được render thành href hoặc src trên hồ sơ công
# khai. Một chuỗi "javascript:..." lọt qua là thành XSS ngay khi có chỗ nào
# render nó mà không tự kiểm tra lại; "data:" thì nhét được cả tài liệu HTML.
# Danh sách cho phép (thay vì danh sách cấm) là cách duy nhất không bỏ sót.
ALLOWED_URL_SCHEMES = frozenset({"http", "https"})

MAX_URL_LENGTH = 500


def validate_public_url(value: Optional[str], *, field: str = "URL") -> Optional[str]:
    """Kiểm tra URL an toàn để nhúng vào trang công khai.

    Chấp nhận đường dẫn tương đối bắt đầu bằng "/" (ảnh do chính hệ thống phục
    vụ qua /media) và URL tuyệt đối dùng http/https. Từ chối mọi thứ còn lại.
    """
    if value is None:
        return None

    value = value.strip()
    if not value:
        return None

    if len(value) > MAX_URL_LENGTH:
        raise ValueError("%s quá dài (tối đa %d ký tự)" % (field, MAX_URL_LENGTH))

    # Đường dẫn nội bộ: "/media/...". Chặn "//host" vì đó là URL giao thức tương
    # đối, trình duyệt hiểu là sang tên miền khác.
    if value.startswith("/"):
        if value.startswith("//"):
            raise ValueError("%s không hợp lệ" % field)
        return value

    scheme = urlsplit(value).scheme.lower()
    if scheme not in ALLOWED_URL_SCHEMES:
        raise ValueError(
            "%s phải bắt đầu bằng http:// hoặc https:// (nhận được: %s)"
            % (field, scheme or "không có scheme")
        )
    return value


# Số điện thoại VN: 10 chữ số bắt đầu bằng 0, hoặc dạng +84.
_VN_PHONE_DIGITS = re.compile(r"^(?:0\d{9}|(?:\+?84)\d{9})$")


def _to_local_phone(digits: str) -> str:
    """"+84912345678" / "84912345678" -> "0912345678"; số bắt đầu bằng 0 giữ nguyên."""
    trimmed = digits.lstrip("+")
    if trimmed.startswith("84"):
        return "0" + trimmed[2:]
    return trimmed


def normalize_social_url(value: Optional[str], platform: str) -> Optional[str]:
    """Chuẩn hoá liên kết mạng xã hội PT tự nhập thành URL dùng được.

    Người dùng gõ đúng thứ họ quen: "fb.com/tuanpt", hoặc với Zalo là số điện
    thoại. Từ chối những giá trị đó là bắt họ học cú pháp URL; nhưng lưu nguyên
    xi cũng hỏng, vì React render "0912345678" thành href tương đối và ra link
    chết "/pt/0912345678".

    Nên: bổ sung phần còn thiếu, và chỉ từ chối những scheme thật sự nguy hiểm
    (javascript:, data:) — đây là giá trị sẽ thành href trên hồ sơ công khai.
    """
    if value is None:
        return None

    value = value.strip()
    if not value:
        return None

    if len(value) > MAX_URL_LENGTH:
        raise ValueError("Liên kết %s quá dài" % platform)

    # Zalo hay được nhập bằng số điện thoại — dạng chia sẻ chính thức của Zalo.
    if platform == "zalo":
        digits = value.replace(" ", "").replace(".", "").replace("-", "")
        if _VN_PHONE_DIGITS.match(digits):
            return "https://zalo.me/%s" % _to_local_phone(digits)

    scheme = urlsplit(value).scheme.lower()
    if not scheme:
        # "fb.com/tuanpt" -> "https://fb.com/tuanpt"
        return "https://%s" % value.lstrip("/")
    if scheme not in ALLOWED_URL_SCHEMES:
        raise ValueError(
            "Liên kết %s không hợp lệ: chỉ chấp nhận http:// hoặc https://" % platform
        )
    return value
