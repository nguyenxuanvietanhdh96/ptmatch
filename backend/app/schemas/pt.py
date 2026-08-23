import re
import uuid
from datetime import datetime
from typing import List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.pt_profile import SPECIALTY_SLUGS
from app.schemas.common import normalize_social_url, validate_public_url
from app.services.coverage import canonicalize_province

GenderLiteral = Literal["male", "female", "other"]
PortfolioTypeLiteral = Literal["before_after", "photo", "video"]

_SLUG_RE = re.compile(r"^[a-z0-9_]+$")
_CUSTOM_SLUG_RE = re.compile(r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?$")

# Trần số lượng cho các list lưu trong JSONB. Không có chúng, một PT (hoặc một
# script) nhét được 50.000 mục vào một hàng: hàng đó phình ra, index GIN trên
# specialties phình theo, và MỌI kết quả tìm kiếm chứa hồ sơ đó đều nặng thêm.
MAX_CERTIFICATIONS = 30
MAX_SPECIALTIES = 20

RESERVED_SLUGS = frozenset({
    "me", "admin", "api", "login", "register", "dashboard",
    "search", "pts", "pt", "settings", "profile", "help",
    "about", "contact", "terms", "privacy", "new",
})


class CertificationItem(BaseModel):
    name: str = Field(min_length=1, max_length=300)
    image_url: Optional[str] = Field(default=None, max_length=500)

    @field_validator("image_url")
    @classmethod
    def check_image_url(cls, v: Optional[str]) -> Optional[str]:
        return validate_public_url(v, field="Ảnh chứng chỉ")


class SocialLinks(BaseModel):
    facebook: Optional[str] = Field(default=None, max_length=500)
    instagram: Optional[str] = Field(default=None, max_length=500)
    tiktok: Optional[str] = Field(default=None, max_length=500)
    zalo: Optional[str] = Field(default=None, max_length=500)

    @field_validator("facebook", "instagram", "tiktok", "zalo")
    @classmethod
    def check_link(cls, v: Optional[str], info) -> Optional[str]:
        # Các link này render thành <a href> trên hồ sơ công khai, nên phải là
        # URL thật. Chuẩn hoá thay vì từ chối: PT gõ "fb.com/tuanpt" hay số Zalo
        # là chuyện bình thường, bắt họ gõ đủ "https://" chỉ tạo ma sát vô ích.
        return normalize_social_url(v, info.field_name)


class Pricing(BaseModel):
    per_session: Optional[int] = Field(default=None, ge=0)
    package_12: Optional[int] = Field(default=None, ge=0)
    package_24: Optional[int] = Field(default=None, ge=0)
    package_36: Optional[int] = Field(default=None, ge=0)


# ---------------------------------------------------------------------------
# Read-side variants.
#
# `pricing` and `social_links` are free-form JSONB. Writes are validated by the
# strict models above, but rows seeded or hand-edited outside the API may hold
# anything — and a single such row must not make an entire search listing fail
# to serialise. On the way out we therefore drop values we cannot represent
# instead of raising.
# ---------------------------------------------------------------------------

class SocialLinksOut(SocialLinks):
    @model_validator(mode="before")
    @classmethod
    def drop_non_string_values(cls, value):
        if not isinstance(value, dict):
            return {}
        return {k: v for k, v in value.items() if isinstance(v, str)}


class PricingOut(Pricing):
    @model_validator(mode="before")
    @classmethod
    def drop_invalid_amounts(cls, value):
        if not isinstance(value, dict):
            return {}
        cleaned = {}
        for key, amount in value.items():
            if isinstance(amount, bool):
                continue
            if isinstance(amount, float) and amount.is_integer():
                amount = int(amount)
            if isinstance(amount, str) and amount.strip().isdigit():
                amount = int(amount.strip())
            if isinstance(amount, int) and amount >= 0:
                cleaned[key] = amount
        return cleaned


class LocationCreate(BaseModel):
    gym_name: Optional[str] = Field(default=None, max_length=200)
    # `ward` = phường/xã. Cấp huyện đã bị bỏ từ 01/07/2025 (alembic 0011).
    ward: Optional[str] = Field(default=None, max_length=100)
    city: Optional[str] = Field(default=None, max_length=100)

    @field_validator("city")
    @classmethod
    def validate_city_is_served(cls, v: Optional[str]) -> Optional[str]:
        """Chỉ nhận tỉnh đang mở, và lưu lại đúng dạng chuẩn của danh mục."""
        return canonicalize_province(v)


class LocationOut(LocationCreate):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID


class PortfolioCreate(BaseModel):
    type: PortfolioTypeLiteral
    before_url: Optional[str] = Field(default=None, max_length=500)
    after_url: Optional[str] = Field(default=None, max_length=500)
    media_url: Optional[str] = Field(default=None, max_length=500)
    description: Optional[str] = Field(default=None, max_length=2000)
    sort_order: int = 0

    @field_validator("before_url", "after_url", "media_url")
    @classmethod
    def check_urls(cls, v: Optional[str]) -> Optional[str]:
        return validate_public_url(v, field="Đường dẫn ảnh/video")


class PortfolioUpdate(BaseModel):
    description: Optional[str] = Field(default=None, max_length=2000)
    sort_order: Optional[int] = None


class PortfolioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: PortfolioTypeLiteral
    before_url: Optional[str] = None
    after_url: Optional[str] = None
    media_url: Optional[str] = None
    description: Optional[str] = None
    sort_order: int = 0


class PTProfileUpdate(BaseModel):
    slug: Optional[str] = Field(default=None, min_length=3, max_length=60)
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=100)
    gender: Optional[GenderLiteral] = None
    age: Optional[int] = Field(default=None, ge=16, le=100)
    experience_years: Optional[int] = Field(default=None, ge=0, le=60)
    bio: Optional[str] = Field(default=None, max_length=10000)
    avatar_url: Optional[str] = Field(default=None, max_length=500)
    certifications: Optional[List[Union[str, CertificationItem]]] = Field(
        default=None, max_length=MAX_CERTIFICATIONS
    )
    specialties: Optional[List[str]] = Field(default=None, max_length=MAX_SPECIALTIES)
    social_links: Optional[SocialLinks] = None
    pricing: Optional[Pricing] = None
    is_active: Optional[bool] = None

    @field_validator("avatar_url")
    @classmethod
    def check_avatar_url(cls, v: Optional[str]) -> Optional[str]:
        return validate_public_url(v, field="Ảnh đại diện")

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip().lower()
        if not _CUSTOM_SLUG_RE.match(v):
            raise ValueError(
                "URL chỉ được chứa chữ thường, số và dấu gạch ngang"
            )
        if v in RESERVED_SLUGS:
            raise ValueError("URL '%s' đã được hệ thống sử dụng" % v)
        return v

    @field_validator("certifications")
    @classmethod
    def normalize_certifications(
        cls, v: Optional[List[Union[str, CertificationItem]]]
    ) -> Optional[List[CertificationItem]]:
        if v is None:
            return v
        out: list[CertificationItem] = []
        for item in v:
            if isinstance(item, str):
                out.append(CertificationItem(name=item.strip()))
            elif isinstance(item, dict):
                out.append(CertificationItem(**item))
            else:
                out.append(item)
        return out

    @field_validator("specialties")
    @classmethod
    def validate_specialties(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is None:
            return v
        for s in v:
            if not s or len(s) > 100:
                raise ValueError("Specialty must be 1-100 characters")
            if s not in SPECIALTY_SLUGS and not _SLUG_RE.match(s):
                raise ValueError(
                    "Custom specialty '%s' must be lowercase alphanumeric with underscores" % s
                )
        return list(dict.fromkeys(v))


class PTListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    full_name: str
    gender: Optional[GenderLiteral] = None
    age: Optional[int] = None
    experience_years: Optional[int] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    specialties: List[str] = []
    pricing: PricingOut = PricingOut()
    avg_rating: float = 0
    review_count: int = 0
    last_active_at: Optional[datetime] = None
    locations: List[LocationOut] = []


class PTDetailBase(PTListItem):
    certifications: List[CertificationItem] = []
    is_active: bool = True
    view_count: int = 0
    portfolio_items: List[PortfolioOut] = []
    created_at: Optional[datetime] = None

    @field_validator("certifications", mode="before")
    @classmethod
    def coerce_certifications(cls, v: list) -> list:
        out = []
        for item in v or []:
            if isinstance(item, str):
                out.append({"name": item})
            else:
                out.append(item)
        return out


class PTDetail(PTDetailBase):
    """Hồ sơ dưới góc nhìn của chính PT (GET/PUT /pts/me)."""

    social_links: SocialLinksOut = SocialLinksOut()
    # Những yêu cầu còn thiếu để hồ sơ được bày ra /pts và sitemap. Rỗng nghĩa
    # là đã đủ. Xem app/services/listing.py — dashboard dựng checklist từ đây
    # thay vì tự đoán lại luật, để hai bên không nói khác nhau.
    missing_listing: List[str] = []


class PTActivity(BaseModel):
    """Tín hiệu "PT này còn hoạt động và có trả lời không".

    Nỗi lo lớn nhất của học viên khi để lại số điện thoại là không ai liên hệ
    lại. Ba chỉ số dưới đây trả lời đúng nỗi lo đó bằng dữ liệu có thật, thay
    vì lời hứa trên hồ sơ.
    """

    last_active_at: Optional[datetime] = None
    # Thời gian phản hồi trung bình (giờ) trong 90 ngày gần nhất. None khi chưa
    # đủ lead để con số có ý nghĩa.
    response_hours: Optional[float] = None
    # Số lead đã chốt — "đã nhận bao nhiêu học viên qua PTMatch".
    students_coached: int = 0


class PTPublicDetail(PTDetailBase):
    """Hồ sơ công khai.

    Cố tình KHÔNG trả social_links: nếu học viên nhắn thẳng Zalo/Facebook thì
    không lead nào được ghi nhận, và không đo được nền tảng mang lại bao nhiêu
    khách cho PT — thứ duy nhất có thể đem đi bán. Form liên hệ phải là đường
    duy nhất. Khi có gói trả phí, cân nhắc mở lại cho PT đã trả tiền.
    """

    activity: PTActivity = PTActivity()


class PTSitemapItem(BaseModel):
    slug: str
    updated_at: datetime


class PTSearchResponse(BaseModel):
    items: List[PTListItem]
    total: int
    page: int
    page_size: int


class DailyLeadPoint(BaseModel):
    date: str  # YYYY-MM-DD
    count: int


class PTAnalytics(BaseModel):
    days: int
    leads_by_day: List[DailyLeadPoint]
    leads_in_window: int
    leads_total: int
    leads_new: int
    leads_contacted: int
    leads_closed: int
    leads_lost: int
    conversion_rate: float  # closed / total (all-time), 0..1
    profile_views: int
    avg_rating: float
    review_count: int
    rating_distribution: dict[int, int]  # star (1-5) -> count


class PTStats(BaseModel):
    profile_views: int
    leads_total: int
    leads_new: int
    leads_contacted: int
    leads_closed: int
    leads_lost: int
    leads_this_month: int
    avg_rating: float
    review_count: int
