"""Password hashing and JWT helpers."""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import jwt
from passlib.context import CryptContext

from app.core.config import settings

ALGORITHM = "HS256"

# Dung sai đồng hồ khi kiểm tra iat/nbf/exp.
#
# Không có dung sai, chỉ cần đồng hồ lệch một chút là token vừa phát hành đã bị
# từ chối với ImmatureSignatureError ("not yet valid (iat)") và người dùng bị
# đá ra ngoài — lỗi rất khó lần vì thông báo trông như token hết hạn. Đồng hồ
# lệch là chuyện có thật: máy ảo bị resync (WSL2, VM sau khi sleep), hoặc sau
# này chạy nhiều instance backend có NTP lệch nhau.
#
# 30 giây đủ để hấp thụ sai lệch thực tế mà không nới hạn access token
# (mặc định 30 phút) một cách đáng kể.
CLOCK_SKEW_LEEWAY = timedelta(seconds=30)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(plain, hashed)
    except ValueError:
        return False


def _create_token(
    subject: str,
    token_type: str,
    expires_delta: timedelta,
    extra: Optional[Dict[str, Any]] = None,
) -> str:
    now = datetime.now(timezone.utc)
    payload: Dict[str, Any] = {
        "sub": str(subject),
        "type": token_type,
        # Epoch float, KHÔNG datetime: PyJWT làm tròn datetime -> int giây khi
        # tự chuyển NumericDate, mất phần dưới giây. `iat` cần độ chính xác đó
        # để so sánh với `User.credentials_changed_at` (deps.py) không rơi vào
        # cùng-một-giây với lúc reset mật khẩu và bị coi nhầm là còn hợp lệ.
        "iat": now.timestamp(),
        "exp": (now + expires_delta).timestamp(),
        "jti": uuid.uuid4().hex,
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def create_access_token(user_id: str, role: str) -> str:
    return _create_token(
        user_id,
        "access",
        timedelta(minutes=settings.access_token_expire_minutes),
        {"role": role},
    )


def create_refresh_token(user_id: str, role: str) -> str:
    return _create_token(
        user_id,
        "refresh",
        timedelta(days=settings.refresh_token_expire_days),
        {"role": role},
    )


def decode_token(token: str, expected_type: str = "access") -> Dict[str, Any]:
    """Decode + validate a JWT. Raises jwt.InvalidTokenError on any problem."""
    payload = jwt.decode(
        token,
        settings.secret_key,
        algorithms=[ALGORITHM],
        leeway=CLOCK_SKEW_LEEWAY,
    )
    if payload.get("type") != expected_type:
        raise jwt.InvalidTokenError(
            "Invalid token type: expected %s" % expected_type
        )
    if not payload.get("sub"):
        raise jwt.InvalidTokenError("Missing subject")
    return payload
