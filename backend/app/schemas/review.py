import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import validate_public_url


class ReviewCreate(BaseModel):
    reviewer_name: str = Field(min_length=2, max_length=100)
    reviewer_phone: Optional[str] = Field(default=None, min_length=8, max_length=20)
    rating: int = Field(ge=1, le=5)
    content: Optional[str] = Field(default=None, max_length=5000)
    images: List[str] = Field(default_factory=list, max_length=10)

    @field_validator("images")
    @classmethod
    def validate_images(cls, v: List[str]) -> List[str]:
        # Ảnh đánh giá được render thành <img src> trên hồ sơ công khai. Trước
        # đây trường này nhận chuỗi bất kỳ, độ dài bất kỳ — đủ để nhét
        # "javascript:..." hoặc một chuỗi vài megabyte vào JSONB.
        return [url for url in (validate_public_url(u, field="Ảnh") for u in v) if url]


class ReviewOut(BaseModel):
    """Public review representation — reviewer_phone is intentionally hidden."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    reviewer_name: str
    rating: int
    content: Optional[str] = None
    images: List[str] = []
    reply_content: Optional[str] = None
    replied_at: Optional[datetime] = None
    created_at: datetime
    # NULL = đang chờ duyệt. Trong danh sách công khai trường này luôn có giá
    # trị; nó có ích ở phản hồi của POST, để client báo "chờ duyệt" thay vì để
    # người gửi đi tìm đánh giá vừa viết trên hồ sơ và không thấy đâu.
    approved_at: Optional[datetime] = None


class ReviewListResponse(BaseModel):
    items: List[ReviewOut]
    total: int
    page: int
    page_size: int


class ReviewReplyRequest(BaseModel):
    content: str = Field(min_length=1, max_length=5000)


class ReviewUpdate(BaseModel):
    rating: Optional[int] = Field(default=None, ge=1, le=5)
    content: Optional[str] = Field(default=None, max_length=5000)
    images: Optional[List[str]] = Field(default=None, max_length=10)

    @field_validator("images")
    @classmethod
    def validate_images(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is None:
            return v
        return [url for url in (validate_public_url(u, field="Ảnh") for u in v) if url]


class MyReviewOut(BaseModel):
    """A review from the author's perspective — includes which PT it's about."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    pt_name: str
    pt_slug: str
    pt_avatar_url: Optional[str] = None
    rating: int
    content: Optional[str] = None
    images: List[str] = []
    reply_content: Optional[str] = None
    replied_at: Optional[datetime] = None
    created_at: datetime
    # Để tác giả biết đánh giá của mình đang chờ duyệt, thay vì tưởng bị mất.
    approved_at: Optional[datetime] = None
