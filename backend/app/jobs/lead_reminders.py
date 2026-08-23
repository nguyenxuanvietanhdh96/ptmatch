"""Nhắc PT về lead còn nằm im ở trạng thái 'new'.

Chạy:  python -m app.jobs.lead_reminders

Vì sao cần: trạng thái lead do chính PT tự chuyển, nên một lead bị bỏ quên trông
y hệt một lead vừa mới tới. Không có gì phát hiện, và học viên thì đã được hứa
"PT sẽ liên hệ trong 24 giờ". Job này biến sự im lặng đó thành một hành động.

Nhắc ĐÚNG MỘT LẦN cho mỗi lead (`reminder_sent_at`). Nhắc lặp lại sẽ bị PT coi
là spam rồi tắt thông báo — mất luôn cả kênh báo lead mới, tức là tệ hơn không
nhắc gì.

Ngưỡng lấy từ LEAD_REMINDER_AFTER_HOURS (mặc định 12 giờ) — đủ để không làm
phiền PT đang bận trong ngày, và vẫn kịp trước mốc 24 giờ đã hứa với học viên.
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core.config import settings
from app.core.database import async_session_factory, engine
from app.models import Lead, LeadStatus, PTProfile, User
from app.services.notify import notify_new_lead

logger = logging.getLogger("ptmatch.jobs.lead_reminders")


async def run_once() -> int:
    """Gửi nhắc cho các lead quá hạn. Trả về số lead đã nhắc."""
    cutoff = datetime.now(timezone.utc) - timedelta(
        hours=settings.lead_reminder_after_hours
    )
    sent = 0

    async with async_session_factory() as db:
        rows = (
            await db.execute(
                select(Lead, PTProfile.full_name, User.email, User.phone, User.zalo_user_id)
                .join(PTProfile, PTProfile.id == Lead.pt_profile_id)
                .join(User, User.id == PTProfile.user_id)
                .where(
                    Lead.status == LeadStatus.new,
                    Lead.reminder_sent_at.is_(None),
                    Lead.created_at < cutoff,
                )
                .order_by(Lead.created_at)
            )
        ).all()

        logger.info("Tìm thấy %d lead quá %dh chưa xử lý", len(rows), settings.lead_reminder_after_hours)

        for lead, pt_name, pt_email, pt_phone, pt_zalo_user_id in rows:
            hours = int(
                (datetime.now(timezone.utc) - lead.created_at).total_seconds() // 3600
            )
            # notify_new_lead không bao giờ ném lỗi, tự ghi notification_deliveries,
            # và trả True nếu có ít nhất một kênh gửi thành công.
            delivered = await notify_new_lead(
                lead_id=lead.id,
                pt_name=pt_name,
                trainee_name=lead.trainee_name,
                trainee_phone=lead.trainee_phone,
                goal=lead.goal,
                area=lead.area,
                budget=lead.budget,
                pt_email=pt_email,
                pt_phone=pt_phone,
                pt_zalo_user_id=pt_zalo_user_id,
                is_reminder=True,
                hours_waiting=hours,
            )
            if not delivered:
                # KHÔNG đốt lượt nhắc một-lần-duy-nhất khi mọi kênh đều fail
                # (SMTP/Zalo chập) — để lần chạy sau (chạy mỗi giờ) thử lại
                # đúng lead này, thay vì lead biến mất khỏi tầm nhắc mãi.
                logger.warning(
                    "Không kênh nào gửi được nhắc lead %s cho %s — để lại cho lượt sau",
                    lead.id, pt_name,
                )
                continue
            # Đánh dấu và commit NGAY SAU KHI gửi thành công, từng lead một —
            # không dồn tới cuối vòng lặp. Dồn vào một commit cuối nghĩa là
            # tiến trình chết giữa chừng (deploy restart container backend mà
            # cron đang `exec` vào) làm rollback luôn các lead ĐÃ gửi thành
            # công ở những vòng trước trong cùng lượt chạy này, và lượt sau
            # gửi lại nguyên cả loạt — không phải "trùng một lần" như tưởng.
            lead.reminder_sent_at = datetime.now(timezone.utc)
            await db.commit()
            sent += 1

    return sent


async def main() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(levelname)s:     %(name)s - %(message)s"
    )
    try:
        count = await run_once()
        logger.info("Đã nhắc %d lead.", count)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
