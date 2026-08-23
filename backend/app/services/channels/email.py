"""Kênh email qua SMTP.

Phần nói chuyện với SMTP nằm ở app/services/mailer.py — dùng chung với thư giao
dịch (đặt lại mật khẩu). Ở đây chỉ lo dựng nội dung cho thông báo lead và dịch
kết quả sang `DeliveryResult` của chuỗi kênh.
"""
import logging

from app.services.channels.base import DeliveryResult, LeadNotification, Recipient
from app.services.channels.message import long_body, subject_for
from app.services.identity import is_placeholder_email
from app.services.mailer import send_email, smtp_configured

logger = logging.getLogger("ptmatch.notify")


class EmailChannel:
    name = "email"

    def is_configured(self) -> bool:
        return smtp_configured()

    def send_lead(self, recipient: Recipient, payload: LeadNotification) -> DeliveryResult:
        if not self.is_configured():
            return DeliveryResult(self.name, ok=False, skipped=True, detail="SMTP chưa cấu hình")
        if not recipient.email:
            return DeliveryResult(self.name, ok=False, skipped=True, detail="Người nhận không có email")
        # Tài khoản đăng nhập bằng Zalo mang email tự sinh trên một domain không
        # tồn tại. Gửi tới đó là thư bay vào hư không, mà sổ gửi lại ghi "đã
        # gửi" — ta tưởng PT đã được báo trong khi họ chưa biết có lead nào.
        if is_placeholder_email(recipient.email):
            return DeliveryResult(
                self.name, ok=False, skipped=True,
                detail="Tài khoản đăng nhập bằng mạng xã hội, chưa có email thật",
            )

        result = send_email(recipient.email, subject_for(payload), long_body(payload))
        return DeliveryResult(self.name, ok=result.ok, detail=result.error)
