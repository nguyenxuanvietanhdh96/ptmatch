"""Xoá dữ liệu "phản hồi trong 0 giây" do backfill của 0005 để lại.

Migration 0005 từng đặt first_response_at = created_at cho lead cũ. Hiệu hai mốc
bằng 0 nên hồ sơ công khai hiện "phản hồi trong 0.0 giờ" — bịa ra đúng tín hiệu
phản hồi tức thì mà tính năng này sinh ra để đo trung thực.

0005 đã được sửa để không backfill nữa, nhưng migration đã chạy thì không chạy
lại, nên cần bước dọn riêng cho các DB đã áp dụng bản cũ.

Điều kiện `first_response_at = created_at` khớp chính xác tới micro giây. PT thật
bấm đổi trạng thái không bao giờ trùng khít tới mức đó với thời điểm lead được
tạo, nên đây là dấu hiệu nhận biết an toàn của dữ liệu do backfill sinh ra.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE leads
        SET first_response_at = NULL
        WHERE first_response_at IS NOT NULL
          AND first_response_at = created_at
        """
    )


def downgrade() -> None:
    # Không khôi phục được: giá trị cũ vốn là dữ liệu bịa, và mốc phản hồi thật
    # thì chưa từng tồn tại. Đây là bước tiến một chiều có chủ ý.
    pass
