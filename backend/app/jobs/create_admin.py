"""Tạo thẳng một tài khoản quản trị bằng email + mật khẩu.

Usage:
    docker compose exec backend python -m app.jobs.create_admin <email>
    echo '<mật khẩu>' | docker compose exec -T backend python -m app.jobs.create_admin <email>

Vì sao cần script này bên cạnh `grant_admin`: đường duy nhất trước đây là đăng
ký qua /register rồi nâng quyền. Hai bước, và bước đầu có một cái bẫy im lặng —
bấm nút Google ở trang đăng ký thì tài khoản không có mật khẩu, trong khi
/admin/login cố ý chỉ nhận mật khẩu. Kết quả là một quản trị viên không đăng
nhập được, báo lỗi "Incorrect email or password", chỉ sai hoàn toàn chỗ hỏng.

Hàm băm lấy từ app.core.security, không tự cài đặt lại. Độ dài tối thiểu thì
phải nhắc lại bằng một hằng số (xem MIN_PASSWORD_LEN) — đổi luật ở
RegisterRequest thì phải đổi cả ở đây.

Mật khẩu đọc từ stdin chứ không nhận qua tham số: tham số dòng lệnh hiện trong
`ps` của mọi tiến trình trên máy và nằm lại trong lịch sử shell.
"""
import asyncio
import getpass
import sys

from pydantic import BaseModel, EmailStr, ValidationError
from sqlalchemy import select

from app.core.database import async_session_factory, engine
from app.core.security import hash_password
from app.models import User, UserRole

# Phải khớp `password: str = Field(min_length=8, ...)` trong
# app/schemas/auth.py::RegisterRequest. Cố ý là một hằng số đọc được bằng mắt
# thay vì moi ra từ nội bộ Pydantic: sai lệch ở đây chỉ là một mật khẩu quản trị
# ngắn hơn luật của API, còn một dòng nội suy thông minh mà hỏng thì làm script
# chết đúng lúc cần nó nhất — và ở đây không có cách nào chạy thử trước.
MIN_PASSWORD_LEN = 8


class _EmailCheck(BaseModel):
    email: EmailStr


def normalise_email(raw: str) -> str | None:
    """Email đã chuẩn hoá, hoặc None nếu không hợp lệ."""
    try:
        return _EmailCheck(email=raw.strip()).email.lower()
    except ValidationError:
        return None


def read_password() -> str | None:
    """Mật khẩu từ bàn phím (có xác nhận) hoặc từ stdin khi chạy trong pipe."""
    if sys.stdin.isatty():
        first = getpass.getpass("Mật khẩu: ")
        if first != getpass.getpass("Nhập lại: "):
            print("Hai lần nhập không khớp.")
            return None
        return first
    return sys.stdin.readline().rstrip("\n")


async def run(email: str, password: str, full_name: str) -> int:
    async with async_session_factory() as db:
        existing = await db.scalar(select(User).where(User.email == email))
        if existing is not None:
            print("Email %s đã có tài khoản (role %s)." % (email, existing.role.value))
            print("Dùng `python -m app.jobs.grant_admin %s` để đổi quyền," % email)
            print("hoặc chọn email khác nếu muốn một tài khoản quản trị riêng.")
            return 1

        db.add(
            User(
                email=email,
                full_name=full_name,
                password_hash=hash_password(password),
                role=UserRole.admin,
            )
        )
        await db.commit()

    print("Đã tạo quản trị viên: %s" % email)
    print("Đăng nhập tại /admin/login (cửa này chỉ nhận mật khẩu, không OAuth).")
    return 0


async def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) not in (1, 2):
        print(__doc__)
        raise SystemExit(2)

    email = normalise_email(args[0])
    if email is None:
        print("Email không hợp lệ: %s" % args[0])
        raise SystemExit(2)

    full_name = args[1] if len(args) == 2 else "Quản trị viên"

    password = read_password()
    if password is None:
        raise SystemExit(2)
    if len(password) < MIN_PASSWORD_LEN:
        print("Mật khẩu phải có ít nhất %d ký tự." % MIN_PASSWORD_LEN)
        raise SystemExit(2)

    try:
        raise SystemExit(await run(email, password, full_name))
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
