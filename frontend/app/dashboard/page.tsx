"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ListingChecklist from "@/components/ListingChecklist";
import ShareProfile from "@/components/ShareProfile";
import RatingStars from "@/components/RatingStars";
import { apiFetch } from "@/lib/api";
import { LEAD_STATUS_LABELS } from "@/lib/constants";
import { timeAgo } from "@/lib/format";
import type { Lead, PTProfile, PTStats } from "@/lib/types";
import { useTranslations } from "next-intl";

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const [stats, setStats] = useState<PTStats | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [profile, setProfile] = useState<PTProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [statsData, leadsData, profileData] = await Promise.all([
          apiFetch<PTStats>("/api/pts/me/stats", { auth: true }),
          apiFetch<Lead[] | { items: Lead[] }>("/api/leads", { auth: true }),
          apiFetch<PTProfile>("/api/pts/me", { auth: true }),
        ]);
        setStats(statsData);
        const list = Array.isArray(leadsData) ? leadsData : leadsData.items ?? [];
        setLeads(list.slice(0, 5));
        setProfile(profileData);
      } catch {
        setError(t("loadFailed"));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="card h-24 animate-pulse bg-slate-100" />
        ))}
      </div>
    );
  }

  const cards = stats
    ? [
        { label: t("profileViews"), value: stats.profile_views, accent: "text-slate-900" },
        { label: t("leadsTotal"), value: stats.leads_total, accent: "text-slate-900" },
        { label: t("leadsThisMonth"), value: stats.leads_this_month, accent: "text-emerald-600" },
        { label: t("leadsNew"), value: stats.leads_new, accent: "text-blue-600" },
        { label: t("leadsContacted"), value: stats.leads_contacted, accent: "text-amber-600" },
        { label: t("leadsClosed"), value: stats.leads_closed, accent: "text-emerald-600" },
        { label: t("leadsLost"), value: stats.leads_lost, accent: "text-rose-500" },
      ]
    : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("heading")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("subtitle")}</p>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">{error}</div>}

      {/* Đặt trên các thẻ số liệu, và chỉ một trong hai:
          - Hồ sơ chưa đủ điều kiện → nói còn thiếu gì. Mọi con số bên dưới bằng
            0 vì lý do đó, không phải vì chợ vắng.
          - Hồ sơ đã hiển thị → việc kế tiếp là chia sẻ. Ở giai đoạn chưa có lưu
            lượng, chính PT là kênh phân phối hiệu quả nhất cho hồ sơ của họ. */}
      {profile &&
        (profile.suspended || (profile.missing_listing?.length ?? 0) > 0 ? (
          // Hồ sơ bị đình chỉ đã bị ẩn khỏi mọi chỗ công khai, nên mời PT đi
          // chia sẻ link của nó là gửi họ đi phát một đường dẫn trả 404.
          <ListingChecklist
            missing={profile.missing_listing ?? []}
            suspended={profile.suspended}
            suspendedReason={profile.suspended_reason}
            slug={profile.slug}
          />
        ) : (
          <ShareProfile slug={profile.slug} ptName={profile.full_name} />
        ))}

      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <div key={card.label} className="card p-4">
              <p className="text-sm text-slate-500">{card.label}</p>
              <p className={`mt-1 text-2xl font-bold ${card.accent}`}>{card.value ?? 0}</p>
            </div>
          ))}
          <div className="card p-4">
            <p className="text-sm text-slate-500">{t("avgRating")}</p>
            <div className="mt-1.5">
              <RatingStars rating={stats.avg_rating} count={stats.review_count} size="md" />
            </div>
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{t("latestLeads")}</h2>
          <Link href="/dashboard/leads" className="text-sm font-semibold text-emerald-600 hover:underline">
            {t("viewAll")}
          </Link>
        </div>
        {leads.length > 0 ? (
          <div className="card mt-3 divide-y divide-slate-100">
            {leads.map((lead) => (
              <div key={lead.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{lead.trainee_name}</p>
                  <p className="text-sm text-slate-500">
                    {[lead.goal, lead.area, lead.budget].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <a href={`tel:${lead.trainee_phone}`} className="text-sm font-medium text-emerald-600 hover:underline">
                  {lead.trainee_phone}
                </a>
                <span className="badge">{LEAD_STATUS_LABELS[lead.status] ?? lead.status}</span>
                <span className="text-xs text-slate-400">{timeAgo(lead.created_at)}</span>
              </div>
            ))}
          </div>
        ) : (
          !error && (
            <div className="card mt-3 p-8 text-center text-sm text-slate-500">
              <p>{t("emptyLeads")}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-3">
                <Link href="/requests" className="btn-primary">
                  {t("seeRequests")}
                </Link>
                <Link href="/dashboard/profile" className="btn-secondary">
                  {t("completeProfile")}
                </Link>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
