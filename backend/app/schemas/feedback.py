import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field

FeedbackCategoryLiteral = Literal["feature", "bug", "ui", "other"]


class FeedbackCreate(BaseModel):
    category: FeedbackCategoryLiteral
    message: str = Field(min_length=10, max_length=5000)
    # EmailStr chứ không phải str: đây là địa chỉ để liên hệ lại người góp ý,
    # nhận vào một chuỗi bất kỳ nghĩa là mãi sau mới phát hiện không hồi âm được.
    contact_email: Optional[EmailStr] = Field(default=None, max_length=200)


class FeedbackOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    category: FeedbackCategoryLiteral
    message: str
    contact_email: Optional[str] = None
    created_at: datetime
