"""Shared FastAPI dependencies (auth)."""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token
from app.models import PTProfile, User, UserRole

bearer_scheme = HTTPBearer(auto_error=False)

# Chỉ ghi lại "hoạt động lần cuối" khi mốc cũ đã quá hạn này. Hồ sơ công khai
# chỉ hiển thị ở mức ngày ("hoạt động 2 ngày trước"), nên ghi dày hơn không
# thêm thông tin gì mà lại tốn một UPDATE cho mỗi request của dashboard.
ACTIVITY_REFRESH_INTERVAL = timedelta(hours=1)


def _credentials_error(detail: str = "Not authenticated") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def token_predates_credentials_change(user: User, payload: dict) -> bool:
    """True if this token was minted BEFORE the account's last password/email
    change — i.e. it must be treated as revoked.

    Không cần tra Redis: cả `get_current_user` và `/auth/refresh` đã tải `User`
    từ DB cho mỗi request, nên đây chỉ là một so sánh trên dữ liệu đã có sẵn.
    `credentials_changed_at is None` (chưa từng đổi) nghĩa là không hạn chế gì.
    """
    if user.credentials_changed_at is None:
        return False
    iat = payload.get("iat")
    if iat is None:
        return True
    return float(iat) < user.credentials_changed_at.timestamp()


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:
        raise _credentials_error()
    try:
        payload = decode_token(credentials.credentials, expected_type="access")
        user_id = uuid.UUID(payload["sub"])
    except (jwt.InvalidTokenError, ValueError):
        raise _credentials_error("Invalid or expired token")
    user = await db.get(User, user_id)
    if user is None:
        raise _credentials_error("User not found")
    if token_predates_credentials_change(user, payload):
        raise _credentials_error("Invalid or expired token")
    # Ban và xoá đều đẩy credentials_changed_at lên, nên dòng trên đã chặn được
    # token cũ. Kiểm thêm ở đây vì đó là suy luận bắc cầu qua một cột khác: nếu
    # sau này có đường nào đặt banned_at mà quên mốc thu hồi, chỗ này vẫn đúng.
    if user.banned_at is not None or user.deleted_at is not None:
        raise _credentials_error("Tài khoản không còn hiệu lực")
    return user


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """Resolve the current user if a valid token is present, else None.

    Used by endpoints that work anonymously but enrich behaviour when the
    caller is logged in (e.g. attaching trainee_id to a lead/review).
    """
    if credentials is None:
        return None
    try:
        payload = decode_token(credentials.credentials, expected_type="access")
        user_id = uuid.UUID(payload["sub"])
    except (jwt.InvalidTokenError, ValueError):
        return None
    user = await db.get(User, user_id)
    if user is None:
        return None
    if token_predates_credentials_change(user, payload):
        return None
    # Cùng lý do như get_current_user. Ở đây trả None thay vì lỗi: endpoint dùng
    # dependency này vốn chạy được khi vô danh, nên tài khoản bị khoá được đối xử
    # như khách — không phải lỗi, chỉ là không còn được gắn danh tính.
    if user.banned_at is not None or user.deleted_at is not None:
        return None
    return user


async def get_current_pt_user(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.pt:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="PT role required",
        )
    return user


async def get_current_admin(user: User = Depends(get_current_user)) -> User:
    """Chỉ dành cho số liệu vận hành — không phải thứ PT hay học viên được xem."""
    if user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )
    return user


async def touch_last_active(db: AsyncSession, profile: PTProfile) -> None:
    """Ghi nhận PT vừa hoạt động, tối đa mỗi ACTIVITY_REFRESH_INTERVAL một lần."""
    now = datetime.now(timezone.utc)
    if (
        profile.last_active_at is not None
        and now - profile.last_active_at < ACTIVITY_REFRESH_INTERVAL
    ):
        return
    await db.execute(
        update(PTProfile)
        .where(PTProfile.id == profile.id)
        # updated_at giữ nguyên: PT đăng nhập vào dashboard không phải là sửa hồ
        # sơ, và cột đó là <lastmod> của sitemap. Xem ghi chú ở pts.py.
        .values(last_active_at=now, updated_at=PTProfile.updated_at)
    )
    await db.commit()
    profile.last_active_at = now


async def get_current_pt_profile(
    user: User = Depends(get_current_pt_user),
    db: AsyncSession = Depends(get_db),
) -> PTProfile:
    profile = await db.scalar(select(PTProfile).where(PTProfile.user_id == user.id))
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PT profile not found",
        )
    await touch_last_active(db, profile)
    return profile
