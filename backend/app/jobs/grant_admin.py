"""Đổi role của một tài khoản đã tồn tại.

Usage:
    python -m app.jobs.grant_admin <email>                # -> admin
    python -m app.jobs.grant_admin <email> --revoke       # -> trainee
    python -m app.jobs.grant_admin <email> --role pt      # -> role chỉ định

`--role` có mặt vì `--revoke` giả định tài khoản vốn là trainee. Nâng một tài
khoản PT lên admin rồi revoke sẽ biến nó thành trainee, tức là mất luôn hồ sơ
PT — role là cột đơn, không có đường quay lại nếu script không nói được "về pt".

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


async def run(email: str, target_role: UserRole) -> int:
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

        # /admin/login cố ý chỉ nhận mật khẩu, không OAuth (xem docstring của
        # admin_login). Một tài khoản tạo qua Google/Facebook không có
        # password_hash, nên cấp admin cho nó tạo ra một quản trị viên KHÔNG THỂ
        # đăng nhập — và thông báo nhận được là "Incorrect email or password",
        # chỉ về đúng chỗ sai.
        if target_role is UserRole.admin and not user.password_hash:
            print()
            print("CẢNH BÁO: tài khoản này không có mật khẩu (đăng ký qua %s)."
                  % (user.oauth_provider or "OAuth"))
            print("/admin/login chỉ nhận mật khẩu, nên tài khoản này sẽ KHÔNG")
            print("đăng nhập được vào khu quản trị. Hãy đăng ký một tài khoản")
            print("bằng email + mật khẩu ở /register rồi cấp quyền cho nó.")
        return 0


def parse_target_role(argv: list[str]) -> UserRole | None:
    """Role đích từ tham số dòng lệnh; None nếu tham số không hợp lệ."""
    if "--role" in argv:
        i = argv.index("--role")
        if i + 1 >= len(argv):
            return None
        try:
            return UserRole(argv[i + 1].strip().lower())
        except ValueError:
            return None
    if "--revoke" in argv:
        return UserRole.trainee
    return UserRole.admin


async def main() -> None:
    argv = sys.argv[1:]
    target_role = parse_target_role(argv)
    if target_role is None:
        print("--role phải là một trong: %s"
              % ", ".join(r.value for r in UserRole))
        raise SystemExit(2)

    # Bỏ cả cờ và giá trị của --role, chỉ còn lại email.
    args = []
    skip = False
    for a in argv:
        if skip:
            skip = False
            continue
        if a == "--role":
            skip = True
            continue
        if not a.startswith("--"):
            args.append(a)

    if len(args) != 1:
        print(__doc__)
        raise SystemExit(2)

    try:
        raise SystemExit(await run(args[0], target_role))
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
