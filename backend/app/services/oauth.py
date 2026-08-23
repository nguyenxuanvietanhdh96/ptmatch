"""OAuth helpers — build authorization URLs, exchange codes, fetch user info."""
import base64
import hashlib
import secrets
import urllib.parse
from typing import Optional, TypedDict

import httpx

from app.core.config import settings
from app.services.identity import placeholder_email


class OAuthUserInfo(TypedDict):
    provider: str
    provider_id: str
    email: Optional[str]
    full_name: Optional[str]
    avatar_url: Optional[str]
    # Nhà cung cấp có KHẲNG ĐỊNH người này sở hữu địa chỉ email đó không.
    #
    # Quyết định việc đăng nhập OAuth có được phép gộp vào một tài khoản
    # email/mật khẩu sẵn có hay không. Nếu tin một email chưa xác minh, ai đăng
    # ký được ở phía nhà cung cấp bằng email của nạn nhân là chiếm luôn tài
    # khoản PTMatch của họ.
    email_verified: bool


def generate_pkce() -> tuple[str, str]:
    """Return (code_verifier, code_challenge) using S256 method."""
    code_verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip("=")
    digest = hashlib.sha256(code_verifier.encode()).digest()
    code_challenge = base64.urlsafe_b64encode(digest).decode().rstrip("=")
    return code_verifier, code_challenge


# ---------------------------------------------------------------------------
# Google
# ---------------------------------------------------------------------------

def build_google_auth_url(state: str) -> str:
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "offline",
        "prompt": "select_account",
    }
    return "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(params)


async def exchange_google_code(code: str) -> OAuthUserInfo:
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        token_resp.raise_for_status()
        access_token = token_resp.json()["access_token"]

        info_resp = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        info_resp.raise_for_status()
        info = info_resp.json()

    return OAuthUserInfo(
        provider="google",
        provider_id=info["sub"],
        email=info.get("email"),
        full_name=info.get("name"),
        avatar_url=info.get("picture"),
        # Google trả claim này trong userinfo; đọc thẳng thay vì cho rằng mọi
        # email Google đưa về đều đã xác minh.
        email_verified=bool(info.get("email_verified")),
    )


# ---------------------------------------------------------------------------
# Facebook
# ---------------------------------------------------------------------------

def build_facebook_auth_url(state: str) -> str:
    params = {
        "client_id": settings.facebook_client_id,
        "redirect_uri": settings.facebook_redirect_uri,
        "response_type": "code",
        "scope": "email,public_profile",
        "state": state,
    }
    return "https://www.facebook.com/v21.0/dialog/oauth?" + urllib.parse.urlencode(params)


async def exchange_facebook_code(code: str) -> OAuthUserInfo:
    async with httpx.AsyncClient() as client:
        token_resp = await client.get(
            "https://graph.facebook.com/v21.0/oauth/access_token",
            params={
                "code": code,
                "client_id": settings.facebook_client_id,
                "client_secret": settings.facebook_client_secret,
                "redirect_uri": settings.facebook_redirect_uri,
            },
        )
        token_resp.raise_for_status()
        access_token = token_resp.json()["access_token"]

        info_resp = await client.get(
            "https://graph.facebook.com/me",
            params={
                "fields": "id,name,email,picture.type(large)",
                "access_token": access_token,
            },
        )
        info_resp.raise_for_status()
        info = info_resp.json()

    avatar = None
    try:
        avatar = info["picture"]["data"]["url"]
    except (KeyError, TypeError):
        pass

    return OAuthUserInfo(
        provider="facebook",
        provider_id=info["id"],
        email=info.get("email"),
        full_name=info.get("name"),
        avatar_url=avatar,
        # Graph API không có trường nào cho biết email đã xác minh hay chưa, nên
        # coi như CHƯA. Hệ quả: đăng nhập Facebook không tự gộp vào tài khoản
        # mật khẩu trùng email — người dùng được nhắc đăng nhập bằng mật khẩu.
        email_verified=False,
    )


# ---------------------------------------------------------------------------
# Zalo
# ---------------------------------------------------------------------------

def build_zalo_auth_url(state: str, code_challenge: str) -> str:
    params = {
        "app_id": settings.zalo_app_id,
        "redirect_uri": settings.zalo_redirect_uri,
        "code_challenge": code_challenge,
        "state": state,
    }
    return "https://oauth.zaloapp.com/v4/permission?" + urllib.parse.urlencode(params)


async def exchange_zalo_code(code: str, code_verifier: str) -> OAuthUserInfo:
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            "https://oauth.zaloapp.com/v4/access_token",
            data={
                "app_id": settings.zalo_app_id,
                "app_secret": settings.zalo_app_secret,
                "code": code,
                "code_verifier": code_verifier,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        token_resp.raise_for_status()
        access_token = token_resp.json()["access_token"]

        info_resp = await client.get(
            "https://graph.zalo.me/v2.0/me",
            params={"fields": "id,name,picture"},
            headers={"access_token": access_token},
        )
        info_resp.raise_for_status()
        data = info_resp.json().get("data", info_resp.json())

    avatar = None
    try:
        avatar = data["picture"]["data"]["url"]
    except (KeyError, TypeError):
        pass

    zalo_id = str(data["id"])
    # Zalo không trả email; sinh địa chỉ tất định để users.email giữ được
    # NOT NULL/UNIQUE. Xem services/identity.py để biết hệ quả.
    fake_email = placeholder_email("zalo", zalo_id)

    return OAuthUserInfo(
        provider="zalo",
        provider_id=zalo_id,
        email=fake_email,
        full_name=data.get("name"),
        avatar_url=avatar,
        # Email là placeholder do ta tự sinh, không phải địa chỉ thật của ai —
        # không bao giờ được dùng nó để gộp tài khoản.
        email_verified=False,
    )
