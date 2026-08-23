"""Refresh-token denylist, backed by Redis.

JWTs are stateless, so "logout" and "rotate on refresh" need somewhere to
record that a token must no longer be accepted. We store only the `jti` of
revoked refresh tokens, with a TTL equal to the token's remaining lifetime —
once it would have expired anyway, the entry disappears on its own.

Availability note: if Redis is unreachable we fail *open* (the token is still
accepted) and log a warning, rather than locking every user out of the app.
Access tokens are short-lived, which bounds the exposure.
"""
import logging
import time
from typing import Any, Dict

from app.core.redis import get_redis

logger = logging.getLogger("ptmatch.tokens")

_PREFIX = "revoked_jti:"


def _remaining_ttl(payload: Dict[str, Any]) -> int:
    exp = int(payload.get("exp") or 0)
    return max(1, exp - int(time.time()))


async def revoke_token(payload: Dict[str, Any]) -> None:
    """Mark a decoded token's jti as no longer usable."""
    jti = payload.get("jti")
    if not jti:
        return
    try:
        await get_redis().set(_PREFIX + jti, "1", ex=_remaining_ttl(payload))
    except Exception:  # pragma: no cover - depends on Redis being down
        logger.warning("Could not revoke token %s: Redis unavailable", jti)


async def is_token_revoked(payload: Dict[str, Any]) -> bool:
    jti = payload.get("jti")
    if not jti:
        return False
    try:
        return bool(await get_redis().exists(_PREFIX + jti))
    except Exception:  # pragma: no cover - depends on Redis being down
        logger.warning("Revocation check failed (Redis unavailable) — allowing token")
        return False
