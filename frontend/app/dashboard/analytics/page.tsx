"use client";

import { useEffect, useState } from "react";
import RatingStars from "@/components/RatingStars";
import { Refreshing } from "@/components/Skeleton";
import { apiFetch } from "@/lib/api";
import type { PTAnalytics } from "@/lib/types";
import { useTranslations } from "next-intl";

const RANGE_OPTIONS = [
  { days: 7, key: "range7" },
  { days: 30, key: "range30" },
  { days: 90, key: "range90" },
];

const STATUS_BARS: { key: keyof PTAnalytics; labelKey: string; color: string }[] = [
  { key: "leads_new", labelKey: "new", color: "bg-blue-500" },
  { key: "leads_contacted", labelKey: "contacted", color: "bg-amber-500" },
  { key: "leads_closed", labelKey: "closed", color: "bg-emerald-500" },
  { key: "leads_lost", labelKey: "lost", color: "bg-rose-400" },
];

function formatShortDate(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export default function AnalyticsPage() {
  const t = useTranslations("analytics");
  const [days, setDays] = useState(30);
  const [data, setData] = useState<PTAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    apiFetch<PTAnalytics>(`/api/pts/me/analytics?days=${days}`, { auth: true })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setError(t("loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const maxDaily = data ? Math.max(1, ...data.leads_by_day.map((p) => p.count)) : 1;
  const maxRating = data
    ? Math.max(1, ...Object.values(data.rating_distribution))
    : 1;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("heading")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("subtitle")}</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              onClick={() => setDays(opt.days)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                days === opt.days
                  ? "bg-emerald-600 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t(opt.key)}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">{error}</div>
      )}

      {/*
        `!data` chứ không `loading`, và Refreshing thay cho việc ẩn đi.

        Trước đây đổi khoảng thời gian (7/30/90 ngày) làm ẩn TOÀN BỘ phần dưới —
        thẻ số, biểu đồ theo ngày, phân bố sao — và thay bằng 4 ô skeleton cao
        24. Trang tụt từ hơn nghìn pixel xuống còn hơn trăm, thanh cuộn nhảy về,
        rồi bung lại khi dữ liệu về. Đó là cú giật mạnh nhất trong khu dashboard,
        mà nguyên nhân chỉ là một request thường mất vài trăm ms.
      */}
      {loading && !data && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card h-24 animate-pulse bg-slate-100" />
          ))}
        </div>
      )}

      {data && (
        <Refreshing busy={loading} className="space-y-8">
          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="card p-4">
              <p className="text-sm text-slate-500">{t("leadsInDays", { days })}</p>
              <p className="mt-1 text-2xl font-bold text-emerald-600">{data.leads_in_window}</p>
            </div>
            <div className="card p-4">
              <p className="text-sm text-slate-500">{t("closeRate")}</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {(data.conversion_rate * 100).toFixed(1)}%
              </p>
              <p className="text-xs text-slate-400">
                {data.leads_closed}/{data.leads_total} leads
              </p>
            </div>
            <div className="card p-4">
              <p className="text-sm text-slate-500">{t("profileViews")}</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{data.profile_views}</p>
            </div>
            <div className="card p-4">
              <p className="text-sm text-slate-500">{t("avgRating")}</p>
              <div className="mt-1.5">
                <RatingStars rating={data.avg_rating} count={data.review_count} size="md" />
              </div>
            </div>
          </div>

          {/* Leads per day bar chart */}
          <div className="card p-5">
            <h2 className="text-lg font-bold text-slate-900">{t("leadsByDay")}</h2>
            {data.leads_in_window === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                {t("noLeadsInRange")}
              </p>
            ) : (
              <div className="mt-4 flex h-44 items-end gap-px sm:gap-0.5">
                {data.leads_by_day.map((point) => (
                  <div
                    key={point.date}
                    className="group relative flex-1"
                    title={`${formatShortDate(point.date)}: ${point.count} lead`}
                  >
                    <div
                      className={`mx-auto w-full rounded-t ${
                        point.count > 0 ? "bg-emerald-500 group-hover:bg-emerald-600" : "bg-slate-100"
                      }`}
                      style={{
                        height: `${point.count > 0 ? Math.max(8, (point.count / maxDaily) * 160) : 4}px`,
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
            {data.leads_by_day.length > 0 && (
              <div className="mt-2 flex justify-between text-xs text-slate-400">
                <span>{formatShortDate(data.leads_by_day[0].date)}</span>
                <span>{formatShortDate(data.leads_by_day[data.leads_by_day.length - 1].date)}</span>
              </div>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Lead status funnel */}
            <div className="card p-5">
              <h2 className="text-lg font-bold text-slate-900">{t("funnel")}</h2>
              <div className="mt-4 space-y-3">
                {STATUS_BARS.map((bar) => {
                  const value = data[bar.key] as number;
                  const pct = data.leads_total > 0 ? (value / data.leads_total) * 100 : 0;
                  return (
                    <div key={bar.key}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="text-slate-600">{t(bar.labelKey)}</span>
                        <span className="font-semibold text-slate-900">
                          {value} <span className="font-normal text-slate-400">({pct.toFixed(0)}%)</span>
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${bar.color}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
                {data.leads_total === 0 && (
                  <p className="text-sm text-slate-500">{t("noLeads")}</p>
                )}
              </div>
            </div>

            {/* Rating distribution */}
            <div className="card p-5">
              <h2 className="text-lg font-bold text-slate-900">{t("ratingDist")}</h2>
              <div className="mt-4 space-y-3">
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = data.rating_distribution[star] ?? 0;
                  return (
                    <div key={star} className="flex items-center gap-3">
                      <span className="w-10 shrink-0 text-sm text-slate-600">{star} ★</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-amber-400"
                          style={{ width: `${(count / maxRating) * 100}%` }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right text-sm font-semibold text-slate-900">
                        {count}
                      </span>
                    </div>
                  );
                })}
                {data.review_count === 0 && (
                  <p className="text-sm text-slate-500">{t("noReviews")}</p>
                )}
              </div>
            </div>
          </div>
        </Refreshing>
      )}
    </div>
  );
}
