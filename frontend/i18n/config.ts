/**
 * Cấu hình đa ngôn ngữ.
 *
 * Hiện chỉ có tiếng Việt, nhưng mọi chuỗi hiển thị đều đi qua lớp này để thêm
 * ngôn ngữ về sau là việc dịch một file JSON, không phải đi sửa lại từng
 * component.
 *
 * VÌ SAO CHƯA CÓ TIỀN TỐ NGÔN NGỮ TRONG URL:
 *
 * Hôm nay chỉ một ngôn ngữ, nên `/pts` giữ nguyên `/pts` — không ai phải chịu
 * thêm một chặng chuyển hướng `/vi/pts` cho một site chỉ nói tiếng Việt, và
 * cũng không phải đổi lại toàn bộ đường dẫn lần nữa.
 *
 * KHI THÊM NGÔN NGỮ THỨ HAI, làm đúng ba việc:
 *
 *   1. Thêm mã ngôn ngữ vào `LOCALES` và tạo `messages/<mã>.json`.
 *   2. Bật định tuyến của next-intl với `localePrefix: "as-needed"` — tiếng
 *      Việt (mặc định) giữ URL trần, ngôn ngữ mới nhận tiền tố `/en/...`. Nhờ
 *      vậy mọi link đã chia sẻ và mọi trang Google đã lập chỉ mục không gãy.
 *   3. Thêm thẻ `hreflang` vào `alternates.languages` ở metadata gốc.
 *
 * `resolveLocale()` là chỗ duy nhất quyết định ngôn ngữ nào được dùng. Lúc đó
 * chỉ cần sửa đúng hàm này để đọc từ URL / cookie / `Accept-Language`.
 */
export const LOCALES = ["vi"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "vi";

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

/**
 * Ngôn ngữ dùng cho request hiện tại.
 *
 * Còn một lựa chọn nên luôn trả về nó. Giữ hàm riêng (thay vì rải
 * `DEFAULT_LOCALE` khắp nơi) để việc thêm ngôn ngữ chỉ đụng vào một chỗ.
 */
export function resolveLocale(): Locale {
  return DEFAULT_LOCALE;
}

/**
 * Phân vùng catalog trước khi gửi xuống trình duyệt.
 *
 * `NextIntlClientProvider` tuần tự hoá mọi thứ ta đưa vào nó thành payload của
 * TRANG. Đưa cả catalog vào là mỗi lượt tải trang chủ phải cõng toàn văn chính
 * sách bảo mật, điều khoản và mọi chuỗi của dashboard — đo thật: /for-trainers
 * từng nặng 123KB HTML vì chuyện đó.
 *
 * Ba nhóm:
 *
 *   - SERVER_ONLY: văn bản dài và metadata, chỉ server component đọc. Không bao
 *     giờ gửi.
 *   - AUTH_ONLY: chỉ xuất hiện sau khi đăng nhập (/dashboard, /account). Trang
 *     công khai không cần, nên chỉ gửi ở layout của hai khu đó.
 *   - Còn lại: dùng chung, gửi ở layout gốc.
 *
 * VÌ SAO LÀ DANH SÁCH LOẠI TRỪ, KHÔNG PHẢI DANH SÁCH CHO PHÉP:
 *
 * Bản đầu liệt kê namespace được phép gửi. Nó hỏng ngay lần thêm namespace kế
 * tiếp: quên một dòng là client component mất chuỗi và **trang trắng sau khi
 * hydrate**, mà server vẫn render đúng nên lỗi không lộ ra ở HTML nguồn.
 *
 * Chiều này an toàn hơn: quên thêm vào SERVER_ONLY/AUTH_ONLY chỉ khiến payload
 * nặng thêm vài KB. Quên bớt khỏi AUTH_ONLY thì chỉ khu đăng nhập bị ảnh hưởng,
 * và lộ ra ngay khi mở dashboard.
 */
export const SERVER_ONLY_NAMESPACES = [
  "privacy",
  "terms",
  "forTrainers",
  "home",
  "meta",
  "ptProfile",
  "ptSearch",
  "ogImage",
  "notFound",
] as const;

export const AUTH_ONLY_NAMESPACES = [
  "dashboardNav",
  "dashboard",
  "dashboardLeads",
  "dashboardReviews",
  "kanban",
  "analytics",
  "portfolio2",
  "profileEditor",
  "accountNav",
  "favorites",
  "myLeads",
  "myRequests",
  "myReviews",
] as const;

function omit(all: Record<string, unknown>, drop: readonly string[]): Record<string, unknown> {
  const blocked = new Set<string>(drop);
  return Object.fromEntries(Object.entries(all).filter(([ns]) => !blocked.has(ns)));
}

/** Dùng ở layout gốc: bỏ cả phần chỉ-server lẫn phần sau-đăng-nhập. */
export function publicMessages(all: Record<string, unknown>): Record<string, unknown> {
  return omit(all, [...SERVER_ONLY_NAMESPACES, ...AUTH_ONLY_NAMESPACES]);
}

/**
 * Dùng ở layout /dashboard và /account: thêm lại phần sau-đăng-nhập.
 *
 * Provider lồng nhau THAY THẾ context chứ không gộp, nên hàm này phải trả về cả
 * phần dùng chung — thiếu là mọi component dùng chung bên trong dashboard mất chuỗi.
 */
export function authMessages(all: Record<string, unknown>): Record<string, unknown> {
  return omit(all, SERVER_ONLY_NAMESPACES);
}
