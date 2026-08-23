"""Giao diện chung cho các kênh gửi thông báo.

Vì sao có lớp này thay vì gọi thẳng Zalo: ở giai đoạn kiểm chứng, câu hỏi chưa
trả lời được là "kênh nào khiến PT phản hồi nhanh hơn". Đóng cứng một kênh vào
luồng lead nghĩa là muốn đổi phải sửa đúng chỗ nghiệp vụ, và không so sánh được
gì. Tách ra thì bật/tắt kênh chỉ là biến môi trường, và mỗi lần gửi được ghi
lại kèm tên kênh — nối với `Lead.first_response_at` là ra ngay kênh nào hiệu quả.
"""
from dataclasses import dataclass
from typing import Optional, Protocol


@dataclass(frozen=True)
class LeadNotification:
    """Nội dung một thông báo lead, chưa gắn với kênh nào.

    Kênh tự quyết định trình bày ra sao: email có tiêu đề và thân dài, Zalo chỉ
    vài dòng ngắn, ZNS thì nhét vào tham số template.
    """

    pt_name: str
    trainee_name: str
    trainee_phone: str
    goal: Optional[str]
    area: Optional[str]
    budget: Optional[str]
    # Nhắc lại lead cũ chưa xử lý, khác với báo lead mới.
    is_reminder: bool = False
    hours_waiting: Optional[int] = None
    # Lead sinh ra do chính PT bấm "nhận" trên bảng yêu cầu. Người nhận đã biết
    # mình vừa làm gì, nên nội dung phải là bản ghi thông tin liên hệ để gọi
    # ngay từ điện thoại, không phải lời báo tin.
    is_claim: bool = False


@dataclass(frozen=True)
class Recipient:
    """Địa chỉ nhận, mỗi kênh dùng trường tương ứng của mình."""

    email: Optional[str] = None
    phone: Optional[str] = None
    zalo_user_id: Optional[str] = None


@dataclass(frozen=True)
class DeliveryResult:
    channel: str
    ok: bool
    # Vì sao thất bại, hoặc vì sao bỏ qua (chưa cấu hình, thiếu địa chỉ).
    detail: Optional[str] = None
    # True khi kênh không áp dụng được cho người nhận này (thiếu zalo_user_id,
    # chưa cấu hình). Khác hẳn "đã thử và hỏng" — bỏ qua thì thử kênh kế tiếp là
    # bình thường, còn hỏng thì đáng để ý.
    skipped: bool = False


class Channel(Protocol):
    """Một kênh gửi. Đồng bộ: chạy trong threadpool qua BackgroundTask."""

    name: str

    def is_configured(self) -> bool:
        """Kênh đã đủ cấu hình để dùng chưa (khoá API, host SMTP...)."""
        ...

    def send_lead(self, recipient: Recipient, payload: LeadNotification) -> DeliveryResult:
        """Gửi. KHÔNG được ném lỗi — mọi thất bại phải trả về DeliveryResult."""
        ...
