"""Cấp (hoặc thu hồi) quyền admin cho một tài khoản đã tồn tại.

Usage:
    python -m app.jobs.grant_admin <email>
    python -m app.jobs.grant_admin <email> --revoke

Trên server:
    docker compose -f docker-compose.prod.yml exec backend \\
        python -m app.jobs.grant_admin ban@ptmatch.vn

Vì sao cần script riêng: API đăng ký cố ý chỉ nhận role `pt` và `trainee` — mở
đường tự đăng ký làm admin qua HTTP là lỗ hổng, không phải tiện ích. Nhưng như
vậy thì cách duy nhất còn lại là UPDATE thẳng vào DB, và một câu SQL truyền
miệng thì sớm muộn cũng có người gõ nhầm điều kiện WHERE rồi nâng quyền cả bảng.

Script này kiểm tra tài khoản tồn tại, in ra role cũ và mới, và chỉ đụng đúng
một hàng.
"""
import asyncio
import sys

from sqlalchemy import select

from app.core.database import async_session_factory, engine
from app.models import User, UserRole


async def run(email: str, revoke: bool) -> int:
    target_role = UserRole.trainee if revoke else UserRole.admin

    async with async_session_factory() as db:
        user = await db.scalar(select(User).where(User.email == email.lower().strip()))
        if user is None:
            print("Không tìm thấy tài khoản: %s" % email)
            print("Tài khoản phải đăng ký qua giao diện trước, script này chỉ đổi quyền.")
            return 1

        if user.role == target_role:
            print("%s đã có role %s — không đổi gì." % (user.email, target_role.value))
            return 0

        old = user.role.value
        user.role = target_role
        await db.commit()
        print("%s: %s -> %s" % (user.email, old, target_role.value))
        return 0


async def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    revoke = "--revoke" in sys.argv[1:]

    if len(args) != 1:
        print(__doc__)
        raise SystemExit(2)

    try:
        raise SystemExit(await run(args[0], revoke))
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
