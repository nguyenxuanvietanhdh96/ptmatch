import type { LeadStatus } from "./types";

/**
 * Tỉnh/thành PTMatch đang hoạt động. Tên phải khớp danh mục hành chính
 * (public/vn-locations/provinces.json).
 *
 * Giai đoạn kiểm chứng chỉ mở TP.HCM + Đồng Nai: chợ hai chiều sống bằng mật
 * độ, không bằng độ phủ. Sau sáp nhập 01/07/2025, hai tỉnh này đã bao trọn
 * Bình Dương, Bà Rịa - Vũng Tàu và Bình Phước — 263 phường/xã.
 *
 * MẢNG RỖNG = bỏ giới hạn, hiện đủ 34 tỉnh.
 *
 * Backend có bản sao ở settings.served_provinces và là bên THỰC SỰ chặn (ở đây
 * chỉ là UI). Không dùng chung một nguồn được vì biến NEXT_PUBLIC_* nhúng lúc
 * build — nên đổi một bên thì phải đổi bên kia, và build lại image frontend.
 */
export const SERVED_PROVINCES: string[] = [
  "Thành phố Hồ Chí Minh",
  "Tỉnh Đồng Nai",
];

/** Viết tắt không thể nhầm của các tỉnh đang mở, đã chuẩn hoá sẵn.
 *  Giữ đồng bộ với _ALIASES ở backend/app/services/coverage.py. */
const PROVINCE_ALIASES: Record<string, string> = {
  hcm: "ho chi minh",
  tphcm: "ho chi minh",
  "tp.hcm": "ho chi minh",
  "sai gon": "ho chi minh",
  saigon: "ho chi minh",
};

/** Bỏ dấu + bỏ tiền tố "Thành phố"/"Tỉnh"/"TP." + gộp viết tắt, để so tên tỉnh
 *  một cách khoan dung. Giữ đồng bộ với _normalize()/_match_key() ở
 *  backend/app/services/coverage.py — hai bên lệch nhau thì ô chọn cho qua mà
 *  API lại từ chối, hoặc ngược lại. */
export function normalizeProvinceName(name: string): string {
  const key = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/gi, "d")
    .toLowerCase()
    .replace(/^(thanh pho|tinh|tp)\.?\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  return PROVINCE_ALIASES[key] ?? key;
}

const SERVED_KEYS = new Set(SERVED_PROVINCES.map(normalizeProvinceName));

export function isServedProvince(name: string): boolean {
  if (SERVED_PROVINCES.length === 0) return true;
  return SERVED_KEYS.has(normalizeProvinceName(name));
}

export const SPECIALTIES: { slug: string; label: string }[] = [
  { slug: "weight_loss", label: "Giảm cân" },
  { slug: "muscle_gain", label: "Tăng cơ" },
  { slug: "bodybuilding", label: "Bodybuilding" },
  { slug: "female_fitness", label: "Fitness cho nữ" },
  { slug: "beginner", label: "Người mới bắt đầu" },
  { slug: "senior", label: "Người lớn tuổi" },
  { slug: "rehab", label: "Phục hồi chấn thương" },
  { slug: "online_coaching", label: "Online Coaching" },
];

export const SPECIALTY_LABELS: Record<string, string> = Object.fromEntries(
  SPECIALTIES.map((s) => [s.slug, s.label])
);

/**
 * Slug -> chữ đọc được, cho những giá trị KHÔNG có trong danh mục.
 *
 * Backend cố ý cho phép chuyên môn tự do (`_SLUG_RE` ở schemas/pt.py chấp nhận
 * mọi chuỗi `[a-z0-9_]+`), nên "cross_fit", "muay_thai", "yoga" là dữ liệu hợp
 * lệ. Trước đây fallback trả về NGUYÊN slug, và nó chảy ra tận những nơi khó
 * chữa nhất: badge trên hồ sơ, meta description, tiêu đề trang `/pts`, và
 * `knowsAbout`/`serviceType` trong JSON-LD — tức Google và các engine sinh nội
 * dung đọc được "cross_fit" như thể đó là tên chuyên môn.
 *
 * Vì regex chỉ cho ASCII, chuỗi vào đây không bao giờ có dấu tiếng Việt, nên
 * viết hoa từng từ là an toàn và đọc đúng với phần lớn trường hợp thật
 * ("cross_fit" -> "Cross Fit", "muay_thai" -> "Muay Thai").
 */
function humanizeSlug(slug: string): string {
  return slug
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function specialtyLabel(slug: string): string {
  return SPECIALTY_LABELS[slug] ?? humanizeSlug(slug);
}

// Backend có đủ ba giá trị (male/female/other — enum Gender ở models/pt_profile.py).
// Thiếu "other" ở đây làm hồ sơ hiện đúng chữ "other" trên trang công khai, vì
// chỗ gọi fallback về chính giá trị thô.
export const GENDER_LABELS: Record<string, string> = {
  male: "Nam",
  female: "Nữ",
  other: "Khác",
};

export function genderLabel(value: string): string {
  return GENDER_LABELS[value] ?? humanizeSlug(value);
}

export const LEAD_STATUSES: {
  value: LeadStatus;
  label: string;
  color: string;
  dot: string;
}[] = [
  { value: "new", label: "Mới", color: "bg-blue-50 border-blue-200", dot: "bg-blue-500" },
  { value: "contacted", label: "Đã liên hệ", color: "bg-amber-50 border-amber-200", dot: "bg-amber-500" },
  { value: "closed", label: "Đã chốt", color: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-500" },
  { value: "lost", label: "Thất bại", color: "bg-rose-50 border-rose-200", dot: "bg-rose-400" },
];

export const LEAD_STATUS_LABELS: Record<string, string> = {
  new: "Mới",
  contacted: "Đã liên hệ",
  closed: "Đã chốt",
  lost: "Thất bại",
};

export const PRICE_OPTIONS: { value: string; label: string }[] = [
  { value: "200000", label: "200.000đ" },
  { value: "300000", label: "300.000đ" },
  { value: "500000", label: "500.000đ" },
  { value: "700000", label: "700.000đ" },
  { value: "1000000", label: "1.000.000đ" },
  { value: "2000000", label: "2.000.000đ" },
];

export const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "rating", label: "Đánh giá cao nhất" },
  { value: "price_asc", label: "Giá thấp đến cao" },
  { value: "price_desc", label: "Giá cao đến thấp" },
  { value: "experience", label: "Kinh nghiệm nhiều nhất" },
];
