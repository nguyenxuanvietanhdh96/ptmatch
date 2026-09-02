"""Ban tài khoản và xoá mềm — hai biện pháp mạnh hơn đình chỉ hồ sơ (0018).

Đình chỉ chỉ ẩn hồ sơ; PT vẫn đăng nhập và vẫn xem được lead cũ. Cần thêm hai
mức: chấm dứt truy cập (ban) và đóng tài khoản (xoá).

`users.banned_at` — không đăng nhập được nữa. Phiên đang mở cũng chết vì cùng lúc
đó `credentials_changed_at` được đẩy lên: cơ chế thu hồi token đã có từ 0016.

`users.deleted_at` + `pt_profiles.deleted_at` — XOÁ MỀM, không phải DELETE. Lý do
là một xung đột thật giữa hai điều trong chính sách quyền riêng tư của dự án:

  - mục 5: dữ liệu lead được giữ "trong thời gian tài khoản PT nhận yêu cầu còn
    hoạt động, phục vụ việc đối chiếu khi có tranh chấp";
  - mục 5-6: dữ liệu tài khoản được xoá khi người dùng yêu cầu đóng tài khoản.

Lead chứa SỐ ĐIỆN THOẠI CỦA HỌC VIÊN — dữ liệu của người thứ ba. Xoá cứng tài
khoản PT sẽ kéo theo chúng và mất bằng chứng đối chiếu nếu chính học viên đó
khiếu nại. Nên: khử danh tính PT (tên, email, ảnh, bio, liên hệ, slug) và giữ
bản ghi lead — chúng không còn trỏ về một con người nào của phía PT nữa.

Hàng `users` được GIỮ chứ không xoá: mọi khoá ngoại từ lead, review, favorite
đều trỏ về nó, và xoá hàng sẽ hoặc gãy ràng buộc hoặc kéo theo dữ liệu của
người khác.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0019"
down_revision: Union[str, None] = "0018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users", sa.Column("banned_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "users", sa.Column("ban_reason", sa.String(length=500), nullable=True)
    )
    op.add_column(
        "users", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "pt_profiles",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("pt_profiles", "deleted_at")
    op.drop_column("users", "deleted_at")
    op.drop_column("users", "ban_reason")
    op.drop_column("users", "banned_at")
