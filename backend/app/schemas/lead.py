import re
import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

LeadStatusLiteral = Literal["new", "contacted", "closed", "lost"]

_VN_PHONE_RE = re.compile(r"^(0|\+84)\d{9,10}$")


class LeadCreate(BaseModel):
    pt_slug: str = Field(min_length=1, max_length=150)
    trainee_name: str = Field(min_length=2, max_length=100)
    trainee_phone: str = Field(min_length=10, max_length=15)
    goal: Optional[str] = Field(default=None, max_length=2000)
    area: Optional[str] = Field(default=None, max_length=200)
    budget: Optional[str] = Field(default=None, max_length=100)

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


class LeadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    pt_profile_id: uuid.UUID
    trainee_name: str
    trainee_phone: str
    goal: Optional[str] = None
    area: Optional[str] = None
    budget: Optional[str] = None
    status: LeadStatusLiteral
    created_at: datetime


class LeadStatusUpdate(BaseModel):
    status: LeadStatusLiteral


class MyLeadOut(BaseModel):
    """A lead from the trainee's perspective — includes which PT it was sent to."""

    id: uuid.UUID
    pt_name: str
    pt_slug: str
    pt_avatar_url: Optional[str] = None
    goal: Optional[str] = None
    area: Optional[str] = None
    budget: Optional[str] = None
    status: LeadStatusLiteral
    created_at: datetime


class LeadCreatedOut(LeadOut):
    """Phản hồi ngay sau khi tạo lead — bản DUY NHẤT có track_token.

    Mã tra cứu là thứ chứng minh quyền xem một lead, nên nó chỉ xuất hiện đúng
    một lần, cho đúng người vừa gửi. Mọi endpoint khác (danh sách của PT, danh
    sách của học viên) đều dùng LeadOut/MyLeadOut không có trường này.
    """

    track_token: Optional[str] = None


class LeadTrackOut(BaseModel):
    """Trang tra cứu công khai — chỉ đủ để người gửi biết chuyện gì đang xảy ra.

    KHÔNG trả trainee_phone: link tra cứu có thể bị chuyển tiếp hoặc lọt vào
    lịch sử trình duyệt máy chung, nên nó không được là đường để lấy lại SĐT.
    Người gửi vốn đã biết số của chính mình.
    """

    model_config = ConfigDict(from_attributes=True)

    pt_name: str
    pt_slug: str
    pt_avatar_url: Optional[str] = None
    trainee_name: str
    goal: Optional[str] = None
    area: Optional[str] = None
    budget: Optional[str] = None
    status: LeadStatusLiteral
    created_at: datetime
    # PT đã chuyển lead khỏi 'new' lúc nào — bằng chứng "đã có phản hồi".
    first_response_at: Optional[datetime] = None
    # Học viên đã tự báo "PT chưa liên hệ" hay chưa (để không cho báo hai lần).
    reported_no_contact: bool = False
