"""Đình chỉ hồ sơ PT bởi admin — trạng thái mà chính PT không tự tháo được.

Trang chính sách quyền riêng tư (mục 6) hứa với học viên: "Nếu bị làm phiền, hãy
báo cho chúng tôi để xử lý tài khoản PT đó." Nhưng không có công cụ nào để làm
việc đó: cách duy nhất là UPDATE thẳng vào DB.

Vì sao không dùng `is_active` sẵn có: cột đó là lựa chọn CỦA PT (tạm ẩn hồ sơ) và
`PUT /api/pts/me` cho phép PT tự đặt. Admin tắt xong thì PT bật lại được ngay —
một biện pháp xử lý mà đối tượng bị xử lý tự tháo được thì không phải biện pháp.
Cần một trạng thái riêng, chỉ admin đổi.

`suspended_reason` NOT NULL khi bị đình chỉ (endpoint bắt buộc nhập): một hồ sơ
biến mất khỏi kết quả tìm kiếm mà không ai biết vì sao là thứ sẽ tốn hàng giờ dò
tìm sau này. `suspended_at` để biết khi nào, cho tra soát.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0018"
down_revision: Union[str, None] = "0017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "pt_profiles",
        sa.Column("suspended_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "pt_profiles",
        sa.Column("suspended_reason", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("pt_profiles", "suspended_reason")
    op.drop_column("pt_profiles", "suspended_at")
