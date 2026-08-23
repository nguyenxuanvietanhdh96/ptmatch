"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { track } from "@/lib/analytics";
import { getUser } from "@/lib/auth";
import { specialtyLabel } from "@/lib/constants";
import { formatVND, timeAgo } from "@/lib/format";
import type { RequestClaimResult, TraineeRequest } from "@/lib/types";

export default function RequestCard({ request }: { request: TraineeRequest }) {
  const t = useTranslations("requestCard");

  const genderWish: Record<string, string> = {
    male: t("wantMale"),
    female: t("wantFemale"),
    other: t("wantAny"),
  };

  function budgetText(r: TraineeRequest): string {
    const min = r.budget_min;
    const max = r.budget_max;
    if (min && max) return t("budgetRange", { min: formatVND(min), max: formatVND(max) });
    if (max) return t("budgetMax", { max: formatVND(max) });
    if (min) return t("budgetMin", { min: formatVND(min) });
    return t("budgetNone");
  }

  const [claimed, setClaimed] = useState(Boolean(request.claimed_by_me));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const isPT = getUser()?.role === "pt";
  const area = [request.ward, request.city].filter(Boolean).join(", ");

  async function handleClaim() {
    setError("");
    setPending(true);
    try {
      await apiFetch<RequestClaimResult>(`/api/requests/${request.id}/claim`, {
        method: "POST",
        auth: true,
      });
      track("request_claim", { specialty: request.specialty ?? "", ward: request.ward ?? "" });
      setClaimed(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("claimFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="card flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">
            {request.specialty ? specialtyLabel(request.specialty) : t("fallbackTitle")}
          </p>
          <p className="mt-0.5 text-sm text-slate-500">
            {request.trainee_name}
            {area ? ` · ${area}` : ""}
          </p>
        </div>
        <span className="shrink-0 text-xs text-slate-400">{timeAgo(request.created_at)}</span>
      </div>

      {request.note && <p className="text-sm leading-relaxed text-slate-600">{request.note}</p>}

      <div className="flex flex-wrap gap-1.5 text-xs">
        <span className="rounded-md bg-emerald-50 px-2 py-1 font-medium text-emerald-700">
          {budgetText(request)}
        </span>
        {request.preferred_gender && (
          <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600">
            {genderWish[request.preferred_gender]}
          </span>
        )}
        {/* Cố ý KHÔNG hiện số PT đã lấy liên hệ.
            PT không làm gì được với con số đó: biết có 5 người quan tâm cũng
            không đổi được quyết định, chỉ làm chùn tay. Còn học viên thì nó gợi
            sai — "5 PT quan tâm" nghe như việc đã xong dù có thể chưa ai gọi.
            Thứ đóng một yêu cầu là học viên bấm "đã tìm được PT", không phải
            bộ đếm. Số liệu vẫn còn đủ ở GET /api/requests/stats, và học viên
            xem được danh sách PT giữ liên hệ của mình ở /account/requests. */}
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {claimed ? (
        <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          {t("claimedPrefix")}{" "}
          <Link href="/dashboard/leads" className="font-semibold underline">
            {t("claimedLink")}
          </Link>{" "}
          {t("claimedSuffix")}
        </div>
      ) : isPT ? (
        <button
          className="btn-primary w-full"
          onClick={handleClaim}
          disabled={pending}
        >
          {pending ? t("claiming") : t("claim")}
        </button>
      ) : (
        // Học viên và khách vãng lai không nhận được — nêu rõ để khỏi bấm vào rồi bị 403.
        <p className="text-xs text-slate-400">
          {t("ptOnly")}{" "}
          <Link href="/register?role=pt" className="font-medium text-emerald-700 underline">
            {t("registerPT")}
          </Link>
        </p>
      )}
    </div>
  );
}
