"use client";

import { useState } from "react";
import { LEAD_STATUSES } from "@/lib/constants";
import { timeAgo } from "@/lib/format";
import type { Lead, LeadStatus } from "@/lib/types";
import { useTranslations } from "next-intl";

interface KanbanBoardProps {
  leads: Lead[];
  onStatusChange: (lead: Lead, status: LeadStatus) => void;
  updatingId?: string | null;
}

function LeadCard({
  lead,
  onStatusChange,
  updating,
}: {
  lead: Lead;
  onStatusChange: (lead: Lead, status: LeadStatus) => void;
  updating: boolean;
}) {
  const t = useTranslations("kanban");
  return (
    <div className="card flex items-start gap-4 p-4">
      {/* Avatar placeholder */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
        {lead.trainee_name.charAt(0)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-slate-900">{lead.trainee_name}</p>
            <a
              href={`tel:${lead.trainee_phone}`}
              className="mt-0.5 inline-flex items-center gap-1 text-sm font-medium text-emerald-600 hover:underline"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
              </svg>
              {lead.trainee_phone}
            </a>
          </div>
          {lead.created_at && (
            <span className="shrink-0 text-xs text-slate-400">{timeAgo(lead.created_at)}</span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
          {lead.goal && (
            <span><span className="text-slate-400">{t("goal")}</span> {lead.goal}</span>
          )}
          {lead.area && (
            <span><span className="text-slate-400">{t("area")}</span> {lead.area}</span>
          )}
          {lead.budget && (
            <span><span className="text-slate-400">{t("budget")}</span> {lead.budget}</span>
          )}
        </div>

        <div className="mt-3">
          <select
            className="input w-auto py-1.5 text-xs"
            value={lead.status}
            disabled={updating}
            onChange={(e) => onStatusChange(lead, e.target.value as LeadStatus)}
            aria-label={t("changeStatus")}
          >
            {LEAD_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

export default function KanbanBoard({ leads, onStatusChange, updatingId }: KanbanBoardProps) {
  const t = useTranslations("kanban");
  const [activeTab, setActiveTab] = useState<LeadStatus>("new");

  const counts = LEAD_STATUSES.reduce(
    (acc, s) => {
      acc[s.value] = leads.filter((l) => l.status === s.value).length;
      return acc;
    },
    {} as Record<string, number>,
  );

  const activeLeads = leads.filter((l) => l.status === activeTab);
  const activeStatus = LEAD_STATUSES.find((s) => s.value === activeTab)!;

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1">
        {LEAD_STATUSES.map((status) => {
          const isActive = activeTab === status.value;
          return (
            <button
              key={status.value}
              onClick={() => setActiveTab(status.value as LeadStatus)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
                isActive
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${status.dot}`} />
              <span className="hidden sm:inline">{status.label}</span>
              <span className="sm:hidden">{status.label.slice(0, 3)}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  isActive ? "bg-slate-100 text-slate-700" : "bg-transparent text-slate-400"
                }`}
              >
                {counts[status.value]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="mt-4">
        {activeLeads.length === 0 ? (
          <div className="card py-12 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <svg className="h-6 w-6 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25-2.25M12 13.875V7.5M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
            </div>
            <p className="text-sm text-slate-500">
              {t.rich("empty", { b: (c) => <strong>{c}</strong>, status: activeStatus.label })}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeLeads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                onStatusChange={onStatusChange}
                updating={updatingId === lead.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
