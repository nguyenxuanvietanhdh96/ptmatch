"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import PTModerationActions from "@/components/PTModerationActions";
import { Loading, Refreshing, repeat, Skeleton, StatCardSkeleton } from "@/components/Skeleton";
import { ApiError, apiFetch } from "@/lib/api";
import type { LeadOpsOverview } from "@/lib/types";

/**
 * Đường ống lead: thông báo có tới PT không, PT nào bỏ bê, học viên có phản bác.
 *
 * Tách khỏi /admin (tổng quan) vì hai trang trả lời hai câu hỏi khác nhau: kia
 * là "ai đang dùng gì", đây là "chuyện gì xảy ra sau khi một lead được gửi".
 * Nhồi vào một trang thì không cái nào đọc được.
 *
 * AdminShell lo kiểm tra quyền và chỉ render children khi đã xác nhận là admin,
 * nên ở đây gọi API ngay lúc mount là an toàn.
 */

const DAY_OPTIONS = [7, 30, 90];

function LeadOpsContent() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<LeadOpsOverview | null>(null);
  // Slug của PT đang mở panel xử lý. Một hàng tại một thời điểm: mở nhiều panel
  // cùng lúc chỉ làm tăng khả năng nhập lý do vào đúng hàng bên cạnh.
  const [actingOn, setActingOn] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    apiFetch<LeadOpsOverview>(`/api/admin/lead-ops?days=${days}`, { auth: true })
      .then(setData)
      .catch((err) =>
        setError(
          err instanceof ApiError && err.status === 403
            ? "Tài khoản này không có quyền admin."
            : "Không tải được số liệu."
        )
      )
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  // Tỷ lệ lead được phản hồi — con số quan trọng nhất trang này. Đọc chung với
  // `disputed` bên dưới, vì "đã phản hồi" chỉ là PT tự chuyển cột.
  const answeredRate =
    data && data.leads_total > 0
      ? Math.round((data.leads_answered / data.leads_total) * 100)
      : null;

  const cards = data
    ? [
        { label: "Lead", value: String(data.leads_total), accent: "text-slate-900" },
        {
          label: "Đã phản hồi",
          value: answeredRate === null ? "—" : `${data.leads_answered} (${answeredRate}%)`,
          accent: "text-emerald-600",
        },
        {
          label: "Còn nằm im",
          value: String(data.leads_still_new),
          accent: data.leads_still_new > 0 ? "text-amber-600" : "text-slate-900",
        },
        {
          label: "Học viên phản bác",
          value: String(data.leads_disputed),
          accent: data.leads_disputed > 0 ? "text-rose-600" : "text-slate-900",
        },
        {
          label: "Trung vị phản hồi",
          value: data.median_response_hours === null ? "—" : `${data.median_response_hours}h`,
          accent: "text-slate-900",
        },
        { label: "Đã nhắc lại", value: String(data.leads_reminded), accent: "text-slate-500" },
      ]
    : [];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Đường ống lead</h1>
          <p className="mt-1 text-sm text-slate-500">
            Thông báo có tới PT không, PT nào bỏ bê, học viên có phản bác không.
          </p>
        </div>
        <div className="flex gap-1.5">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-lg border-2 px-3 py-1.5 text-sm font-semibold transition-all ${
                days === d
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 text-slate-500 hover:border-emerald-300"
              }`}
            >
              {d} ngày
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
          {error}
        </div>
      )}
      {/* Xem ghi chú cùng dạng trong app/admin/page.tsx. */}
      {loading && !data && (
        <Loading label="Đang tải số liệu lead" className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {repeat(6, () => (
              <StatCardSkeleton />
            ))}
          </div>
          <div className="card space-y-3 p-4">
            {repeat(4, () => (
              <Skeleton className="h-5 w-full" />
            ))}
          </div>
        </Loading>
      )}

      {data && (
        <Refreshing busy={loading} className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {cards.map((c) => (
              <div key={c.label} className="card p-4">
                <p className="text-sm text-slate-500">{c.label}</p>
                <p className={`mt-1 text-2xl font-bold ${c.accent}`}>{c.value}</p>
              </div>
            ))}
          </div>

          <section>
            <h2 className="text-lg font-bold text-slate-900">Kênh thông báo</h2>
            <p className="mt-1 text-sm text-slate-500">
              &quot;Bỏ qua&quot; là chưa cấu hình hoặc PT không có địa chỉ ở kênh đó —
              khác hẳn &quot;thất bại&quot; (đã bật mà hỏng).
            </p>
            <div className="card mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 text-left text-slate-500">
                  <tr>
                    <th className="p-3 font-medium">Kênh</th>
                    <th className="p-3 font-medium">Gửi được</th>
                    <th className="p-3 font-medium">Thất bại</th>
                    <th className="p-3 font-medium">Bỏ qua</th>
                  </tr>
                </thead>
                <tbody>
                  {data.channels.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-slate-400">
                        Chưa có lần gửi nào trong khoảng này.
                      </td>
                    </tr>
                  ) : (
                    data.channels.map((c) => (
                      <tr key={c.channel} className="border-b border-slate-50 last:border-0">
                        <td className="p-3 font-medium text-slate-900">{c.channel}</td>
                        <td className="p-3 text-emerald-600">{c.sent}</td>
                        <td className={`p-3 ${c.failed > 0 ? "text-rose-600" : "text-slate-400"}`}>
                          {c.failed}
                        </td>
                        <td className="p-3 text-slate-400">{c.skipped}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900">PT theo mức độ phản hồi</h2>
            <p className="mt-1 text-sm text-slate-500">
              Xếp từ kém nhất. Cột &quot;phản bác&quot; đáng tin hơn &quot;đã trả
              lời&quot;, vì đã trả lời chỉ là PT tự chuyển cột.
            </p>
            <div className="card mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 text-left text-slate-500">
                  <tr>
                    <th className="p-3 font-medium">PT</th>
                    <th className="p-3 font-medium">Lead</th>
                    <th className="p-3 font-medium">Đã trả lời</th>
                    <th className="p-3 font-medium">Phản bác</th>
                    <th className="p-3 font-medium">TB phản hồi</th>
                    <th className="p-3 font-medium">Xử lý</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-slate-400">
                        Chưa có lead nào trong khoảng này.
                      </td>
                    </tr>
                  ) : (
                    data.pts.map((pt) => (
                      <Fragment key={pt.slug}>
                      <tr className="border-b border-slate-50 last:border-0">
                        <td className="p-3">
                          <Link
                            href={`/pt/${pt.slug}`}
                            className="font-medium text-emerald-600 hover:underline"
                          >
                            {pt.full_name}
                          </Link>
                        </td>
                        <td className="p-3 text-slate-700">{pt.leads}</td>
                        <td
                          className={`p-3 ${
                            pt.answered === 0 && pt.leads > 0 ? "text-rose-600" : "text-slate-700"
                          }`}
                        >
                          {pt.answered}
                        </td>
                        <td className={`p-3 ${pt.disputed > 0 ? "text-rose-600" : "text-slate-400"}`}>
                          {pt.disputed}
                        </td>
                        <td className="p-3 text-slate-700">
                          {pt.avg_response_hours === null ? "—" : `${pt.avg_response_hours}h`}
                        </td>
                        <td className="p-3">
                          {pt.deleted ? (
                            <span className="text-xs text-slate-400">Đã đóng</span>
                          ) : (
                            <button
                              onClick={() =>
                                setActingOn((cur) => (cur === pt.slug ? "" : pt.slug))
                              }
                              className="text-sm font-medium text-slate-500 hover:text-slate-900"
                            >
                              {pt.suspended || pt.banned ? "Đã xử lý ▾" : "Xử lý ▾"}
                            </button>
                          )}
                        </td>
                      </tr>
                      {/* Panel xử lý đặt ở hàng riêng chiếm hết chiều ngang:
                          nhồi vào một ô của bảng 6 cột thì ô nhập lý do chỉ còn
                          vài chục pixel. */}
                      {actingOn === pt.slug && !pt.deleted && (
                        <tr className="border-b border-slate-50 bg-slate-50/60">
                          <td colSpan={6} className="p-3">
                            <PTModerationActions
                              slug={pt.slug}
                              ptName={pt.full_name}
                              suspended={pt.suspended}
                              banned={pt.banned}
                              deleted={pt.deleted}
                              onChanged={() => {
                                setActingOn("");
                                load();
                              }}
                            />
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </Refreshing>
      )}

    </>
  );
}

export default function AdminLeadOpsPage() {
  return (
    <AdminShell>
      <LeadOpsContent />
    </AdminShell>
  );
}
