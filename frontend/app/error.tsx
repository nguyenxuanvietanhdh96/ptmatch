"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useTranslations } from "next-intl";

/**
 * Lưới đỡ cho lỗi render phía server/client.
 *
 * Quan trọng nhất với /pt/[slug]: trang đó cố ý ném tiếp mọi lỗi không phải 404
 * để một lần backend trục trặc không bị cache thành "PT này không tồn tại".
 * Đúng, nhưng không có ranh giới lỗi thì người xem nhận nguyên trang lỗi mặc
 * định của Next — trên chính bề mặt SEO quan trọng nhất của sản phẩm.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errorPage");
  useEffect(() => {
    // Ghi ra console để còn lần được trong báo cáo lỗi của trình duyệt; `digest`
    // là thứ nối được với log phía server.
    console.error("Page render error:", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-6xl font-extrabold text-emerald-600">{t("badge")}</p>
      <h1 className="mt-4 text-2xl font-bold text-slate-900">{t("heading")}</h1>
      <p className="mt-2 max-w-md text-slate-500">
        {t("body")}
      </p>
      <div className="mt-6 flex gap-3">
        <button onClick={reset} className="btn-primary">
          {t("retry")}
        </button>
        <Link href="/" className="btn-secondary">
          {t("home")}
        </Link>
      </div>
    </div>
  );
}
