"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { Role } from "@/lib/types";

type Provider = "google" | "facebook" | "zalo";

const ALL_PROVIDERS: Provider[] = ["google", "facebook", "zalo"];

// Tailwind quét class dưới dạng chuỗi tĩnh trong mã nguồn, nên `sm:grid-cols-${n}`
// sẽ bị loại khỏi bundle. Tra bảng để mọi lớp đều xuất hiện nguyên vẹn.
const COLUMNS: Record<number, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
};

interface Props {
  role: Role;
  /** Đường dẫn muốn về lại sau khi đăng nhập (đã có ở luồng mật khẩu qua
   * `?next=`) — mang qua backend rồi vòng lại `/auth/callback` để không rớt
   * mất so với luồng mật khẩu. */
  next?: string;
}

// Trống = cùng origin, xem apiBase() trong lib/api.ts.
const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

function oauthUrl(provider: Provider, role: Role, next?: string) {
  const params = new URLSearchParams({ role });
  if (next) params.set("next", next);
  return `${API_URL}/api/auth/${provider}/login?${params.toString()}`;
}

/**
 * Provider nào được hiện là do BACKEND quyết định (GET /api/auth/oauth/providers).
 *
 * Trước đây ba nút được vẽ cứng, trong khi provider thiếu credential trả 503 —
 * người dùng bấm vào rơi thẳng vào trang JSON lỗi trần, ngay tại bước đăng ký,
 * chỗ đắt nhất để mất người dùng.
 *
 * `null` = chưa biết. Trong lúc đó không vẽ gì cả: hiện nút rồi rút lại còn khó
 * chịu hơn, và nút biến mất dưới ngón tay đang bấm là cách chắc chắn để người
 * dùng bấm nhầm. Hỏng mạng cũng giữ nguyên `null` — mất tạm mấy nút đăng nhập
 * mạng xã hội là thiệt hại nhỏ hơn nhiều so với một nút dẫn tới trang lỗi, và
 * form email/mật khẩu ngay trên vẫn dùng được.
 */
export default function OAuthButtons({ role, next }: Props) {
  const t = useTranslations("oauth");
  const [enabled, setEnabled] = useState<Provider[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`${API_URL}/api/auth/oauth/providers`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive || !data) return;
        const list = Array.isArray(data.providers) ? data.providers : [];
        setEnabled(ALL_PROVIDERS.filter((p) => list.includes(p)));
      })
      .catch(() => {
        /* giữ null — xem ghi chú ở đầu component */
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!enabled || enabled.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="relative flex items-center">
        <div className="flex-1 border-t border-slate-200" />
        <span className="mx-3 text-xs text-slate-400">{t("divider")}</span>
        <div className="flex-1 border-t border-slate-200" />
      </div>

      <div className={`grid grid-cols-1 gap-2 ${COLUMNS[enabled.length] ?? "sm:grid-cols-3"}`}>
        {enabled.includes("google") && (
        <a
          href={oauthUrl("google", role, next)}
          className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 hover:border-slate-300"
        >
          <GoogleIcon />
          Google
        </a>
        )}

        {enabled.includes("facebook") && (
        <a
          href={oauthUrl("facebook", role, next)}
          className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 hover:border-slate-300"
        >
          <FacebookIcon />
          Facebook
        </a>
        )}

        {enabled.includes("zalo") && (
        <a
          href={oauthUrl("zalo", role, next)}
          className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 hover:border-slate-300"
        >
          <ZaloIcon />
          Zalo
        </a>
        )}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="#1877F2">
      <path d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.313 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
    </svg>
  );
}

/**
 * Biểu tượng Zalo — bong bóng hội thoại màu xanh thương hiệu.
 *
 * ĐÂY KHÔNG PHẢI logo chính thức của Zalo, mà là hình thay thế sạch sẽ. Muốn
 * dùng đúng logo thì tải SVG từ bộ nhận diện của Zalo rồi thay vào path bên
 * dưới — logo thương hiệu có quy định sử dụng riêng, không nên vẽ phỏng.
 *
 * Bản trước tự chế: một ô vuông xanh + chữ "Z" đặt bằng thẻ <text> + ba vạch
 * trắng. Nó hỏng theo hai cách. Thứ nhất, <text> phụ thuộc font của máy người
 * xem và ở cỡ 16px thì chữ Z chỉ còn khoảng 6px — mờ và lệch mỗi máy một kiểu.
 * Thứ hai, ba vạch trắng đọc ra thành icon menu hamburger, nên cả nút trông
 * như "ô vuông xanh có menu" chứ không giống Zalo.
 *
 * Vẽ bằng path đặc nên nét ăn đúng pixel ở mọi cỡ, và bỏ nền vuông để đồng bộ
 * với hai icon còn lại (Google, Facebook đều là glyph không nền). Chữ "Zalo"
 * ngay cạnh nút đã làm việc nhận diện.
 */
function ZaloIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="#0068FF" aria-hidden="true">
      <path d="M12 2C6.201 2 1.5 5.925 1.5 10.767c0 2.76 1.53 5.223 3.923 6.833-.146 1.36-.606 2.62-1.362 3.766a.4.4 0 00.404.616c2.16-.38 3.85-1.17 5.05-1.99.802.184 1.638.28 2.485.28 5.799 0 10.5-3.925 10.5-8.767S17.799 2 12 2z" />
    </svg>
  );
}
