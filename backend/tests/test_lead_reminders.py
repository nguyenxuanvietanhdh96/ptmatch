"""Job nhắc lead — commit theo từng lead, và chỉ tiêu lượt nhắc khi gửi được.

`app.jobs.lead_reminders.run_once` dùng `async_session_factory` module-level
(trỏ theo `settings.database_url`), khác với các route API vốn được test qua
`client` fixture (đã override sang DB test). Patch lại engine của job để nó
cũng chạm đúng DB test — không có patch này, test sẽ âm thầm đọc/ghi vào DB dev
thật.
"""
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.jobs import lead_reminders
from tests.conftest import TEST_DATABASE_URL
from tests.test_api import auth_header, pt_slug, register


async def _overdue_lead(client, raw_sql, slug: str) -> str:
    sent = await client.post(
        "/api/leads",
        json={
            "pt_slug": slug,
            "trainee_name": "Hoc Vien Cho Nhac",
            "trainee_phone": "0912345678",
        },
    )
    assert sent.status_code == 201, sent.text
    lead_id = sent.json()["id"]
    # Quá ngưỡng LEAD_REMINDER_AFTER_HOURS (mặc định 12h) để job coi là overdue.
    await raw_sql(
        "UPDATE leads SET created_at = :created_at WHERE id = :id",
        created_at=datetime.now(timezone.utc) - timedelta(hours=13),
        id=lead_id,
    )
    return lead_id


async def _reminder_sent_at(raw_sql, lead_id: str):
    rows = await raw_sql("SELECT reminder_sent_at FROM leads WHERE id = :id", id=lead_id)
    return rows[0][0]


async def _run_once_against_test_db():
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        with patch.object(lead_reminders, "async_session_factory", session_factory):
            return await lead_reminders.run_once()
    finally:
        await engine.dispose()


async def test_successful_delivery_marks_the_reminder_sent(client, raw_sql):
    pt = await register(client, "pt", "Pt Nhac Thanh Cong")
    slug = await pt_slug(client, pt)
    lead_id = await _overdue_lead(client, raw_sql, slug)

    with patch.object(lead_reminders, "notify_new_lead", return_value=True):
        sent = await _run_once_against_test_db()

    assert sent == 1
    assert await _reminder_sent_at(raw_sql, lead_id) is not None


async def test_failed_delivery_does_not_burn_the_one_shot_reminder(client, raw_sql):
    """Trước đây `reminder_sent_at` bị set vô điều kiện sau khi gọi
    notify_new_lead — dù mọi kênh đều fail. Lead đó biến mất khỏi tầm nhắc mãi,
    vì `ix_leads_pending_reminder` chỉ xét `reminder_sent_at IS NULL`."""
    pt = await register(client, "pt", "Pt Nhac That Bai")
    slug = await pt_slug(client, pt)
    lead_id = await _overdue_lead(client, raw_sql, slug)

    with patch.object(lead_reminders, "notify_new_lead", return_value=False):
        sent = await _run_once_against_test_db()

    assert sent == 0
    assert await _reminder_sent_at(raw_sql, lead_id) is None

    # Lượt sau (SMTP/Zalo đã hồi phục) phải thử lại đúng lead này, không phải
    # bỏ qua vì "đã xử lý".
    with patch.object(lead_reminders, "notify_new_lead", return_value=True):
        sent_again = await _run_once_against_test_db()
    assert sent_again == 1
    assert await _reminder_sent_at(raw_sql, lead_id) is not None


async def test_earlier_lead_in_the_batch_keeps_its_commit_if_a_later_one_fails(client, raw_sql):
    """Mỗi lead commit ngay sau khi gửi — một lead fail ở giữa batch không được
    rollback lead đã gửi thành công trước nó trong CÙNG một lượt chạy."""
    pt = await register(client, "pt", "Pt Nhac Nhieu Lead")
    slug = await pt_slug(client, pt)
    ok_lead = await _overdue_lead(client, raw_sql, slug)
    failing_lead = await _overdue_lead(client, raw_sql, slug)

    async def fake_notify(*, lead_id, **kwargs):
        return str(lead_id) == ok_lead

    with patch.object(lead_reminders, "notify_new_lead", side_effect=fake_notify):
        sent = await _run_once_against_test_db()

    assert sent == 1
    assert await _reminder_sent_at(raw_sql, ok_lead) is not None
    assert await _reminder_sent_at(raw_sql, failing_lead) is None
