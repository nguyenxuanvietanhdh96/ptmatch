"""Kênh ghi log — luôn khả dụng, không bao giờ hỏng.

Mục đích: ở dev và ở môi trường chưa cắm kênh thật, sự kiện lead vẫn phải nhìn
thấy được. Đặt nó CUỐI chuỗi kênh để nó chỉ chạy khi mọi kênh thật đã bỏ qua
hoặc thất bại — khi đó dòng log là bằng chứng "đã có lead nhưng không gửi đi
đâu được", chứ không phải im lặng.
"""
import logging

from app.services.channels.base import DeliveryResult, LeadNotification, Recipient
from app.services.channels.message import short_body

logger = logging.getLogger("ptmatch.notify")


class LogChannel:
    name = "log"

    def is_configured(self) -> bool:
        return True

    def send_lead(self, recipient: Recipient, payload: LeadNotification) -> DeliveryResult:
        logger.info(
            "[%s] Thông báo lead cho %s (email=%s phone=%s zalo=%s):\n%s",
            self.name,
            payload.pt_name,
            recipient.email or "—",
            recipient.phone or "—",
            recipient.zalo_user_id or "—",
            short_body(payload),
        )
        return DeliveryResult(channel=self.name, ok=True)
