/**
 * Lớp gửi sự kiện dùng chung cho GA4 / Plausible / Facebook Pixel.
 *
 * Nhà cung cấp nào không cấu hình biến môi trường thì script không được nạp và
 * lời gọi ở đây tự động là no-op — nên chỗ gọi không cần biết đang dùng cái nào.
 *
 * Lưu ý: NEXT_PUBLIC_* được nhúng vào bundle lúc **build**, không phải lúc chạy.
 * Muốn đổi ID phải build lại image (xem frontend/Dockerfile).
 */

type EventProps = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (command: string, ...args: unknown[]) => void;
    plausible?: (event: string, options?: { props?: EventProps }) => void;
    fbq?: (command: string, ...args: unknown[]) => void;
  }
}

export const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID || "";
export const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN || "";
export const FB_PIXEL_ID = process.env.NEXT_PUBLIC_FB_PIXEL_ID || "";

/**
 * GA4 trực tiếp. Bỏ qua khi đã dùng GTM — để GTM quản lý thẻ GA4, tránh đếm đôi.
 */
export const GA_ID = GTM_ID ? "" : process.env.NEXT_PUBLIC_GA_ID || "";

export const ANALYTICS_ENABLED = Boolean(
  GTM_ID || GA_ID || PLAUSIBLE_DOMAIN || FB_PIXEL_ID
);

/** Tên sự kiện của phễu — giữ tập trung để báo cáo không bị lệch chính tả. */
export const EVENTS = {
  searchPTs: "search_pts",
  viewProfile: "view_pt_profile",
  leadFormStart: "lead_form_start",
  leadSubmit: "lead_submit_success",
  /** Bấm thanh CTA ghim đáy trên mobile — đo xem lối tắt này có được dùng không. */
  leadCtaMobile: "lead_cta_mobile_click",
  /** Bấm "đăng yêu cầu" từ màn hình tìm kiếm không ra kết quả nào. */
  emptySearchToRequest: "empty_search_to_request",
  /** PT chia sẻ hồ sơ của mình — kênh phân phối rẻ nhất khi chưa có lưu lượng. */
  shareProfile: "share_profile",
} as const;

function clean(props: EventProps): EventProps {
  return Object.fromEntries(
    Object.entries(props).filter(([, value]) => value !== undefined && value !== "")
  );
}

export function track(event: string, props: EventProps = {}): void {
  if (typeof window === "undefined") return;
  const payload = clean(props);

  // Luôn đẩy vào dataLayer: nếu sau này gắn GTM thì chỉ cần thêm snippet
  // container, mọi sự kiện đã có sẵn ở đây mà không phải sửa chỗ gọi nào.
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...payload });

  window.gtag?.("event", event, payload);
  window.plausible?.(event, { props: payload });
  window.fbq?.("trackCustom", event, payload);
}

/**
 * Lead gửi thành công — sự kiện quan trọng nhất của cả hệ thống.
 *
 * Ngoài sự kiện tuỳ chỉnh, bắn thêm `Lead` (sự kiện chuẩn của Facebook) để
 * chiến dịch quảng cáo có thể tối ưu theo chuyển đổi thật.
 */
export function trackLead(props: EventProps = {}): void {
  if (typeof window === "undefined") return;
  track(EVENTS.leadSubmit, props);
  window.fbq?.("track", "Lead", clean(props));
}
