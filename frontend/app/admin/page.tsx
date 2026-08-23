"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { Loading, Refreshing, repeat, Skeleton, StatCardSkeleton } from "@/components/Skeleton";
import { ApiError, apiFetch } from "@/lib/api";
import type { AdminOverview, RequestFunnel } from "@/lib/types";

/**
 * Tổng quan: ai đang dùng tính năng nào, và nhu cầu tập trung ở đâu.
 *
 * Mục đích duy nhất là trả lời câu hỏi của giai đoạn kiểm chứng — tính năng nào
 * có người dùng thật, tính năng nào chỉ tồn tại — nên nó cố tình KHÔNG có gì để
 * bấm ngoài việc đổi khoảng thời gian.
 *
 * Ghép cả phễu chợ ngược (/api/requests/stats) vào đây. Endpoint đó tồn tại từ
 * trước nhưng chưa trang nào gọi, trong khi `closed_found_pt` của nó chính là
 * con số quyết định qua/dừng của giai đoạn kiểm chứng — để nó nằm ngoài màn
 * hình nghĩa là phải curl bằng tay mới xem được thứ quan trọng nhất.
 */

const DAY_OPTIONS = [7, 30, 90];

function Stat({
  label,
  value,
  accent = "text-slate-900",
  hint,
}: {
  label: string;
  value: string;
  accent?: string;
  hint?: string;
}) {
  return (
    <div className="card p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function OverviewContent() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AdminOverview | null>(null);
  const [funnel, setFunnel] = useState<RequestFunnel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([
      apiFetch<AdminOverview>(`/api/admin/overview?days=${days}`, { auth: true }),
      // Phễu là phần phụ: nó lỗi thì trang vẫn phải hiện được phần chính.
      apiFetch<RequestFunnel>(`/api/requests/stats?days=${days}`, { auth: true }).catch(
        () => null
      ),
    ])
      .then(([overview, stats]) => {
        setData(overview);
        setFunnel(stats);
      })
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

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tổng quan</h1>
          <p className="mt-1 text-sm text-slate-500">
            Ai đang dùng tính năng nào, và nhu cầu tập trung ở đâu.
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
      {/*
        Lần đầu vào: skeleton, vì chưa có gì trên màn hình.
        Đổi khoảng thời gian (7/30/90 ngày): giữ nguyên số cũ và làm mờ. Trước
        đây chỗ này chèn thêm một dòng "Đang tải..." vào giữa bố cục, nên mỗi lần
        bấm là toàn bộ bảng số bị đẩy xuống rồi kéo lên lại.
      */}
      {loading && !data && (
        <Loading label="Đang tải số liệu" className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {repeat(4, () => (
              <StatCardSkeleton />
            ))}
          </div>
          <div className="card space-y-3 p-4">
            {repeat(5, () => (
              <Skeleton className="h-5 w-full" />
            ))}
          </div>
        </Loading>
      )}

      {data && (
        <Refreshing busy={loading} className="space-y-8">
          <section>
            <h2 className="text-lg font-bold text-slate-900">Người dùng</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Tổng tài khoản" value={String(data.users_total)} />
              <Stat label="PT" value={String(data.users_pt)} accent="text-emerald-600" />
              <Stat label="Học viên" value={String(data.users_trainee)} />
              <Stat
                label={`Mới trong ${data.days} ngày`}
                value={String(data.users_new)}
                accent={data.users_new > 0 ? "text-emerald-600" : "text-slate-400"}
              />
            </div>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900">Tính năng nào có người dùng</h2>
            <p className="mt-1 text-sm text-slate-500">
              Cột <strong>người dùng</strong> quan trọng hơn cột lượt: 40 lượt từ 2 người
              là tín hiệu khác hẳn 40 lượt từ 35 người. Dấu — là không đếm được người.
            </p>
            <div className="card mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 text-left text-slate-500">
                  <tr>
                    <th className="p-3 font-medium">Tính năng</th>
                    <th className="p-3 font-medium">Người dùng</th>
                    <th className="p-3 font-medium">Số lượt</th>
                  </tr>
                </thead>
                <tbody>
                  {data.features.map((f) => (
                    <tr key={f.key} className="border-b border-slate-50 last:border-0">
                      <td className="p-3 text-slate-900">{f.label}</td>
                      <td
                        className={`p-3 font-semibold ${
                          f.people === null
                            ? "text-slate-300"
                            : f.people === 0
                              ? "text-rose-600"
                              : "text-emerald-600"
                        }`}
                      >
                        {f.people === null ? "—" : f.people}
                      </td>
                      <td className="p-3 text-slate-600">{f.events}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Chỉ đo những gì để lại dấu trong cơ sở dữ liệu. Lượt tìm kiếm, lượt xem
              trang và tỷ lệ rời trang nằm ở GA4/Plausible, không ở đây.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900">Hồ sơ PT dùng được tới đâu</h2>
            <p className="mt-1 text-sm text-slate-500">
              Hồ sơ thiếu giá hoặc thiếu địa điểm thì học viên không chọn được — biết
              thiếu gì để đi giục đúng thứ đó.
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Hồ sơ" value={String(data.pt_profiles)} />
              <Stat label="Đang bật" value={String(data.pt_active)} />
              <Stat
                label="Có giá"
                value={`${data.pt_with_pricing}/${data.pt_profiles}`}
                accent={
                  data.pt_with_pricing < data.pt_profiles
                    ? "text-amber-600"
                    : "text-emerald-600"
                }
              />
              <Stat
                label="Có địa điểm"
                value={`${data.pt_with_location}/${data.pt_profiles}`}
                accent={
                  data.pt_with_location < data.pt_profiles
                    ? "text-amber-600"
                    : "text-emerald-600"
                }
              />
              <Stat
                label="Có portfolio"
                value={`${data.pt_with_portfolio}/${data.pt_profiles}`}
              />
              <Stat
                label="Đã nhận lead"
                value={`${data.pt_receiving_leads}/${data.pt_profiles}`}
                accent={data.pt_receiving_leads === 0 ? "text-rose-600" : "text-slate-900"}
              />
            </div>
          </section>

          {funnel && (
            <section>
              <h2 className="text-lg font-bold text-slate-900">Phễu chợ ngược</h2>
              <p className="mt-1 text-sm text-slate-500">
                Mỗi bước là tập con của bước trước. Chỗ tụt mạnh nhất là việc cần làm
                tiếp. <strong>Tìm được PT</strong> là con số dùng để quyết định qua/dừng
                giai đoạn kiểm chứng.
              </p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <Stat label="Yêu cầu đã đăng" value={String(funnel.requests_posted)} />
                <Stat label="Có PT nhận" value={String(funnel.requests_claimed)} />
                <Stat
                  label="PT đã liên hệ"
                  value={String(funnel.requests_contacted)}
                  accent="text-amber-600"
                />
                <Stat
                  label="Tìm được PT"
                  value={String(funnel.closed_found_pt)}
                  accent={funnel.closed_found_pt > 0 ? "text-emerald-600" : "text-rose-600"}
                  hint="tiêu chí qua/dừng"
                />
                <Stat
                  label="Hết hạn, không ai nhận"
                  value={String(funnel.requests_expired_unclaimed)}
                  accent={funnel.requests_expired_unclaimed > 0 ? "text-amber-600" : "text-slate-500"}
                  hint="lớn = thiếu cung"
                />
              </div>
            </section>
          )}

          {(data.top_specialties.length > 0 || data.top_areas.length > 0) && (
            <section>
              <h2 className="text-lg font-bold text-slate-900">Nhu cầu tập trung ở đâu</h2>
              <p className="mt-1 text-sm text-slate-500">
                Từ yêu cầu học viên đã đăng — dùng để chọn quận nào nên seed thêm PT.
              </p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div className="card p-4">
                  <p className="text-sm font-semibold text-slate-900">Mục tiêu tập luyện</p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {data.top_specialties.length === 0 ? (
                      <li className="text-slate-400">Chưa có dữ liệu</li>
                    ) : (
                      data.top_specialties.map((s) => (
                        <li key={s.label} className="flex justify-between">
                          <span className="text-slate-600">{s.label}</span>
                          <span className="font-semibold text-slate-900">{s.count}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div className="card p-4">
                  <p className="text-sm font-semibold text-slate-900">Khu vực</p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {data.top_areas.length === 0 ? (
                      <li className="text-slate-400">Chưa có dữ liệu</li>
                    ) : (
                      data.top_areas.map((a) => (
                        <li key={a.label} className="flex justify-between">
                          <span className="text-slate-600">{a.label}</span>
                          <span className="font-semibold text-slate-900">{a.count}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            </section>
          )}
        </Refreshing>
      )}
    </>
  );
}

export default function AdminOverviewPage() {
  return (
    <AdminShell>
      <OverviewContent />
    </AdminShell>
  );
}
