"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { use, useCallback, useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import { Loading, repeat, Skeleton } from "@/components/Skeleton";
import { ApiError, apiFetch } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import type { LeadTracking } from "@/lib/types";

/**
 * Trang tra cứu yêu cầu tư vấn, mở bằng mã trong URL.
 *
 * Lý do tồn tại: form gửi lead quảng cáo "không cần tạo tài khoản", nên phần
 * lớn người gửi không có tài khoản nào để quay lại xem. Trước trang này, bấm
 * gửi xong là hết — không biết PT đã xem chưa, không báo lại được, không có
 * đường nào liên hệ tiếp. Mã trong URL cho họ đúng những thứ đó mà vẫn không
 * phải đăng ký.
 *
 * Render phía client: mã nằm trong URL nên không được để lọt vào cache của
 * CDN hay của Next. Trang cũng noindex (xem layout.tsx cùng thư mục).
 */


export default function TrackLeadPage(props: { params: Promise<{ token: string }> }) {
  const t = useTranslations("track");

  // Nhãn + ghi chú theo trạng thái, dựng trong thân component để lấy được t().
  const STATUS_INFO: Record<string, { label: string; note: string; cls: string }> = {
    new: { label: t("newLabel"), note: t("newNote"), cls: "bg-blue-50 text-blue-700 ring-blue-200" },
    contacted: { label: t("contactedLabel"), note: t("contactedNote"), cls: "bg-amber-50 text-amber-700 ring-amber-200" },
    closed: { label: t("closedLabel"), note: t("closedNote"), cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
    lost: { label: t("lostLabel"), note: t("lostNote"), cls: "bg-slate-100 text-slate-600 ring-slate-200" },
  };

  const { token } = use(props.params);
  const [lead, setLead] = useState<LeadTracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reporting, setReporting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    apiFetch<LeadTracking>(`/api/leads/track/${encodeURIComponent(token)}`)
      .then(setLead)
      .catch((err) =>
        setError(
          err instanceof ApiError && err.status === 404
            ? t("notFound")
            : t("loadFailed")
        )
      )
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function reportNoContact() {
    setReporting(true);
    try {
      const updated = await apiFetch<LeadTracking>(
        `/api/leads/track/${encodeURIComponent(token)}/no-contact`,
        { method: "POST", body: JSON.stringify({}) }
      );
      setLead(updated);
    } catch {
      setError(t("reportFailed"));
    } finally {
      setReporting(false);
    }
  }

  if (loading) {
    // Người vào đây phần lớn bấm từ tin nhắn Zalo/SMS, trên 4G, và họ đang muốn
    // biết PT đã liên hệ chưa. Skeleton giữ đúng khung thẻ trạng thái để lúc dữ
    // liệu về thì chỉ có chữ hiện lên, không có gì trượt chỗ.
    return (
      <Loading label={t("loadingOne")} className="mx-auto max-w-lg px-4 py-10 sm:px-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-2 h-4 w-32" />
        <div className="card mt-5 p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            <Skeleton className="h-7 w-36 rounded-full" />
            {repeat(2, () => (
              <Skeleton className="h-4 w-full" />
            ))}
          </div>
        </div>
      </Loading>
    );
  }

  if (error || !lead) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-slate-900">{t("errorHeading")}</h1>
        <p className="mt-2 text-sm text-slate-500">{error}</p>
        <Link href="/pts" className="btn-primary mt-6 inline-block">{t("findOther")}</Link>
      </div>
    );
  }

  // Fallback nếu backend thêm/đổi tên trạng thái sau này — trang tracking này
  // dùng bởi lead vô danh qua link SMS/Zalo, phải xuống cấp thanh thản thay vì
  // crash lúc STATUS_INFO[lead.status] undefined.
  const view = STATUS_INFO[lead.status] ?? {
    label: lead.status,
    note: "",
    cls: "bg-slate-100 text-slate-600 ring-slate-200",
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900">{t("heading")}</h1>
      <p className="mt-1 text-sm text-slate-500">{t("sentAt", { when: timeAgo(lead.created_at) })}</p>

      <div className="card mt-5 p-5">
        <Link href={`/pt/${lead.pt_slug}`} className="flex items-center gap-3 hover:opacity-80">
          <Avatar src={lead.pt_avatar_url} name={lead.pt_name} size={48} />
          <div>
            <p className="font-semibold text-slate-900">{lead.pt_name}</p>
            <p className="text-xs text-slate-500">{t("viewProfile")}</p>
          </div>
        </Link>

        <div className="mt-4 border-t border-slate-100 pt-4">
          <span className={`badge ring-1 ${view.cls}`}>{view.label}</span>
          <p className="mt-2 text-sm text-slate-600">{view.note}</p>
          {lead.first_response_at && (
            <p className="mt-1 text-xs text-slate-400">
              {t("acceptedAt", { when: timeAgo(lead.first_response_at) })}
            </p>
          )}
        </div>

        {(lead.goal || lead.area || lead.budget) && (
          <dl className="mt-4 space-y-1 border-t border-slate-100 pt-4 text-sm">
            {lead.goal && (
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-slate-400">{t("goal")}</dt>
                <dd className="text-slate-700">{lead.goal}</dd>
              </div>
            )}
            {lead.area && (
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-slate-400">{t("area")}</dt>
                <dd className="text-slate-700">{lead.area}</dd>
              </div>
            )}
            {lead.budget && (
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-slate-400">{t("budget")}</dt>
                <dd className="text-slate-700">{lead.budget}</dd>
              </div>
            )}
          </dl>
        )}
      </div>

      {/*
        Nút này là tín hiệu chất lượng đáng giá nhất thu được từ phía cầu.
        Trạng thái lead do chính PT chuyển, nên "đã liên hệ" không chứng minh
        được PT thật sự đã gọi. Một học viên bấm vào đây là bằng chứng ngược lại.
      */}
      <div className="card mt-4 p-5">
        {lead.reported_no_contact ? (
          <p className="text-sm text-slate-600">
            {t("reportedThanks")}
          </p>
        ) : (
          <>
            <p className="text-sm font-medium text-slate-900">{t("reportTitle")}</p>
            <p className="mt-1 text-sm text-slate-500">
              {t("reportBody")}
            </p>
            <button
              className="btn-secondary mt-3"
              onClick={reportNoContact}
              disabled={reporting}
            >
              {reporting ? t("reporting") : t("report")}
            </button>
          </>
        )}
        <Link href="/pts" className="mt-3 block text-sm font-semibold text-emerald-600 hover:underline">
          {t("findOtherArrow")}
        </Link>
      </div>
    </div>
  );
}
