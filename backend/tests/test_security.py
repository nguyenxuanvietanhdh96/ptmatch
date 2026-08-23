import uuid

import jwt
import pytest

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)


class TestPasswordHashing:
    def test_hash_and_verify(self):
        hashed = hash_password("password123")
        assert hashed != "password123"
        assert verify_password("password123", hashed)

    def test_verify_wrong_password(self):
        hashed = hash_password("password123")
        assert not verify_password("wrong-password", hashed)

    def test_hashes_are_salted(self):
        assert hash_password("password123") != hash_password("password123")

    def test_verify_garbage_hash_returns_false(self):
        assert not verify_password("password123", "not-a-bcrypt-hash")


class TestTokens:
    def setup_method(self):
        self.user_id = str(uuid.uuid4())

    def test_access_token_roundtrip(self):
        token = create_access_token(self.user_id, "pt")
        payload = decode_token(token, expected_type="access")
        assert payload["sub"] == self.user_id
        assert payload["role"] == "pt"
        assert payload["type"] == "access"
        assert payload["exp"] > payload["iat"]

    def test_refresh_token_roundtrip(self):
        token = create_refresh_token(self.user_id, "trainee")
        payload = decode_token(token, expected_type="refresh")
        assert payload["sub"] == self.user_id
        assert payload["type"] == "refresh"

    def test_access_token_rejected_as_refresh(self):
        token = create_access_token(self.user_id, "pt")
        with pytest.raises(jwt.InvalidTokenError):
            decode_token(token, expected_type="refresh")

    def test_refresh_token_rejected_as_access(self):
        token = create_refresh_token(self.user_id, "pt")
        with pytest.raises(jwt.InvalidTokenError):
            decode_token(token, expected_type="access")

    def test_tampered_token_rejected(self):
        token = create_access_token(self.user_id, "pt")
        with pytest.raises(jwt.InvalidTokenError):
            decode_token(token[:-3] + "abc")

    def test_token_with_wrong_secret_rejected(self):
        forged = jwt.encode(
            {"sub": self.user_id, "type": "access"},
            "another-secret",
            algorithm="HS256",
        )
        with pytest.raises(jwt.InvalidTokenError):
            decode_token(forged)


class TestClockSkewTolerance:
    """Đồng hồ lệch nhẹ không được làm token vừa phát hành bị từ chối."""

    def _token_issued_at(self, offset_seconds: int) -> str:
        import jwt as pyjwt
        from datetime import datetime, timedelta, timezone

        from app.core.config import settings
        from app.core.security import ALGORITHM

        issued = datetime.now(timezone.utc) + timedelta(seconds=offset_seconds)
        return pyjwt.encode(
            {
                "sub": "0f14e2ea-2a53-4a1e-9b60-4a3b1c2d5e6f",
                "type": "access",
                "role": "trainee",
                "iat": issued,
                "exp": issued + timedelta(minutes=30),
                "jti": "test",
            },
            settings.secret_key,
            algorithm=ALGORITHM,
        )

    def test_accepts_token_issued_slightly_in_the_future(self):
        # Xảy ra thật khi đồng hồ máy ảo bị resync lùi lại.
        payload = decode_token(self._token_issued_at(15))
        assert payload["type"] == "access"

    def test_still_rejects_token_far_in_the_future(self):
        with pytest.raises(jwt.InvalidTokenError):
            decode_token(self._token_issued_at(3600))
