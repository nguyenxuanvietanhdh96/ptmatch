"""Sổ đăng ký kênh + logic chọn kênh khi gửi.

Thứ tự kênh lấy từ `NOTIFY_CHANNELS` (danh sách ngăn cách bằng dấu phẩy). Gửi
theo thứ tự đó và DỪNG Ở KÊNH ĐẦU TIÊN THÀNH CÔNG — đây là chuỗi dự phòng, không
phải gửi trùng: PT nhận cùng một lead qua ba kênh sẽ khó chịu và sẽ tắt hết.

Kênh "bỏ qua" (chưa cấu hình, thiếu địa chỉ) không tính là thất bại; chỉ đơn
giản là thử kênh kế tiếp.
"""
import logging
from typing import Dict, List

from app.core.config import settings
from app.services.channels.base import (
    Channel,
    DeliveryResult,
    LeadNotification,
    Recipient,
)
from app.services.channels.email import EmailChannel
from app.services.channels.log import LogChannel
from app.services.channels.zalo import ZaloOAChannel, ZnsChannel

logger = logging.getLogger("ptmatch.notify")

_REGISTRY: Dict[str, Channel] = {
    c.name: c
    for c in (LogChannel(), EmailChannel(), ZaloOAChannel(), ZnsChannel())
}


def available_channels() -> List[str]:
    return sorted(_REGISTRY)


def configured_channels() -> List[Channel]:
    """Kênh được bật, theo đúng thứ tự trong NOTIFY_CHANNELS."""
    out: List[Channel] = []
    for name in settings.notify_channel_list:
        channel = _REGISTRY.get(name)
        if channel is None:
            logger.warning(
                "NOTIFY_CHANNELS có kênh không tồn tại: %r (hợp lệ: %s)",
                name,
                ", ".join(available_channels()),
            )
            continue
        out.append(channel)
    return out


def send_lead_notification(
    recipient: Recipient, payload: LeadNotification
) -> List[DeliveryResult]:
    """Gửi qua chuỗi kênh, dừng ở kênh đầu tiên thành công.

    Trả về TOÀN BỘ kết quả đã thử, kể cả các kênh bỏ qua/thất bại trước đó —
    phía gọi ghi hết vào bảng notification_deliveries, vì "Zalo hỏng nên rơi
    xuống email" đúng là thứ cần nhìn thấy được.
    """
    results: List[DeliveryResult] = []
    for channel in configured_channels():
        try:
            result = channel.send_lead(recipient, payload)
        except Exception as exc:  # noqa: BLE001 — kênh lỗi không được chặn kênh sau
            logger.exception("Kênh %s ném lỗi ngoài dự kiến", channel.name)
            result = DeliveryResult(
                channel.name, ok=False, detail="%s: %s" % (type(exc).__name__, exc)
            )
        results.append(result)
        if result.ok:
            break
    return results
