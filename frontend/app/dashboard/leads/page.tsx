"use client";

import { useEffect, useState } from "react";
import KanbanBoard from "@/components/KanbanBoard";
import { apiFetch, ApiError } from "@/lib/api";
import type { Lead, LeadStatus } from "@/lib/types";
import { useTranslations } from "next-intl";

export default function LeadsPage() {
  const t = useTranslations("dashboardLeads");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch<Lead[] | { items: Lead[] }>("/api/leads", { auth: true });
        setLeads(Array.isArray(data) ? data : data.items ?? []);
      } catch {
        setError(t("loadFailed"));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleStatusChange(lead: Lead, status: LeadStatus) {
    if (lead.status === status) return;
    const previousStatus = lead.status;
    // Optimistic update
    setLeads((ls) => ls.map((l) => (l.id === lead.id ? { ...l, status } : l)));
    setUpdatingId(lead.id);
    setError("");
    try {
      await apiFetch(`/api/leads/${lead.id}/status`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({ status }),
      });
    } catch (err) {
      // Chỉ hoàn tác ĐÚNG lead này. Trước đây chỗ này khôi phục cả mảng đã chụp
      // trước lúc gọi API, nên một lead lỗi sẽ xoá luôn các thay đổi thành công
      // của lead khác vừa xảy ra xen giữa.
      setLeads((ls) =>
        ls.map((l) => (l.id === lead.id ? { ...l, status: previousStatus } : l))
      );
      setError(err instanceof ApiError ? err.message : t("updateFailed"));
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("heading")}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("subtitle")}
        </p>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">{error}</div>}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : (
        <KanbanBoard leads={leads} onStatusChange={handleStatusChange} updatingId={updatingId} />
      )}
    </div>
  );
}
