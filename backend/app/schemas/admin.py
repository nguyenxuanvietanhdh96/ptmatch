import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class ChannelStat(BaseModel):
    """Kết quả gửi của một kênh thông báo.

    `skipped` không phải lỗi — là kênh chưa cấu hình hoặc người nhận không có
    địa chỉ tương ứng (PT chưa quan tâm OA chẳng hạn). Tách khỏi `failed` để
    phân biệt "chưa bật" với "bật rồi mà hỏng"; gộp lại thì không biết nên đi
    cấu hình hay đi sửa lỗi.
    """

    channel: str
    sent: int
    failed: int
    skipped: int


class PTResponsiveness(BaseModel):
    """Một PT phản hồi lead ra sao.

    `disputed` = số lead mà học viên bấm "PT chưa liên hệ". Đây là con số đáng
    tin hơn `answered`, vì `answered` suy ra từ việc PT tự chuyển trạng thái —
    PT chuyển cột mà không gọi thì vẫn tính là đã phản hồi.
    """

    slug: str
    full_name: str
    leads: int
    answered: int
    disputed: int
    avg_response_hours: Optional[float] = None


class LeadOpsOverview(BaseModel):
    """Tình trạng đường ống lead trong `days` ngày gần nhất."""

    days: int
    leads_total: int
    leads_answered: int
    # Còn nằm im ở 'new' — chưa PT nào đụng tới.
    leads_still_new: int
    # Học viên bấm "PT chưa liên hệ".
    leads_disputed: int
    # Đã được job nhắc lại ít nhất một lần.
    leads_reminded: int
    # Trung vị, không phải trung bình — xem ghi chú ở api/admin.py.
    median_response_hours: Optional[float] = None
    channels: List[ChannelStat] = []
    pts: List[PTResponsiveness] = []


# ---------------------------------------------------------------------------
# Tổng quan mức độ sử dụng
# ---------------------------------------------------------------------------

class FeatureUse(BaseModel):
    """Một tính năng và mức độ được dùng thật.

    `people` quan trọng hơn `events`: 40 lượt gửi lead từ 2 người là tín hiệu
    khác hẳn 40 lượt từ 35 người. Ở giai đoạn kiểm chứng, số NGƯỜI mới trả lời
    được câu "có ai cần cái này không".

    `people` là None với những tính năng không đếm được người (lượt xem hồ sơ
    không gắn danh tính) — để None thay vì 0 vì "không đo được" khác "không ai dùng".
    """

    key: str
    label: str
    people: Optional[int] = None
    events: int


class DemandSignal(BaseModel):
    """Nhu cầu tập trung ở đâu — dùng để quyết định nên seed cung ở quận nào."""

    label: str
    count: int


class AdminOverview(BaseModel):
    days: int

    # Người dùng
    users_total: int
    users_pt: int
    users_trainee: int
    users_new: int

    # Hồ sơ PT — bao nhiêu cái thật sự dùng được, không chỉ tồn tại
    pt_profiles: int
    pt_active: int
    pt_with_pricing: int
    pt_with_location: int
    pt_with_portfolio: int
    pt_with_review: int
    pt_receiving_leads: int

    features: List[FeatureUse] = []
    top_specialties: List[DemandSignal] = []
    top_areas: List[DemandSignal] = []

    feedback_pending: int = 0


# ---------------------------------------------------------------------------
# Hộp thư góp ý
# ---------------------------------------------------------------------------

class FeedbackItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    category: str
    message: str
    contact_email: Optional[str] = None
    # Email tài khoản nếu người góp ý đang đăng nhập; None nếu gửi ẩn danh.
    user_email: Optional[str] = None
    created_at: datetime
    handled_at: Optional[datetime] = None


class FeedbackListOut(BaseModel):
    items: List[FeedbackItem]
    total: int
    page: int
    page_size: int
    pending: int


# ---------------------------------------------------------------------------
# Kiểm duyệt đánh giá
# ---------------------------------------------------------------------------

class AdminReviewItem(BaseModel):
    """Một đánh giá dưới góc nhìn kiểm duyệt.

    Có `pt_name`/`pt_slug` vì admin duyệt xuyên PT, không phải xem hồ sơ một
    người. `is_anonymous` hiện rõ vì đó là nhóm đáng để ý: viết được mà không
    cần tài khoản, và chỉ tốn một số điện thoại gõ vào ô.
    """

    id: uuid.UUID
    pt_name: str
    pt_slug: str
    # Hồ sơ PT này đang bị đình chỉ hay không. Có ở đây để giao diện kiểm duyệt
    # không mời admin "đình chỉ" một hồ sơ đã bị đình chỉ rồi.
    pt_suspended: bool = False
    reviewer_name: str
    # SĐT người viết — admin cần để nhận ra một người spam nhiều PT bằng nhiều số.
    reviewer_phone: Optional[str] = None
    rating: int
    content: Optional[str] = None
    image_count: int = 0
    is_anonymous: bool
    has_reply: bool
    created_at: datetime
    # NULL = chờ duyệt, chưa hiện trên hồ sơ công khai và chưa tính vào điểm.
    approved_at: Optional[datetime] = None


class AdminReviewModerate(BaseModel):
    """Duyệt (True) hoặc gỡ duyệt (False) một đánh giá.

    Gỡ duyệt chứ không xoá: đánh giá đáng ngờ nhưng chưa chắc giả thì ẩn đi vẫn
    lần lại được, còn xoá cứng thì mất luôn bằng chứng. Xoá vẫn còn ở
    DELETE /api/reviews/{id} cho trường hợp rác rõ ràng.
    """

    approved: bool


class AdminReviewList(BaseModel):
    items: List[AdminReviewItem]
    total: int
    page: int
    page_size: int

class PTSuspendRequest(BaseModel):
    """Đình chỉ hoặc bỏ đình chỉ một hồ sơ PT.

    `reason` bắt buộc khi đình chỉ: một hồ sơ biến mất khỏi kết quả tìm kiếm mà
    không ai ghi lại vì sao sẽ tốn hàng giờ dò tìm vài tháng sau, và PT hỏi thì
    không ai trả lời được.
    """

    suspended: bool
    reason: Optional[str] = Field(default=None, min_length=3, max_length=500)


class PTSuspendResult(BaseModel):
    slug: str
    full_name: Optional[str] = None
    suspended: bool
    suspended_at: Optional[datetime] = None
    suspended_reason: Optional[str] = None
