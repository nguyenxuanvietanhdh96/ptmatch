"""Email giả sinh cho tài khoản OAuth không cung cấp địa chỉ thật.

Zalo (và Facebook khi người dùng không chia sẻ email) không trả về email, trong
khi `users.email` là NOT NULL + UNIQUE. Ta sinh một địa chỉ tất định trên một
domain KHÔNG TỒN TẠI để giữ ràng buộc đó.

Hệ quả phải nhớ ở mọi nơi đụng tới email:

1. **Không bao giờ gộp tài khoản** theo địa chỉ này — nó không chứng minh ai sở
   hữu cái gì (xem api/auth.py).
2. **Không bao giờ gửi thư tới nó.** Domain không có thật, nên thư sẽ bounce
   hoặc bị SMTP từ chối. Nguy hiểm hơn: nếu không chặn, sổ gửi thông báo ghi
   "đã gửi" và ta tưởng PT đã được báo trong khi họ chưa hề biết có lead.
"""

PLACEHOLDER_EMAIL_DOMAIN = "@oauth.ptmatch.vn"


def placeholder_email(provider: str, provider_id: str) -> str:
    return f"{provider}.{provider_id}{PLACEHOLDER_EMAIL_DOMAIN}".lower()


def is_placeholder_email(address: str | None) -> bool:
    """True nếu đây là email tự sinh, không gửi thư tới được."""
    return bool(address) and address.lower().endswith(PLACEHOLDER_EMAIL_DOMAIN)
