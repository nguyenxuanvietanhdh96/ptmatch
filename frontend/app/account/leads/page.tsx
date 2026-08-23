"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import { Loading, repeat, RowSkeleton } from "@/components/Skeleton";
import { ApiError, apiFetch } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import type { LeadStatus, MyLead } from "@/lib/types";
import { useTranslations } from "next-intl";

const STATUS_META: Record<LeadStatus, { key: string; cls: string }> = {
  new: { key: "statusNew", cls: "bg-sky-50 text-sky-700" },
  contacted: { key: "statusContacted", cls: "bg-amber-50 text-amber-700" },
  closed: { key: "statusClosed", cls: "bg-emerald-50 text-emerald-700" },
  lost: { key: "statusLost", cls: "bg-slate-100 text-slate-500" },
};

export default function MyLeadsPage() {
  const t = useTranslations("myLeads");
  const [leads, setLeads] = useState<MyLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Xem ghi chú ở account/favorites: nuốt lỗi rồi hiện trạng thái rỗng là nói
  // với người dùng một điều sai về dữ liệu của chính họ.
  const load = useCallback(() => {
    setLoading(true);
    setError("");
    apiFetch<MyLead[]>("/api/leads/mine", { auth: true })
      .then((data) => setLeads(data ?? []))
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

      {loading ? (
        <Loading label={t("loadingList")} className="mt-6 space-y-3">
          {repeat(3, () => (
            <RowSkeleton />
          ))}
        </Loading>
      ) : leads.length > 0 ? (
        <div className="mt-6 space-y-3">
          {leads.map((lead) => {
            const meta = STATUS_META[lead.status] ?? STATUS_META.new;
            return (
              <div key={lead.id} className="card flex items-center gap-4 p-4">
                <Avatar src={lead.pt_avatar_url} name={lead.pt_name} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/pt/${lead.pt_slug}`} className="font-semibold text-slate-900 hover:text-emerald-700">
                      {lead.pt_name}
                    </Link>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.cls}`}>{t(meta.key)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-slate-500">
                    {[lead.goal, lead.area, lead.budget].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-slate-400">{timeAgo(lead.created_at)}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card mt-6 flex flex-col items-center justify-center p-12 text-center">
          <svg className="h-12 w-12 text-slate-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
          <h2 className="mt-4 font-semibold text-slate-900">{t("emptyTitle")}</h2>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            {t("emptyBody")}
          </p>
          <Link href="/pts" className="btn-primary mt-4">{t("findPT")}</Link>
        </div>
      )}
    </div>
  );
}
