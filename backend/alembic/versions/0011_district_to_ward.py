"""Đổi `district` thành `ward` theo cơ cấu hành chính 2 cấp.

Từ 01/07/2025 Việt Nam bỏ cấp huyện: cả nước còn 34 tỉnh/thành, và dưới tỉnh là
phường/xã trực tiếp. "Quận 7" hay "Quận Cầu Giấy" không còn là đơn vị hành chính.

Vì sao đổi tên cột chứ không chỉ đổi dữ liệu: giữ tên `district` mà bên trong
chứa tên phường là đánh lừa mọi người đọc code sau này — họ sẽ viết truy vấn,
đặt nhãn giao diện và suy luận theo đúng cái tên đó. Đổi tên khi chưa launch gần
như không tốn gì; để sau thì cột và tham số API đã nằm trong URL, bookmark và
tích hợp.

DỮ LIỆU CŨ: giá trị district cũ được GIỮ NGUYÊN trong cột `ward` mới, không xoá
và không cố tự động ánh xạ. Ánh xạ không thể đúng — một quận cũ tách thành nhiều
phường mới, nên không có phép biến đổi 1-1 nào. Chuỗi "Quận 7" vẫn là mô tả khu
vực người đọc hiểu được, và bộ lọc tìm kiếm dùng so khớp gần đúng nên nó vẫn tìm
ra. PT cập nhật lại hồ sơ khi thuận tiện.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("pt_locations", "district", new_column_name="ward")
    op.alter_column("trainee_requests", "district", new_column_name="ward")

    # ALTER ... RENAME COLUMN không đổi tên index, nên phải đổi tay — không thì
    # còn lại một index tên ix_pt_locations_district trỏ vào cột ward.
    op.execute("ALTER INDEX ix_pt_locations_district RENAME TO ix_pt_locations_ward")

    # trainee_requests.city/ward trước giờ không có index nào dù bảng tin lọc
    # theo chúng. Index này phục vụ bộ lọc khu vực của bảng tin.
    op.create_index(
        "ix_trainee_requests_area", "trainee_requests", ["city", "ward"]
    )


def downgrade() -> None:
    op.drop_index("ix_trainee_requests_area", table_name="trainee_requests")
    op.execute("ALTER INDEX ix_pt_locations_ward RENAME TO ix_pt_locations_district")
    op.alter_column("trainee_requests", "ward", new_column_name="district")
    op.alter_column("pt_locations", "ward", new_column_name="district")
