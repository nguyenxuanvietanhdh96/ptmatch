"""Thu hồi phiên cũ khi đổi mật khẩu / thêm email thật.

Trước migration này, `POST /auth/reset-password` đặt hash mới và cấp token
mới nhưng không thu hồi refresh token đang lưu hành. Một kẻ đã trộm được
refresh token (qua phishing, thiết bị bị chiếm...) giữ phiên đăng nhập tới hết
hạn 30 ngày kể cả sau khi chủ tài khoản "khôi phục" bằng cách đặt lại mật khẩu
— tức năng khôi phục vô hiệu ngay đúng lúc cần nó nhất.

Cột mới lưu mốc đổi credential gần nhất; token có `iat` trước mốc này bị coi
là đã thu hồi (kiểm ở app/api/deps.py::get_current_user và
app/api/auth.py::refresh — không cần tra Redis, vì cả hai chỗ đó đã tải User từ
DB sẵn cho mỗi request).

NULL cho mọi user hiện có — không backfill về `created_at` hay bất kỳ mốc nào,
vì làm vậy sẽ vô tình thu hồi phiên đang sống của tất cả user (bất kỳ mốc trong
quá khứ khiến mọi refresh token cấp trước mốc đó có `iat` < mốc, bị coi là
thu hồi). NULL nghĩa là "chưa từng đổi, không hạn chế gì" — đúng với vòng đời
thật của tài khoản.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0016"
down_revision: Union[str, None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("credentials_changed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "credentials_changed_at")
