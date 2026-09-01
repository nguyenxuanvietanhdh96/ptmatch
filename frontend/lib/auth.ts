import type { User } from "./types";

const ACCESS_KEY = "pt_access_token";
const REFRESH_KEY = "pt_refresh_token";
const USER_KEY = "pt_user";

/**
 * Session marker read by middleware.ts, in the form `<role>.<expiryEpochSeconds>`.
 *
 * It deliberately holds no token: middleware only needs to know whether a
 * session is plausibly alive and what role it has, so it can redirect instead
 * of flashing a page the API will refuse. Anyone can forge this cookie — the
 * real authorisation is the Bearer token checked by the backend on every call.
 */
const COOKIE_NAME = "pt_session";
const LEGACY_COOKIE_NAME = "pt_token";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/** Expiry (epoch seconds) out of a JWT payload, without verifying it. */
function jwtExpiry(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json?.exp === "number" ? json.exp : null;
  } catch {
    return null;
  }
}

function writeCookie(name: string, value: string, maxAgeSeconds: number): void {
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${name}=${value}; path=/; max-age=${maxAgeSeconds}; samesite=lax${secure}`;
}

function deleteCookie(name: string): void {
  document.cookie = `${name}=; path=/; max-age=0`;
}

export function saveAuth(accessToken: string, refreshToken?: string | null, user?: User | null): void {
  if (!isBrowser()) return;
  localStorage.setItem(ACCESS_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));

  // The session lasts as long as the refresh token, not the (short) access token.
  const sessionToken = refreshToken || getRefreshToken() || accessToken;
  const expiry = jwtExpiry(sessionToken);
  const role = (user ?? getUser())?.role ?? "";
  // Math.floor: cookie chỉ cần độ chính xác GIÂY, còn `exp` từ backend là epoch
  // float. Ghi nguyên số thực vào đây tạo ra hai dấu chấm trong giá trị cookie,
  // và middleware.ts phải ngắt đúng chỗ mới đọc được — chặn ngay tại nguồn thì
  // định dạng `<role>.<epochSeconds>` luôn có đúng một dấu chấm.
  const expirySeconds = expiry === null ? null : Math.floor(expiry);
  const maxAge = expirySeconds ? Math.max(0, expirySeconds - Math.floor(Date.now() / 1000)) : 0;
  if (maxAge > 0) {
    writeCookie(COOKIE_NAME, `${role}.${expirySeconds}`, maxAge);
  }
  deleteCookie(LEGACY_COOKIE_NAME);
}

export function getAccessToken(): string | null {
  if (!isBrowser()) return null;
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (!isBrowser()) return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function getUser(): User | null {
  if (!isBrowser()) return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function clearAuth(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  deleteCookie(COOKIE_NAME);
  deleteCookie(LEGACY_COOKIE_NAME);
}

export function isLoggedIn(): boolean {
  return !!getAccessToken();
}

/**
 * Lọc tham số `next` trước khi điều hướng sau đăng nhập.
 *
 * Chỉ kiểm tra `startsWith("/")` là chưa đủ: "//evil.com" và "/\evil.com" đều
 * bắt đầu bằng "/" nhưng trình duyệt hiểu là URL giao thức tương đối và rời
 * khỏi site. Kết quả là link `ptmatch.vn/login?next=//evil.com` hiện trang
 * đăng nhập thật rồi thả nạn nhân vào bản sao của kẻ tấn công — đúng thứ khiến
 * lừa đảo thuyết phục.
 *
 * Trả về `fallback` khi giá trị không phải đường dẫn nội bộ tuyệt đối.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback;
  // Ký tự thứ hai là "/" hoặc "\" -> giao thức tương đối, đi ra ngoài site.
  if (next.length > 1 && (next[1] === "/" || next[1] === "\\")) return fallback;
  return next;
}
