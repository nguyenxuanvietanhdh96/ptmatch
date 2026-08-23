import uuid
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    phone: Optional[str] = Field(default=None, min_length=8, max_length=20)
    password: str = Field(min_length=8, max_length=128)
    role: Literal["pt", "trainee"]
    full_name: str = Field(min_length=2, max_length=100)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str


class OAuthExchangeRequest(BaseModel):
    """Mã một lần nhận từ redirect OAuth, đổi lấy cặp token thật."""

    code: str = Field(min_length=16, max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    role: str
    full_name: Optional[str] = None
    phone: Optional[str] = None
    # True khi `email` chỉ là địa chỉ tự sinh cho tài khoản mạng xã hội, tức là
    # KHÔNG gửi thư tới được (xem services/identity.py). Frontend hỏi email thật
    # dựa vào cờ này thay vì tự đoán theo tên miền — luật nằm ở backend.
    needs_email: bool = False


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


class OAuthTokenResponse(TokenResponse):
    """Kết quả đổi mã OAuth.

    Khác `TokenResponse` đúng một trường: `is_new` cho biết lượt đăng nhập này
    vừa TẠO tài khoản chứ không phải đăng nhập lại. Frontend cần nó để hỏi lại
    vai trò — vai trò chỉ được ghi một lần duy nhất lúc tạo user, và người bấm
    "Đăng nhập với Google" ở trang /login thì không hề chọn vai trò nào.
    """

    is_new: bool = False


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=16, max_length=128)
    password: str = Field(min_length=8, max_length=128)


class BecomePTRequest(BaseModel):
    """Chuyển tài khoản học viên sang PT.

    `full_name` tuỳ chọn: dùng khi tên trên tài khoản OAuth khác tên PT muốn
    hiển thị trên hồ sơ.
    """

    full_name: Optional[str] = Field(default=None, min_length=2, max_length=100)


class SetEmailRequest(BaseModel):
    """Bổ sung email thật cho tài khoản đăng nhập bằng mạng xã hội."""

    email: EmailStr
