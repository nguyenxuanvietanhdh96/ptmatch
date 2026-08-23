"""Hai kênh Zalo: OA message và ZNS.

Chúng khác nhau ở ràng buộc, không phải ở chất lượng — chọn cái nào là quyết
định vận hành, nên code hỗ trợ cả hai:

**ZaloOAChannel** — gửi tin từ Official Account tới một người CỤ THỂ. API cần
`user_id` của người đó theo OA, thứ chỉ có khi họ đã quan tâm (follow) OA hoặc
đã nhắn cho OA. KHÔNG gửi được tới một số điện thoại bất kỳ. Miễn phí, dùng
được ngay, hợp giai đoạn onboard tay 20–30 PT vì "quét QR quan tâm OA" nhét
được vào quy trình onboard.

**ZnsChannel** — Zalo Notification Service, gửi theo template tới SỐ ĐIỆN THOẠI,
không cần người nhận follow gì. Đúng bài khi vượt quy mô onboard thủ công. Đổi
lại: cần OA đã xác thực doanh nghiệp, template phải được Zalo duyệt trước, và
trả phí theo từng tin.

CẦN ĐỐI CHIẾU TÀI LIỆU trước khi bật thật: endpoint, tên trường, hạn mức và
loại tin (`cs` tư vấn / `transaction` giao dịch) của Zalo có thay đổi theo
phiên bản, và mỗi loại có cửa sổ thời gian cùng điều kiện riêng. Phần dưới viết
theo Zalo OA API v3.0; hãy gửi thử một tin thật trước khi tin vào nó.

Access token của OA có hạn và phải làm mới bằng refresh token. Ở đây token được
đọc thẳng từ cấu hình — đủ cho giai đoạn kiểm chứng, nhưng khi chạy dài phải có
cơ chế tự làm mới, nếu không thông báo sẽ chết lặng sau vài ngày.
"""
import logging
from typing import Any, Dict, Optional, Tuple

import httpx

from app.core.config import settings
from app.services.channels.base import DeliveryResult, LeadNotification, Recipient
from app.services.channels.message import short_body

logger = logging.getLogger("ptmatch.notify")

_TIMEOUT = 10.0


def _post_json(url: str, token: str, payload: Dict[str, Any]) -> Tuple[bool, str]:
    """Gọi API Zalo. Trả (thành công, mô tả).

    Zalo trả HTTP 200 kèm `error != 0` khi thất bại, nên chỉ xét status code là
    tưởng nhầm đã gửi được.
    """
    try:
        resp = httpx.post(
            url,
            json=payload,
            headers={"access_token": token, "Content-Type": "application/json"},
            timeout=_TIMEOUT,
        )
    except Exception as exc:  # noqa: BLE001
        return False, "%s: %s" % (type(exc).__name__, exc)

    if resp.status_code >= 400:
        return False, "HTTP %s: %s" % (resp.status_code, resp.text[:200])

    try:
        data = resp.json()
    except ValueError:
        return False, "Phản hồi không phải JSON: %s" % resp.text[:200]

    error = data.get("error", 0)
    if error not in (0, None):
        return False, "Zalo error %s: %s" % (error, data.get("message", ""))
    return True, ""


class ZaloOAChannel:
    name = "zalo_oa"

    def is_configured(self) -> bool:
        return bool(settings.zalo_oa_access_token)

    def send_lead(self, recipient: Recipient, payload: LeadNotification) -> DeliveryResult:
        if not self.is_configured():
            return DeliveryResult(self.name, ok=False, skipped=True, detail="Chưa có ZALO_OA_ACCESS_TOKEN")
        if not recipient.zalo_user_id:
            # Rất hay gặp: PT chưa quan tâm OA. Là "bỏ qua" chứ không phải lỗi,
            # để chuỗi kênh chuyển tiếp xuống kênh sau mà không báo động.
            return DeliveryResult(
                self.name, ok=False, skipped=True, detail="PT chưa quan tâm OA (thiếu zalo_user_id)"
            )

        ok, detail = _post_json(
            "https://openapi.zalo.me/v3.0/oa/message/cs",
            settings.zalo_oa_access_token,
            {
                "recipient": {"user_id": recipient.zalo_user_id},
                "message": {"text": short_body(payload)},
            },
        )
        if not ok:
            logger.warning("Gửi Zalo OA thất bại: %s", detail)
        return DeliveryResult(self.name, ok=ok, detail=detail or None)


class ZnsChannel:
    name = "zns"

    def is_configured(self) -> bool:
        return bool(settings.zalo_oa_access_token and settings.zns_template_id)

    @staticmethod
    def _to_zns_phone(phone: str) -> Optional[str]:
        """ZNS yêu cầu số dạng 84xxxxxxxxx (không dấu +, không số 0 đầu)."""
        digits = "".join(c for c in phone if c.isdigit() or c == "+").lstrip("+")
        if digits.startswith("84"):
            return digits
        if digits.startswith("0"):
            return "84" + digits[1:]
        return None

    def send_lead(self, recipient: Recipient, payload: LeadNotification) -> DeliveryResult:
        if not self.is_configured():
            return DeliveryResult(
                self.name, ok=False, skipped=True, detail="Chưa có ZALO_OA_ACCESS_TOKEN/ZNS_TEMPLATE_ID"
            )
        if not recipient.phone:
            return DeliveryResult(self.name, ok=False, skipped=True, detail="Người nhận không có SĐT")

        phone = self._to_zns_phone(recipient.phone)
        if not phone:
            return DeliveryResult(self.name, ok=False, detail="SĐT không hợp lệ: %s" % recipient.phone)

        # Tên tham số phải TRÙNG với template đã đăng ký với Zalo. Đổi template
        # thì phải đổi ở đây — Zalo từ chối nguyên tin nếu thiếu hoặc thừa tham số.
        ok, detail = _post_json(
            "https://business.openapi.zalo.me/message/template",
            settings.zalo_oa_access_token,
            {
                "phone": phone,
                "template_id": settings.zns_template_id,
                "template_data": {
                    "trainee_name": payload.trainee_name,
                    "trainee_phone": payload.trainee_phone,
                    "goal": payload.goal or "—",
                    "area": payload.area or "—",
                    "budget": payload.budget or "—",
                },
            },
        )
        if not ok:
            logger.warning("Gửi ZNS thất bại: %s", detail)
        return DeliveryResult(self.name, ok=ok, detail=detail or None)
