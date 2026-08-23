"""Gửi một email bất kỳ qua SMTP.

Tách khỏi `channels/email.py` vì giờ có hai loại thư hoàn toàn khác nhau:
thông báo lead (đi qua chuỗi kênh có dự phòng Zalo/log) và thư giao dịch như
đặt lại mật khẩu (chỉ có một đường duy nhất là email — không có Zalo nào thay
thế được một đường link bí mật).

Chỉ có một chỗ nói chuyện với SMTP để cấu hình, timeout và cách xử lý lỗi không
trôi khỏi nhau.
"""
import logging
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Optional

from app.core.config import settings

logger = logging.getLogger("ptmatch.mailer")


@dataclass(frozen=True)
class MailResult:
    ok: bool
    # Vì sao hỏng, giữ nguyên loại lỗi và thông điệp của SMTP.
    #
    # Chuỗi này đi thẳng vào `notification_deliveries.detail` và hiện ở
    # GET /admin/lead-ops. Nuốt nó thành một câu chung chung nghĩa là khi thông
    # báo chết hàng loạt, chỗ duy nhất để chẩn đoán chỉ nói "gửi thất bại" —
    # sai mật khẩu SMTP và domain bị chặn trông y hệt nhau.
    error: Optional[str] = None


def smtp_configured() -> bool:
    return bool(settings.smtp_host)


def send_email(to: str, subject: str, body: str) -> MailResult:
    """Gửi thư dạng text thuần.

    KHÔNG ném lỗi ra ngoài: mọi chỗ gọi đều nằm trong background task hoặc trong
    luồng mà thư hỏng không được biến thành lỗi 500 của người dùng.
    """
    if not smtp_configured():
        logger.warning("SMTP chưa cấu hình — bỏ qua thư '%s' gửi tới %s", subject, to)
        return MailResult(ok=False, error="SMTP chưa cấu hình")
    if not to:
        return MailResult(ok=False, error="Không có địa chỉ nhận")
    try:
        msg = EmailMessage()
        msg["From"] = settings.smtp_from or settings.smtp_user
        msg["To"] = to
        msg["Subject"] = subject
        msg.set_content(body)

        # Hai kiểu TLS không giống nhau: SSL/implicit (cổng 465 điển hình) là TLS
        # ngay từ lúc bắt tay TCP; STARTTLS (cổng 587) bắt đầu ở plaintext rồi
        # nâng cấp giữa phiên. Trỏ nhầm loại vào nhầm cổng thì treo ~10s rồi lỗi
        # khó hiểu — từng chỉ hỗ trợ STARTTLS nên ai cấu hình cổng 465 (phổ biến
        # ở một số nhà cung cấp VN) sẽ gặp đúng triệu chứng này.
        smtp_cls = smtplib.SMTP_SSL if settings.smtp_use_ssl else smtplib.SMTP
        with smtp_cls(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            if settings.smtp_use_tls and not settings.smtp_use_ssl:
                smtp.starttls()
            if settings.smtp_user:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(msg)
        return MailResult(ok=True)
    except Exception as exc:  # noqa: BLE001 — xem docstring
        logger.exception("Gửi email tới %s thất bại", to)
        return MailResult(ok=False, error="%s: %s" % (type(exc).__name__, exc))
