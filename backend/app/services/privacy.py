"""Che bớt dữ liệu liên hệ khi hiển thị."""

_VISIBLE_PREFIX = 3
_VISIBLE_SUFFIX = 3


def mask_phone(phone: str) -> str:
    """Che phần giữa của số điện thoại: 0912345678 -> 091****678.

    Đủ để PT nhận ra lead nào là lead nào (và đối chiếu sau khi mở khoá),
    nhưng không gọi được nếu chưa trả phí.
    """
    if not phone:
        return phone
    digits = phone.strip()
    if len(digits) <= _VISIBLE_PREFIX + _VISIBLE_SUFFIX:
        return digits[:2] + "*" * max(0, len(digits) - 2)
    hidden = len(digits) - _VISIBLE_PREFIX - _VISIBLE_SUFFIX
    return "%s%s%s" % (
        digits[:_VISIBLE_PREFIX],
        "*" * hidden,
        digits[-_VISIBLE_SUFFIX:],
    )
