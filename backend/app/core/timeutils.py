"""Múi giờ Việt Nam cho các số liệu hiển thị cho người dùng.

Mọi mốc thời gian đều lưu dưới dạng timestamptz (UTC) — đó là cách đúng. Nhưng
số liệu thì phải gom nhóm theo ngày mà PT thực sự trải qua, không phải theo ngày
UTC: một lead lúc 6 giờ sáng ngày 18 ở Việt Nam là 23 giờ ngày 17 theo UTC, nên
gom theo UTC sẽ đẩy nó sang ô của ngày hôm trước và làm lệch cả biểu đồ theo
ngày lẫn ô "lead tháng này".
"""
from datetime import datetime, timedelta, timezone

# Tên IANA, dùng cho phía SQL (Postgres luôn có sẵn tzdata).
VN_TZ_NAME = "Asia/Ho_Chi_Minh"

# Phía Python dùng offset cố định thay vì ZoneInfo: Việt Nam bỏ giờ mùa hè từ
# năm 1975 nên UTC+7 là bất biến, và như vậy không phụ thuộc vào việc image
# backend có cài gói tzdata hay không.
VN_TZ = timezone(timedelta(hours=7), VN_TZ_NAME)


def now_vn() -> datetime:
    """Thời điểm hiện tại theo giờ Việt Nam."""
    return datetime.now(VN_TZ)


def vn_day_start(moment: datetime) -> datetime:
    """0 giờ 00 của ngày (theo giờ VN) chứa `moment`."""
    return moment.astimezone(VN_TZ).replace(
        hour=0, minute=0, second=0, microsecond=0
    )


def vn_month_start(moment: datetime) -> datetime:
    """0 giờ 00 ngày đầu tháng (theo giờ VN) chứa `moment`."""
    local = moment.astimezone(VN_TZ)
    return datetime(local.year, local.month, 1, tzinfo=VN_TZ)
