"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import PTCard from "@/components/PTCard";
import { Loading, PTCardSkeleton, repeat } from "@/components/Skeleton";
import { ApiError, apiFetch } from "@/lib/api";
import type { PTSummary } from "@/lib/types";
import { useTranslations } from "next-intl";

export default function FavoritesPage() {
  const t = useTranslations("favorites");
  const [pts, setPts] = useState<PTSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Lỗi tải phải hiện ra, không được nuốt.
  //
  // Trước đây `.catch(() => {})` biến mọi thất bại thành trạng thái rỗng, nên
  // API lỗi lại hiển thị "Chưa lưu PT nào" — người dùng tưởng danh sách đã lưu
  // của mình bốc hơi, và không có nút nào để thử lại.
  const load = useCallback(() => {
    setLoading(true);
    setError("");
    apiFetch<PTSummary[]>("/api/favorites", { auth: true })
      .then((data) => setPts(data ?? []))
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : t("retryError"))
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">{t("heading")}</h1>
      <p className="mt-1 text-sm text-slate-500">{t("subtitle")}</p>

      {error ? (
        <div className="card mt-6 flex flex-col items-center justify-center p-12 text-center">
          <h2 className="font-semibold text-slate-900">{t("loadFailed")}</h2>
          <p className="mt-1 max-w-sm text-sm text-slate-500">{error}</p>
          <button className="btn-secondary mt-4" onClick={load}>
            {t("retry")}
          </button>
        </div>
      ) : loading ? (
        <Loading
          label={t("loadingList")}
          className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          {repeat(3, () => (
            <PTCardSkeleton />
          ))}
        </Loading>
      ) : pts.length > 0 ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {pts.map((pt) => (
            <PTCard key={pt.id ?? pt.slug} pt={pt} />
          ))}
        </div>
      ) : (
        <div className="card mt-6 flex flex-col items-center justify-center p-12 text-center">
          <svg className="h-12 w-12 text-slate-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
          </svg>
          <h2 className="mt-4 font-semibold text-slate-900">{t("emptyTitle")}</h2>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            {t.rich("emptyBody", { heart: (c) => <span className="font-medium text-rose-500">{c}</span> })}
          </p>
          <Link href="/pts" className="btn-primary mt-4">{t("findPT")}</Link>
        </div>
      )}
    </div>
  );
}
