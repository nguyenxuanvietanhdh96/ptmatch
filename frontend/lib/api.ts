import { clearAuth, getAccessToken, getRefreshToken, saveAuth } from "./auth";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Browser dùng NEXT_PUBLIC_API_URL, server-side (SSR) dùng API_INTERNAL_URL */
export function apiBase(): string {
  if (typeof window === "undefined") {
    return process.env.API_INTERNAL_URL || "http://backend:8000";
  }
  // Trống = cùng origin, đi qua rewrite /api trong next.config. Đó là mặc định
  // vì nó đúng với mọi cách vào site; chỉ đặt NEXT_PUBLIC_API_URL khi API nằm
  // ở domain khác thật.
  return process.env.NEXT_PUBLIC_API_URL || "";
}

export interface ApiOptions extends RequestInit {
  /** Gắn Bearer token + tự refresh khi 401 */
  auth?: boolean;
  /**
   * Khi refresh cũng fail (phiên chết thật): mặc định điều hướng cứng sang
   * /login. Đặt `false` cho các lệnh gọi NỀN (poll số liệu badge, v.v.) — vẫn
   * `clearAuth()` để không tiếp tục gọi API với token đã chết, nhưng không ép
   * người dùng rời trang công khai họ đang đọc/form họ đang điền chỉ vì một
   * badge hết phiên chạy ngầm.
   */
  redirectOnAuthFailure?: boolean;
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.detail === "string") return data.detail;
    if (Array.isArray(data?.detail) && data.detail[0]?.msg) {
      return String(data.detail[0].msg).replace(/^Value error, /i, "");
    }
    if (typeof data?.message === "string") return data.message;
  } catch {
    /* ignore */
  }
  return `Yêu cầu thất bại (mã ${res.status})`;
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${apiBase()}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) {
        // Refresh tokens rotate server-side, so a second tab may have already
        // spent this one. If storage now holds a newer token, the session is
        // alive and this failure is just the race, not a logout.
        const current = getRefreshToken();
        return !!current && current !== refreshToken;
      }
      const data = await res.json();
      if (!data?.access_token) return false;
      saveAuth(data.access_token, data.refresh_token ?? refreshToken, data.user ?? undefined);
      return true;
    } catch {
      return false;
    } finally {
      // cho phép refresh lần sau
      setTimeout(() => {
        refreshPromise = null;
      }, 0);
    }
  })();
  return refreshPromise;
}

/**
 * Wrapper fetch chung cho API backend.
 * - Tự chọn base URL theo môi trường (browser / SSR)
 * - auth: true -> gắn Bearer, tự refresh khi 401 rồi retry 1 lần, logout nếu refresh fail
 */
export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { auth = false, headers, ...rest } = options;

  const doFetch = async (): Promise<Response> => {
    const h: Record<string, string> = { ...(headers as Record<string, string> | undefined) };
    if (rest.body && typeof rest.body === "string" && !h["Content-Type"]) {
      h["Content-Type"] = "application/json";
    }
    if (auth) {
      const token = getAccessToken();
      if (token) h["Authorization"] = `Bearer ${token}`;
    }
    // Default to no-store; callers that want ISR pass their own cache/next opts.
    return fetch(`${apiBase()}${path}`, { cache: "no-store", ...rest, headers: h });
  };

  let res: Response;
  try {
    res = await doFetch();
  } catch {
    throw new ApiError(0, "Không thể kết nối tới máy chủ. Vui lòng thử lại sau.");
  }

  if (res.status === 401 && auth && typeof window !== "undefined") {
    const ok = await tryRefresh();
    if (ok) {
      res = await doFetch();
    } else {
      clearAuth();
      const shouldRedirect = options.redirectOnAuthFailure !== false;
      if (shouldRedirect && !window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
      throw new ApiError(401, "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, await parseError(res));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Đăng xuất: thu hồi refresh token phía server rồi xoá state cục bộ.
 * Access token còn lại sống tới khi hết hạn, nên luôn xoá local kể cả khi
 * gọi API thất bại.
 */
export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken();
  if (refreshToken) {
    try {
      await fetch(`${apiBase()}/api/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    } catch {
      /* mất mạng thì vẫn đăng xuất phía client */
    }
  }
  clearAuth();
}

/** Ghép query string, bỏ qua giá trị rỗng/undefined */
export function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    sp.set(key, String(value));
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

/** Upload file qua presign flow: POST /api/upload/presign -> PUT file -> trả về public_url */
export async function uploadFile(file: File): Promise<string> {
  const presign = await apiFetch<{
    upload_url: string;
    method: string;
    headers?: Record<string, string>;
    public_url: string;
    requires_auth?: boolean;
  }>("/api/upload/presign", {
    method: "POST",
    auth: true,
    body: JSON.stringify({ filename: file.name, content_type: file.type || "application/octet-stream" }),
  });

  const putHeaders: Record<string, string> = {
    "Content-Type": file.type || "application/octet-stream",
    ...(presign.headers || {}),
  };
  // Local dev endpoint is our own API and requires the Bearer token. A GCS
  // signed URL carries its auth in the query string — adding a header there
  // would invalidate the signature.
  if (presign.requires_auth) {
    const token = getAccessToken();
    if (token) putHeaders["Authorization"] = `Bearer ${token}`;
  }

  const putRes = await fetch(presign.upload_url, {
    method: "PUT",
    headers: putHeaders,
    body: file,
  });
  if (!putRes.ok) {
    throw new ApiError(putRes.status, "Tải ảnh lên thất bại. Vui lòng thử lại.");
  }
  return presign.public_url;
}
