"""Schema cho bảng "Học viên cần PT".

Nguyên tắc xuyên suốt file này: `trainee_phone` **không bao giờ** nằm trong
model trả ra công khai. PT chỉ có số sau khi nhận yêu cầu, và lúc đó số nằm
trong Lead của riêng họ (chịu cả MASK_LEAD_PHONE nếu bật).
"""
import re
import uuid
from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.pt_profile import SPECIALTY_SLUGS
from app.services.coverage import canonicalize_province

GenderLiteral = Literal["male", "female", "other"]
RequestStatusLiteral = Literal["open", "closed"]

_VN_PHONE_RE = re.compile(r"^(0|\+84)\d{9,10}$")


class TraineeRequestCreate(BaseModel):
    trainee_name: str = Field(min_length=2, max_length=100)
    trainee_phone: str = Field(min_length=10, max_length=15)
    # Kín như trainee_phone — cố tình vắng mặt trong mọi model trả ra công khai.
    contact_other: Optional[str] = Field(default=None, max_length=200)
    specialty: Optional[str] = Field(default=None, max_length=50)
    city: Optional[str] = Field(default=None, max_length=100)
    ward: Optional[str] = Field(default=None, max_length=100)
    budget_min: Optional[int] = Field(default=None, ge=0, le=100_000_000)
    budget_max: Optional[int] = Field(default=None, ge=0, le=100_000_000)
    preferred_gender: Optional[GenderLiteral] = None
    note: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("trainee_name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Vui lòng nhập họ tên (ít nhất 2 ký tự)")
        return v

    @field_validator("trainee_phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        v = re.sub(r"[\s.\-]", "", v.strip())
        if not _VN_PHONE_RE.match(v):
            raise ValueError("Số điện thoại không hợp lệ (VD: 0912345678)")
        return v

    @field_validator("contact_other")
    @classmethod
    def validate_contact_other(cls, v: Optional[str]) -> Optional[str]:
        v = (v or "").strip()
        return v or None

    @field_validator("specialty")
    @classmethod
    def validate_specialty(cls, v: Optional[str]) -> Optional[str]:
        if v and v not in SPECIALTY_SLUGS:
            raise ValueError("Mục tiêu tập luyện không hợp lệ")
        return v

    @field_validator("city")
    @classmethod
    def validate_city_is_served(cls, v: Optional[str]) -> Optional[str]:
        """Chỉ nhận tỉnh đang mở, và lưu lại đúng dạng chuẩn của danh mục."""
        return canonicalize_province(v)

    @field_validator("budget_max")
    @classmethod
    def validate_budget_range(cls, v: Optional[int], info) -> Optional[int]:
        budget_min = info.data.get("budget_min")
        if v is not None and budget_min is not None and v < budget_min:
            raise ValueError("Ngân sách tối đa phải lớn hơn hoặc bằng tối thiểu")
        return v


class TraineeRequestOut(BaseModel):
    """Bản công khai hiển thị trên bảng — cố tình không có trainee_phone.

    `trainee_name` chỉ để PT xưng hô cho tự nhiên khi gọi; nếu sau này thấy vẫn
    quá lộ, có thể rút gọn còn tên riêng.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    trainee_name: str
    specialty: Optional[str] = None
    city: Optional[str] = None
    ward: Optional[str] = None
    budget_min: Optional[int] = None
    budget_max: Optional[int] = None
    preferred_gender: Optional[GenderLiteral] = None
    note: Optional[str] = None
    status: RequestStatusLiteral
    claim_count: int = 0
    expires_at: datetime
    created_at: datetime
    # Chỉ có giá trị khi người gọi là PT đã đăng nhập: PT này đã nhận chưa.
    claimed_by_me: Optional[bool] = None


class TraineeRequestListResponse(BaseModel):
    items: List[TraineeRequestOut]
    total: int
    page: int
    page_size: int


class RequestClaimOut(BaseModel):
    """Kết quả sau khi PT nhận yêu cầu."""

    request_id: uuid.UUID
    # Lead vừa tạo trong dashboard của PT — chứa số điện thoại.
    lead_id: uuid.UUID
    # Tổng số PT đã nhận, tính cả lần này. Không còn khái niệm "suất".
    claim_count: int


class RequestCloseIn(BaseModel):
    """Lý do bắt buộc: đóng mà không biết vì sao thì mất luôn số liệu duy nhất
    chứng minh chợ có chạy hay không."""

    reason: Literal["found_pt", "no_longer_needed"]


class RequestFunnelOut(BaseModel):
    """Số liệu vận hành của chợ ngược — chỉ admin xem.

    Đọc theo thứ tự từ trên xuống, mỗi bước là tập con của bước trước. Chỗ tụt
    mạnh nhất chính là việc cần làm tiếp:

    - posted → claimed tụt: thiếu PT, hoặc bảng không ai vào xem.
    - claimed → contacted tụt: PT lấy số rồi không gọi.
    - contacted → won tụt: PT gọi nhưng không chốt được — vấn đề nằm ở chất
      lượng ghép đôi (giá, khu vực, khung giờ), không phải ở lưu lượng.

    Đây cũng là chỗ duy nhất biết được có nên giới hạn số PT nhận một yêu cầu
    hay không. Trần suất đã bỏ vì nó chặn theo số lần bấm nhận, trong khi thứ
    đáng lo là số cuộc gọi thật. Chỉ mở lại khi claims_total chia
    requests_claimed cho thấy học viên đang bị gọi quá nhiều.
    """

    # None = toàn thời gian.
    window_days: Optional[int] = None
    requests_posted: int
    requests_claimed: int
    requests_contacted: int
    requests_won: int
    # Hết hạn mà không PT nào nhận. Lớn = thiếu cung, không phải thiếu cầu.
    requests_expired_unclaimed: int
    # Tổng số lần nhận, để thấy trung bình mỗi yêu cầu hút được mấy PT.
    claims_total: int
    # Do chính học viên bấm. Tin được hơn requests_won, vốn dựa vào trạng thái
    # lead mà PT tự khai — PT quên chuyển cột thì requests_won = 0 dù đã có
    # người tập. Đây là con số để đối chiếu với tiêu chí dừng.
    closed_found_pt: int
    # Nhiều thì phải hỏi tại sao: chờ lâu, PT gọi không hợp, hay tự tìm được ở
    # nơi khác. Ba nguyên nhân đó dẫn tới ba việc làm khác nhau.
    closed_no_longer_needed: int


class ClaimingPT(BaseModel):
    """PT đã nhận yêu cầu, hiển thị cho chính học viên đã đăng."""

    slug: str
    full_name: str
    avatar_url: Optional[str] = None
    avg_rating: float = 0
    review_count: int = 0
    claimed_at: datetime


class MyTraineeRequestOut(TraineeRequestOut):
    """Yêu cầu dưới góc nhìn của học viên đã đăng nó."""

    claimed_by: List[ClaimingPT] = []
    # Cố ý không có trong TraineeRequestOut: PT trên bảng không cần biết vì sao
    # một yêu cầu đã đóng.
    close_reason: Optional[str] = None
