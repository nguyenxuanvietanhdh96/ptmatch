"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import RatingStars from "@/components/RatingStars";
import { Loading, repeat, Skeleton } from "@/components/Skeleton";
import { track } from "@/lib/analytics";
import { ApiError, apiFetch } from "@/lib/api";
import { specialtyLabel } from "@/lib/constants";
import { formatVND, timeAgo } from "@/lib/format";
import type { CloseReason, MyTraineeRequest } from "@/lib/types";
import { useTranslations } from "next-intl";


export default function MyRequestsPage() {
  const t = useTranslations("myRequests");

  function budgetText(r: { budget_min?: number | null; budget_max?: number | null }): string {
    const min = r.budget_min;
    const max = r.budget_max;
    if (min && max) return t("budgetRange", { min: formatVND(min), max: formatVND(max) });
    if (max) return t("budgetMax", { max: formatVND(max) });
    if (min) return t("budgetMin", { min: formatVND(min) });
    return t("budgetNone");
  }

  const [requests, setRequests] = useState<MyTraineeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [closing, setClosing] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<MyTraineeRequest[]>("/api/requests/mine", { auth: true })
      .then(setRequests)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : t("loadFailed"))
      )
      .finally(() => setLoading(false));
  }, []);

  async function handleClose(id: string, reason: CloseReason) {
    setClosing(id);
    try {
      const updated = await apiFetch<MyTraineeRequest>(`/api/requests/${id}/close`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({ reason }),
      });
      // Lý do là số liệu chuyển đổi duy nhất do chính học viên khai, nên bắn kèm
      // sự kiện — trạng thái lead bên PT không chứng minh được điều này.
      track("request_close", { reason });
      setRequests((list) =>
        list.map((r) =>
          r.id === id
            ? { ...r, status: updated.status, close_reason: updated.close_reason }
            : r
        )
      );
    } catch {
      setError(t("closeFailed"));
    } finally {
      setClosing(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">{t("heading")}</h1>
        <Link href="/requests/new" className="btn-primary">
          {t("postNew")}
        </Link>
      </div>

      {/*
        Tiêu đề và nút "Đăng yêu cầu mới" hiện ngay, không chờ API.
        Trước đây cả trang là một dòng "Đang tải..." rồi mới bung ra — nút nhảy
        chỗ đúng vào lúc người dùng có thể đã nhắm tay vào đó.
      */}
      {loading && (
        <Loading label={t("loadingList")} className="mt-5 space-y-4">
          {repeat(2, () => (
            <div className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="h-3 w-60" />
                </div>
                <Skeleton className="h-6 w-20 rounded-md" />
              </div>
              <div className="mt-4 border-t border-slate-100 pt-3">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="mt-2 h-4 w-3/4" />
              </div>
            </div>
          ))}
        </Loading>
      )}

      {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}

      {/* `!loading`: bỏ điều kiện này là trong lúc chờ API sẽ hiện "Bạn chưa
          đăng yêu cầu nào" ngay bên trên skeleton — nói sai về dữ liệu của
          chính người dùng. */}
      {!loading && requests.length === 0 && !error && (
        <div className="card mt-5 p-8 text-center">
          <p className="font-medium text-slate-900">{t("emptyTitle")}</p>
          <p className="mt-1 text-sm text-slate-500">
            {t("emptyBody")}
          </p>
        </div>
      )}

      <div className="mt-5 space-y-4">
        {requests.map((request) => {
          const expired = new Date(request.expires_at).getTime() < Date.now();
          const active = request.status === "open" && !expired;
          return (
            <div key={request.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">
                    {request.specialty ? specialtyLabel(request.specialty) : t("fallbackTitle")}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {[request.ward, request.city].filter(Boolean).join(", ") || t("areaUnknown")}
                    {" · "}
                    {budgetText(request)}
                  </p>
                </div>
                <span
                  className={`rounded-md px-2 py-1 text-xs font-medium ${
                    active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {/* Học viên cần biết yêu cầu còn sống hay không. Số PT quan tâm
                      đã hiện ở khối bên dưới. */}
                  {request.status === "closed"
                    ? t("statusClosed")
                    : expired
                      ? t("statusExpired")
                      : t("statusOpen")}
                </span>
              </div>

              {request.note && <p className="mt-2 text-sm text-slate-600">{request.note}</p>}

              {/* claimed_by ?? []: phần còn lại của codebase đều phòng thủ như
                  vậy, riêng chỗ này giả định mảng luôn có. Backend bỏ sót trường
                  là cả trang trắng, không phải mất một dòng. */}
              <div className="mt-4 border-t border-slate-100 pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t("interestedPTs", { count: (request.claimed_by ?? []).length })}
                </p>
                {(request.claimed_by ?? []).length === 0 ? (
                  // Không hứa "thường được nhận trong 1–2 ngày": chưa có số liệu
                  // nào chống lưng cho câu đó. Nói điều biết chắc thay vào.
                  <p className="mt-2 text-sm text-slate-400">
                    {t("noPTYet")}
                  </p>
                ) : (
                  <>
                    {/* Học viên có quyền biết ai đang giữ số của mình — đây là
                        thông tin về dữ liệu của chính họ, không phải chi tiết
                        vận hành. Và nói "đã xem số" thì đúng với những gì hệ
                        thống biết, khác với "đã nhận yêu cầu". */}
                    <p className="mt-1 text-xs text-slate-400">
                      {t("ptsHaveNumber")}
                    </p>
                    <ul className="mt-2 space-y-2">
                    {request.claimed_by.map((pt) => (
                      <li key={pt.slug} className="flex items-center gap-3">
                        <Avatar src={pt.avatar_url} name={pt.full_name} size={36} />
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/pt/${pt.slug}`}
                            className="font-medium text-slate-900 hover:text-emerald-700"
                          >
                            {pt.full_name}
                          </Link>
                          <RatingStars rating={pt.avg_rating} count={pt.review_count} />
                        </div>
                        <span className="shrink-0 text-xs text-slate-400">
                          {timeAgo(pt.claimed_at)}
                        </span>
                      </li>
                    ))}
                    </ul>
                  </>
                )}
              </div>

              {/* Hai lý do, không một. "Đã tìm được PT" và "không còn nhu cầu"
                  dẫn tới hai việc làm hoàn toàn khác nhau, mà gộp lại thành một
                  nút "đóng yêu cầu" thì mất luôn phân biệt đó — và đây là số
                  liệu duy nhất do chính người có nhu cầu khai. */}
              {active && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    className="btn-primary"
                    disabled={closing === request.id}
                    onClick={() => handleClose(request.id, "found_pt")}
                  >
                    {closing === request.id ? t("closing") : t("foundPT")}
                  </button>
                  <button
                    className="btn-secondary"
                    disabled={closing === request.id}
                    onClick={() => handleClose(request.id, "no_longer_needed")}
                  >
                    {t("noLongerNeeded")}
                  </button>
                </div>
              )}

              {request.status === "closed" && request.close_reason && (
                <p className="mt-4 text-sm text-slate-400">
                  {request.close_reason === "found_pt"
                    ? t("closedFoundPT")
                    : t("closedNoLonger")}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
