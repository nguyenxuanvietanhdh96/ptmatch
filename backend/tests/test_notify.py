"""Kiểm thử lớp kênh thông báo và hàm notify.

Bất biến quan trọng nhất được bảo vệ ở đây: **không kênh nào được ném lỗi ra
ngoài**. Thông báo chạy trong BackgroundTask sau khi học viên đã gửi form thành
công — một lỗi SMTP hay Zalo lọt ra ngoài sẽ biến thành lỗi 500 của họ, hoặc tệ
hơn là giết luôn task và mất cả những kênh dự phòng phía sau.
"""
from unittest.mock import patch

from app.services.channels import send_lead_notification
from app.services.channels.base import DeliveryResult, LeadNotification, Recipient
from app.services.channels.email import EmailChannel
from app.services.channels.message import long_body, short_body, subject_for
from app.services.channels.zalo import ZaloOAChannel, ZnsChannel

PAYLOAD = LeadNotification(
    pt_name="Nguyễn Văn A",
    trainee_name="Trần Thị B",
    trainee_phone="0901234567",
    goal="Giảm cân",
    area="Phường Sài Gòn",
    budget="3-5 triệu",
)


# ---------------------------------------------------------------------------
# Nội dung thông báo
# ---------------------------------------------------------------------------

def test_long_body_contains_lead_info():
    assert "Trần Thị B" in subject_for(PAYLOAD)
    body = long_body(PAYLOAD)
    for expected in ("Nguyễn Văn A", "0901234567", "Giảm cân", "Phường Sài Gòn", "3-5 triệu"):
        assert expected in body
    assert "/dashboard/leads" in body


def test_body_handles_missing_optional_fields():
    sparse = LeadNotification(
        pt_name="PT", trainee_name="HV", trainee_phone="0900000000",
        goal=None, area=None, budget=None,
    )
    assert "—" in long_body(sparse)
    # Bản ngắn thì BỎ HẲN dòng trống thay vì in "Mục tiêu: —": tin nhắn đọc trên
    # điện thoại, mỗi dòng rác là một dòng che mất thông tin cần bấm.
    short = short_body(sparse)
    for label in ("Mục tiêu", "Khu vực", "Ngân sách"):
        assert label not in short
    # Nhưng phần bắt buộc thì luôn còn: tên và số để bấm gọi.
    assert "HV" in short and "0900000000" in short


def test_reminder_wording_differs_from_new_lead():
    reminder = LeadNotification(
        pt_name="PT", trainee_name="HV", trainee_phone="0900000000",
        goal=None, area=None, budget=None, is_reminder=True, hours_waiting=14,
    )
    assert "chưa xử lý" in subject_for(reminder)
    assert "14" in long_body(reminder)


# ---------------------------------------------------------------------------
# Từng kênh
# ---------------------------------------------------------------------------

def test_email_channel_skips_when_smtp_not_configured():
    with patch("app.services.mailer.settings") as s:
        s.smtp_host = ""
        result = EmailChannel().send_lead(Recipient(email="pt@example.com"), PAYLOAD)
    assert result.skipped is True and result.ok is False


def test_email_channel_skips_when_recipient_has_no_email():
    with patch("app.services.mailer.settings") as s:
        s.smtp_host = "smtp.example.com"
        result = EmailChannel().send_lead(Recipient(phone="0900000000"), PAYLOAD)
    assert result.skipped is True


def test_email_channel_swallows_smtp_errors():
    """Lỗi SMTP phải thành DeliveryResult thất bại, không phải exception."""
    with patch("app.services.mailer.settings") as s, patch(
        "app.services.mailer.smtplib.SMTP", side_effect=OSError("boom")
    ):
        s.smtp_host = "smtp.example.com"
        s.smtp_port = 587
        s.smtp_from = "a@b.c"
        s.smtp_use_tls = True
        s.smtp_use_ssl = False
        s.smtp_user = ""
        result = EmailChannel().send_lead(Recipient(email="pt@example.com"), PAYLOAD)
    assert result.ok is False and result.skipped is False
    assert "boom" in (result.detail or "")


def test_mailer_uses_implicit_ssl_when_configured():
    """Cổng 465 (TLS ngay từ đầu) không dùng starttls() — chọn nhầm lớp SMTP là
    treo rồi lỗi khó hiểu, trông y hệt sai mật khẩu."""
    from app.services.mailer import send_email

    with patch("app.services.mailer.settings") as s, patch(
        "app.services.mailer.smtplib.SMTP_SSL"
    ) as mock_ssl, patch("app.services.mailer.smtplib.SMTP") as mock_starttls:
        s.smtp_host = "smtp.example.com"
        s.smtp_port = 465
        s.smtp_from = "a@b.c"
        s.smtp_use_tls = True
        s.smtp_use_ssl = True
        s.smtp_user = ""
        result = send_email("pt@example.com", "subj", "body")

    assert result.ok is True
    mock_ssl.assert_called_once()
    mock_starttls.assert_not_called()
    # smtp_use_ssl=True nghĩa là KHÔNG gọi starttls() — TLS đã có ngay từ kết nối.
    assert mock_ssl.return_value.__enter__.return_value.starttls.called is False


def test_mailer_uses_starttls_when_not_ssl():
    from app.services.mailer import send_email

    with patch("app.services.mailer.settings") as s, patch(
        "app.services.mailer.smtplib.SMTP"
    ) as mock_starttls, patch("app.services.mailer.smtplib.SMTP_SSL") as mock_ssl:
        s.smtp_host = "smtp.example.com"
        s.smtp_port = 587
        s.smtp_from = "a@b.c"
        s.smtp_use_tls = True
        s.smtp_use_ssl = False
        s.smtp_user = ""
        result = send_email("pt@example.com", "subj", "body")

    assert result.ok is True
    mock_starttls.assert_called_once()
    mock_ssl.assert_not_called()
    assert mock_starttls.return_value.__enter__.return_value.starttls.called is True


def test_zalo_oa_skips_when_pt_has_not_followed_oa():
    """Thiếu zalo_user_id là 'bỏ qua', không phải lỗi — để rơi xuống kênh sau."""
    with patch("app.services.channels.zalo.settings") as s:
        s.zalo_oa_access_token = "token"
        result = ZaloOAChannel().send_lead(Recipient(phone="0900000000"), PAYLOAD)
    assert result.skipped is True


def test_zns_normalises_phone_to_84_format():
    assert ZnsChannel._to_zns_phone("0912345678") == "84912345678"
    assert ZnsChannel._to_zns_phone("+84912345678") == "84912345678"
    assert ZnsChannel._to_zns_phone("84912345678") == "84912345678"
    assert ZnsChannel._to_zns_phone("khong-phai-so") is None


# ---------------------------------------------------------------------------
# Chuỗi kênh
# ---------------------------------------------------------------------------

class _Stub:
    def __init__(self, name, ok=False, skipped=False, raises=False):
        self.name = name
        self._ok, self._skipped, self._raises = ok, skipped, raises
        self.called = False

    def is_configured(self):
        return True

    def send_lead(self, recipient, payload):
        self.called = True
        if self._raises:
            raise RuntimeError("kênh hỏng")
        return DeliveryResult(self.name, ok=self._ok, skipped=self._skipped)


def _with_chain(*stubs):
    """Thay sổ đăng ký kênh bằng các stub, theo đúng thứ tự truyền vào."""
    return patch(
        "app.services.channels.configured_channels", return_value=list(stubs)
    )


def test_chain_stops_at_first_success():
    """Không gửi trùng: PT nhận cùng một lead qua ba kênh sẽ tắt hết thông báo."""
    first, second = _Stub("a", ok=True), _Stub("b", ok=True)
    with _with_chain(first, second):
        results = send_lead_notification(Recipient(), PAYLOAD)
    assert [r.channel for r in results] == ["a"]
    assert second.called is False


def test_chain_falls_through_skipped_and_failed():
    skipped, failed, ok = _Stub("a", skipped=True), _Stub("b"), _Stub("c", ok=True)
    with _with_chain(skipped, failed, ok):
        results = send_lead_notification(Recipient(), PAYLOAD)
    assert [r.channel for r in results] == ["a", "b", "c"]
    assert results[-1].ok is True


def test_a_raising_channel_does_not_break_the_chain():
    """Kênh ném lỗi phải bị nuốt và vẫn thử kênh kế tiếp."""
    boom, fallback = _Stub("boom", raises=True), _Stub("fallback", ok=True)
    with _with_chain(boom, fallback):
        results = send_lead_notification(Recipient(), PAYLOAD)
    assert results[0].ok is False and "kênh hỏng" in (results[0].detail or "")
    assert fallback.called is True and results[-1].ok is True


def test_all_channels_failing_returns_every_attempt():
    """Không kênh nào gửi được thì vẫn phải ghi lại từng lần thử, để còn lần ra."""
    with _with_chain(_Stub("a"), _Stub("b", skipped=True)):
        results = send_lead_notification(Recipient(), PAYLOAD)
    assert len(results) == 2 and not any(r.ok for r in results)


async def test_notify_new_lead_never_raises():
    """Bất biến quan trọng nhất của module này."""
    import uuid

    from app.services.notify import notify_new_lead

    with patch(
        "app.services.notify.send_lead_notification", side_effect=Exception("boom")
    ):
        delivered = await notify_new_lead(
            lead_id=uuid.uuid4(),
            pt_name="PT",
            trainee_name="HV",
            trainee_phone="0900000000",
            goal=None,
            area=None,
            budget=None,
            pt_email="pt@example.com",
        )
    # `lead_reminders` dựa vào giá trị này để biết có nên tiêu lượt nhắc
    # một-lần-duy-nhất hay không — một exception phải đọc ra là "chưa gửi".
    assert delivered is False


async def test_notify_new_lead_returns_true_only_when_a_channel_succeeds():
    import uuid

    from app.services.notify import notify_new_lead

    with _with_chain(_Stub("a", ok=True)):
        delivered = await notify_new_lead(
            lead_id=uuid.uuid4(),
            pt_name="PT",
            trainee_name="HV",
            trainee_phone="0900000000",
            goal=None,
            area=None,
            budget=None,
            pt_email="pt@example.com",
        )
    assert delivered is True

    with _with_chain(_Stub("a", skipped=True), _Stub("b")):
        delivered = await notify_new_lead(
            lead_id=uuid.uuid4(),
            pt_name="PT",
            trainee_name="HV",
            trainee_phone="0900000000",
            goal=None,
            area=None,
            budget=None,
            pt_email="pt@example.com",
        )
    assert delivered is False


def test_email_channel_skips_placeholder_address():
    """Tài khoản đăng nhập bằng Zalo mang email tự sinh trên domain không tồn tại.

    Phải báo "bỏ qua", không phải "đã gửi": nếu ghi là đã gửi thì sổ
    notification_deliveries nói PT đã được báo, trong khi thư bay vào hư không
    và họ không hề biết có lead nào.
    """
    with patch("app.services.mailer.settings") as s:
        s.smtp_host = "smtp.example.com"
        result = EmailChannel().send_lead(
            Recipient(email="zalo.123456@oauth.ptmatch.vn"), PAYLOAD
        )
    assert result.skipped is True
    assert result.ok is False
