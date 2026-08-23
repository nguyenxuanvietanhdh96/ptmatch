"""Chống thổi phồng điểm đánh giá bằng ràng buộc ở tầng DB.

`avg_rating` là tín hiệu niềm tin quan trọng nhất của chợ và cũng là thứ quyết
định thứ hạng tìm kiếm mặc định, nên nó phải được bảo vệ ở chỗ không ai đi vòng
được — chứ không phải chỉ bằng một câu SELECT kiểm tra trước khi INSERT.

Hai lỗ hổng được bịt ở đây:

1. Người đã đăng nhập: API có kiểm tra "đã đánh giá PT này chưa", nhưng đó là
   check-then-insert nên hai request song song cùng lọt qua. Không có ràng buộc
   DB nào chặn lại.

2. Người ẩn danh: toàn bộ phần kiểm tra trong API chỉ chạy khi có đăng nhập, nên
   chỉ cần đăng xuất là PT tự bấm 5 sao cho hồ sơ mình bao nhiêu lần cũng được,
   chỉ vướng rate limit theo IP.

Đánh giá ẩn danh được giữ lại — biểu mẫu vẫn bắt buộc nhập SĐT, và giai đoạn
kiểm chứng cần thu review với ma sát thấp nhất có thể. Ràng buộc theo SĐT khiến
mỗi đánh giá giả tốn một số điện thoại khác nhau, thay vì bấm gửi lại là xong.

Lưu ý về dữ liệu cũ: các bản ghi trùng có sẵn (nếu có) được gộp lại trước khi
tạo index, giữ bản đánh giá SỚM NHẤT của mỗi cặp và xoá phần còn lại, rồi tính
lại avg_rating/review_count cho các hồ sơ bị ảnh hưởng.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- 1. Dọn trùng lặp có sẵn để index unique tạo được -------------------
    # Giữ bản sớm nhất theo (pt_profile_id, trainee_id) với người đã đăng nhập.
    op.execute(
        """
        DELETE FROM reviews r
        USING reviews keep
        WHERE r.trainee_id IS NOT NULL
          AND keep.trainee_id = r.trainee_id
          AND keep.pt_profile_id = r.pt_profile_id
          AND (keep.created_at, keep.id) < (r.created_at, r.id)
        """
    )

    # Tương tự cho đánh giá ẩn danh có SĐT, theo (pt_profile_id, reviewer_phone).
    op.execute(
        """
        DELETE FROM reviews r
        USING reviews keep
        WHERE r.trainee_id IS NULL
          AND r.reviewer_phone IS NOT NULL
          AND keep.trainee_id IS NULL
          AND keep.reviewer_phone = r.reviewer_phone
          AND keep.pt_profile_id = r.pt_profile_id
          AND (keep.created_at, keep.id) < (r.created_at, r.id)
        """
    )

    # --- 2. Ràng buộc thật ---------------------------------------------------
    op.create_index(
        "uq_reviews_pt_trainee",
        "reviews",
        ["pt_profile_id", "trainee_id"],
        unique=True,
        postgresql_where=sa.text("trainee_id IS NOT NULL"),
    )
    op.create_index(
        "uq_reviews_pt_anon_phone",
        "reviews",
        ["pt_profile_id", "reviewer_phone"],
        unique=True,
        postgresql_where=sa.text("trainee_id IS NULL AND reviewer_phone IS NOT NULL"),
    )

    # Index cho /reviews/mine và cho chính phần kiểm tra trùng ở API — trước đây
    # trainee_id không có index nào.
    op.create_index("ix_reviews_trainee_id", "reviews", ["trainee_id"])

    # --- 3. Tính lại điểm cho hồ sơ đã bị ảnh hưởng bởi bước dọn -------------
    # Chạy cho tất cả hồ sơ: rẻ ở quy mô hiện tại và đảm bảo số liệu khớp với
    # dữ liệu còn lại sau khi xoá.
    op.execute(
        """
        UPDATE pt_profiles p
        SET avg_rating = COALESCE(agg.avg_rating, 0),
            review_count = COALESCE(agg.review_count, 0)
        FROM (
            SELECT pt.id AS pt_id,
                   ROUND(AVG(r.rating)::numeric, 2) AS avg_rating,
                   COUNT(r.id) AS review_count
            FROM pt_profiles pt
            LEFT JOIN reviews r ON r.pt_profile_id = pt.id
            GROUP BY pt.id
        ) agg
        WHERE p.id = agg.pt_id
        """
    )


def downgrade() -> None:
    op.drop_index("ix_reviews_trainee_id", table_name="reviews")
    op.drop_index("uq_reviews_pt_anon_phone", table_name="reviews")
    op.drop_index("uq_reviews_pt_trainee", table_name="reviews")
