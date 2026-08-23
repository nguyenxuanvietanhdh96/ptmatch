"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useRef, Suspense } from "react";
import { apiFetch } from "@/lib/api";
import { safeNextPath, saveAuth } from "@/lib/auth";
import type { OAuthAuthResponse } from "@/lib/types";
import { useTranslations } from "next-intl";

function OAuthCallbackHandler() {
  const t = useTranslations("authCallback");
  const searchParams = useSearchParams();
  const router = useRouter();
  // Mã chỉ đổi được một lần; React 18 StrictMode gọi effect hai lần trong dev,
  // lần thứ hai sẽ nhận "mã đã hết hạn" và đá người dùng về trang đăng nhập.
  const exchanged = useRef(false);

  useEffect(() => {
    if (exchanged.current) return;
    exchanged.current = true;

    const code = searchParams.get("code");

    if (!code) {
      router.replace("/login?oauth_error=" + encodeURIComponent(t("failedShort")));
      return;
    }

    // Token về trong body của POST, không bao giờ đi qua URL — xem ghi chú ở
    // _handle_oauth_callback (backend/app/api/auth.py).
    apiFetch<OAuthAuthResponse>("/api/auth/oauth/exchange", {
      method: "POST",
      body: JSON.stringify({ code }),
    })
      .then((data) => {
        saveAuth(data.access_token, data.refresh_token, data.user);
        // Tài khoản vừa được TẠO thì phải hỏi lại vai trò trước khi đi tiếp.
        //
        // Vai trò chỉ ghi được một lần, và người bấm nút SNS ở trang /login
        // không hề chọn gì — mặc định "học viên". Không có nhánh này thì mọi PT
        // vào bằng đường đó đều thành học viên vĩnh viễn. Xem
        // app/(auth)/welcome/page.tsx.
        // Tài khoản mới luôn phải qua /welcome để chọn vai trò trước — không
        // có gì để "về lại" nữa vì họ chưa từng ở trang được bảo vệ nào.
        const next = data.is_new ? "" : safeNextPath(searchParams.get("next"), "");
        if (data.is_new) {
          router.replace("/welcome");
        } else if (next) {
          router.replace(next);
        } else if (data.user?.role === "pt") {
          router.replace("/dashboard");
        } else {
          router.replace("/account/favorites");
        }
        router.refresh();
      })
      .catch(() => {
        router.replace("/login?oauth_error=" + encodeURIComponent(t("failed")));
      });
  }, [searchParams, router]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
      <p className="text-sm text-slate-500">{t("finishing")}</p>
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense>
      <OAuthCallbackHandler />
    </Suspense>
  );
}
