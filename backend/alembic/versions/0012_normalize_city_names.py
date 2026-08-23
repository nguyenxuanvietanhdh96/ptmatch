"""Chuẩn hoá tên tỉnh/thành viết tắt về đúng tên trong danh mục hành chính.

Ô chọn khu vực mới ghi xuống đúng tên danh mục ("Thành phố Hồ Chí Minh"), còn
dữ liệu cũ được gõ tay hoặc do seed sinh ra thì viết tắt ("TP.HCM"). Bộ lọc khu
vực so khớp theo chuỗi con, nên hai dạng này không bao giờ gặp nhau: PT lưu
"TP.HCM" biến mất khỏi kết quả khi học viên chọn "Thành phố Hồ Chí Minh" trong ô
chọn. Không báo lỗi, chỉ là ít kết quả hơn thực tế — kiểu hỏng khó phát hiện nhất.

Chỉ ánh xạ những cách viết KHÔNG THỂ NHẦM của các tỉnh/thành lớn. Cố đoán rộng
hơn sẽ sai: "Thanh Hóa"/"Thanh Hoá" là chuyện dấu, còn tên tự do do người dùng
gõ thì không có cách nào biết chắc họ định nói tỉnh nào.

Khác với `ward`, ánh xạ tên tỉnh là 1-1 và an toàn: 34 tỉnh/thành sau sáp nhập
đều giữ nguyên tên của một tỉnh cũ, nên "TP.HCM" hôm nay vẫn là "Thành phố Hồ
Chí Minh" hôm qua.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Viết tắt -> tên trong frontend/public/vn-locations/provinces.json
CITY_ALIASES = {
    "TP.HCM": "Thành phố Hồ Chí Minh",
    "TP HCM": "Thành phố Hồ Chí Minh",
    "TPHCM": "Thành phố Hồ Chí Minh",
    "HCM": "Thành phố Hồ Chí Minh",
    "Hồ Chí Minh": "Thành phố Hồ Chí Minh",
    "Sài Gòn": "Thành phố Hồ Chí Minh",
    "Hà Nội": "Thành phố Hà Nội",
    "HN": "Thành phố Hà Nội",
    "Đà Nẵng": "Thành phố Đà Nẵng",
    "Hải Phòng": "Thành phố Hải Phòng",
    "Cần Thơ": "Thành phố Cần Thơ",
    "Huế": "Thành phố Huế",
}

_TABLES = ("pt_locations", "trainee_requests")


def upgrade() -> None:
    for table in _TABLES:
        for alias, canonical in CITY_ALIASES.items():
            # So sánh không phân biệt hoa thường; chỉ đụng vào hàng khớp trọn vẹn
            # để không biến "Bắc Hà Nội" thành gì đó vô nghĩa.
            op.execute(
                """
                UPDATE {table}
                SET city = '{canonical}'
                WHERE lower(btrim(city)) = lower('{alias}')
                """.format(table=table, canonical=canonical.replace("'", "''"), alias=alias.replace("'", "''"))
            )


def downgrade() -> None:
    # Không khôi phục được: nhiều cách viết tắt cùng ánh xạ về một tên chuẩn nên
    # không biết hàng nào vốn viết theo dạng nào. Đây là bước dọn dữ liệu một chiều.
    pass
