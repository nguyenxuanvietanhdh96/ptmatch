"""Ban tài khoản và đóng tài khoản (xoá mềm + khử danh tính).

Tách khỏi endpoint vì đây là thứ phải làm ĐÚNG MỘT CÁCH ở mọi nơi gọi tới: hôm
nay chỉ có admin, nhưng chính sách quyền riêng tư (mục 6) cho người dùng quyền
tự yêu cầu đóng tài khoản, nên sẽ có đường thứ hai. Hai bản sao của luật khử
danh tính thì bản ít dùng hơn sẽ bỏ sót một cột.

VÌ SAO XOÁ MỀM, không phải DELETE — hai điều trong chính sách xung đột nhau:

  - mục 5: dữ liệu lead được giữ "trong thời gian tài khoản PT nhận yêu cầu còn
    hoạt động, phục vụ việc đối chiếu khi có tranh chấp";
  - mục 5-6: dữ liệu tài khoản được xoá khi người dùng yêu cầu đóng tài khoản.

Lead chứa số điện thoại HỌC VIÊN — dữ liệu của người thứ ba, không phải của PT.
Xoá cứng tài khoản PT kéo theo chúng và làm mất bằng chứng nếu chính học viên đó
khiếu nại. Nên: khử mọi thông tin nhận dạng phía PT, giữ bản ghi lead. Sau khi
khử, bản ghi không còn trỏ về một con người nào phía PT.

Không xoá: đánh giá học viên đã viết (nội dung của họ), lead, và hàng `users`
(mọi khoá ngoại trỏ về nó).
"""
import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutils import now_vn
from app.models import PTProfile, User

# Email sau khi khử: giữ tính duy nhất của cột mà không còn là địa chỉ thật.
# Tên miền .invalid được RFC 2606 dành riêng cho mục đích này — không ai gửi thư
# tới đó được, kể cả do nhầm.
CLOSED_EMAIL_DOMAIN = "@deleted.invalid"


def closed_email(user_id: uuid.UUID) -> str:
    return "closed-%s%s" % (user_id.hex, CLOSED_EMAIL_DOMAIN)


def ban_user(user: User, reason: str) -> None:
    """Chặn đăng nhập và giết mọi phiên đang mở.

    `credentials_changed_at` là cơ chế thu hồi token có từ 0016: token có `iat`
    trước mốc này bị coi là hết hiệu lực. Không đặt nó thì tài khoản bị ban vẫn
    dùng được access token hiện tại cho tới khi hết hạn.
    """
    now = now_vn()
    user.banned_at = now
    user.ban_reason = reason
    user.credentials_changed_at = now


def unban_user(user: User) -> None:
    """Bỏ ban. KHÔNG hạ `credentials_changed_at`: phiên cũ đã chết thì để chết —
    hạ mốc xuống là làm sống lại đúng những token mà lệnh ban vừa thu hồi."""
    user.banned_at = None
    user.ban_reason = None


async def close_account(db: AsyncSession, user: User) -> Optional[str]:
    """Đóng tài khoản: khử danh tính rồi đánh dấu đã xoá. KHÔNG hoàn tác được.

    Trả về slug cũ của hồ sơ PT (nếu có) để nơi gọi ghi log và, sau này, xoá
    cache trang công khai.

    GIỚI HẠN ĐÃ BIẾT: trang `/pt/<slug>` dựng sẵn theo ISR 300 giây, và endpoint
    xoá cache (`/internal/revalidate`) chỉ nhận token của chính PT — một tài
    khoản vừa đóng thì không còn token nào. Nên bản đã dựng sẵn vẫn phục vụ tên
    và ảnh trong tối đa 5 phút sau khi đóng, rồi mới thành 404. Chấp nhận được
    nhưng KHÔNG phải tức thì; muốn tức thì thì phải cho admin xoá cache theo slug.
    """
    now = now_vn()

    profile = await db.scalar(select(PTProfile).where(PTProfile.user_id == user.id))
    old_slug: Optional[str] = None
    if profile is not None:
        old_slug = profile.slug
        # Slug được giải phóng: link cũ phải chết, và cột này unique nên không
        # thể để nguyên nếu muốn người khác dùng lại tên đó sau này.
        profile.slug = "deleted-%s" % profile.id.hex
        profile.full_name = "Tài khoản đã đóng"
        profile.bio = None
        profile.avatar_url = None
        profile.certifications = []
        profile.social_links = {}
        profile.specialties = []
        profile.pricing = {}
        profile.is_active = False
        profile.deleted_at = now

    user.email = closed_email(user.id)
    user.full_name = None
    user.phone = None
    user.password_hash = None
    user.oauth_provider = None
    user.oauth_id = None
    user.oauth_avatar_url = None
    user.zalo_user_id = None
    user.deleted_at = now
    # Giết mọi phiên đang mở, cùng lý do như ban_user.
    user.credentials_changed_at = now

    return old_slug
