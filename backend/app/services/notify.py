"""Gửi thông báo lead cho PT và ghi lại kết quả.

Chạy trong FastAPI BackgroundTask dưới dạng hàm async, để dùng lại async engine
sẵn có mà không phải thêm driver đồng bộ. Phần gọi kênh (SMTP/HTTP) là code chặn
nên được đẩy sang threadpool.

KHÔNG BAO GIỜ được ném lỗi ngược vào luồng request — học viên đã gửi form thành
công thì việc thông báo hỏng không được biến thành lỗi 500 của họ.

Việc chọn kênh nằm ở app/services/channels; ở đây chỉ lo gửi rồi ghi sổ.
"""
import logging
import uuid
from typing import List, Optional

from starlette.concurrency import run_in_threadpool

from app.models import NotificationDelivery
from app.services.channels import send_lead_notification
from app.services.channels.base import DeliveryResult, LeadNotification, Recipient

logger = logging.getLogger("ptmatch.notify")


def _status_of(result: DeliveryResult) -> str:
    if result.ok:
        return "sent"
    return "skipped" if result.skipped else "failed"


async def record_deliveries(
    lead_id: uuid.UUID, kind: str, results: List[DeliveryResult]
) -> None:
    """Ghi kết quả gửi vào notification_deliveries.

    Mở session riêng: hàm này chạy sau khi request đã trả về nên session của
    request đã đóng từ lâu.
    """
    if not results:
        return
    # Import tại chỗ để tránh vòng lặp import (database -> models -> services).
    from app.core.database import async_session_factory

    try:
        async with async_session_factory() as db:
            db.add_all(
                [
                    NotificationDelivery(
                        lead_id=lead_id,
                        kind=kind,
                        channel=r.channel,
                        status=_status_of(r),
                        detail=r.detail,
                    )
                    for r in results
                ]
            )
            await db.commit()
    except Exception:  # noqa: BLE001 — ghi sổ hỏng không được làm hỏng việc gửi
        logger.exception("Không ghi được notification_deliveries cho lead %s", lead_id)


async def notify_new_lead(
    *,
    lead_id: uuid.UUID,
    pt_name: str,
    trainee_name: str,
    trainee_phone: str,
    goal: Optional[str],
    area: Optional[str],
    budget: Optional[str],
    pt_email: Optional[str] = None,
    pt_phone: Optional[str] = None,
    pt_zalo_user_id: Optional[str] = None,
    is_reminder: bool = False,
    hours_waiting: Optional[int] = None,
    is_claim: bool = False,
) -> bool:
    """Background task: báo cho PT về một lead.

    Trả True nếu có ÍT NHẤT MỘT kênh gửi thành công. `lead_reminders` dựa vào
    giá trị này để quyết định có đốt lượt nhắc một-lần-duy-nhất hay không — hai
    caller khác (leads.py, requests.py) gọi qua BackgroundTasks nên không đọc
    giá trị trả về, không có gì đổi hành vi ở đó.
    """
    try:
        # Kênh là code ĐỒNG BỘ và chặn (SMTP, HTTP tới Zalo). Task này chạy trên
        # event loop, nên gọi thẳng sẽ giữ loop và làm đứng mọi request đang bay.
        results = await run_in_threadpool(
            send_lead_notification,
            Recipient(email=pt_email, phone=pt_phone, zalo_user_id=pt_zalo_user_id),
            LeadNotification(
                pt_name=pt_name,
                trainee_name=trainee_name,
                trainee_phone=trainee_phone,
                goal=goal,
                area=area,
                budget=budget,
                is_reminder=is_reminder,
                hours_waiting=hours_waiting,
                is_claim=is_claim,
            ),
        )
        delivered = next((r.channel for r in results if r.ok), None)
        logger.info(
            "Thông báo lead %s cho %s: %s",
            lead_id,
            pt_name,
            "đã gửi qua %s" % delivered
            if delivered
            else "KHÔNG kênh nào gửi được (%s)"
            % ", ".join("%s=%s" % (r.channel, r.detail or "?") for r in results),
        )
        if is_reminder:
            kind = "lead_reminder"
        elif is_claim:
            kind = "request_claim"
        else:
            kind = "new_lead"
        await record_deliveries(lead_id, kind, results)
        return delivered is not None
    except Exception:  # noqa: BLE001 — background task không được ném ra ngoài
        logger.exception("Thông báo lead %s thất bại", lead_id)
        return False
