"""GIN trigram index cho bộ lọc khu vực (city/ward) — phục vụ đúng kiểu truy vấn thật.

`api/pts.py` và `api/requests.py` lọc khu vực bằng
`lower(ptmatch_unaccent(col)) ILIKE '%pattern%'` (so khớp gần đúng, không phải
tiền tố — "Quận 7" phải khớp cả khi người dùng gõ "quan 7" hay chỉ "7"). Index
btree thường (`ix_pt_locations_city/ward`, tạo ở 0001/0011) KHÔNG phục vụ được
kiểu ILIKE có `%` ở đầu này — btree chỉ giúp so sánh bằng hoặc tiền tố. Bảng
còn nhỏ ở giai đoạn kiểm chứng nên seq scan vẫn nhanh, nhưng trước khi có traffic
thật thì cần index đúng loại.

GIN + `pg_trgm` (trigram) là loại index Postgres hỗ trợ cho substring match
qua `ILIKE`/`LIKE`. Đặt trên đúng biểu thức mà query dùng
(`lower(ptmatch_unaccent(col))`) để planner nhận ra và dùng được — đặt trên cột
thô thì vô dụng với truy vấn này.

KHÔNG xoá 2 index btree cũ: `admin.py` vẫn `GROUP BY TraineeRequest.ward` thô,
và xoá thứ đang chạy được để đổi bằng thứ mới chỉ đáng làm khi có lý do, không
phải ở đây.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0017"
down_revision: Union[str, None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute(
        "CREATE INDEX ix_pt_locations_city_trgm ON pt_locations "
        "USING gin (lower(ptmatch_unaccent(city)) gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX ix_pt_locations_ward_trgm ON pt_locations "
        "USING gin (lower(ptmatch_unaccent(ward)) gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX ix_trainee_requests_city_trgm ON trainee_requests "
        "USING gin (lower(ptmatch_unaccent(city)) gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX ix_trainee_requests_ward_trgm ON trainee_requests "
        "USING gin (lower(ptmatch_unaccent(ward)) gin_trgm_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_trainee_requests_ward_trgm")
    op.execute("DROP INDEX IF EXISTS ix_trainee_requests_city_trgm")
    op.execute("DROP INDEX IF EXISTS ix_pt_locations_ward_trgm")
    op.execute("DROP INDEX IF EXISTS ix_pt_locations_city_trgm")
    op.execute("DROP EXTENSION IF EXISTS pg_trgm")
