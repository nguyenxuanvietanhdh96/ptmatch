"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import RatingStars from "@/components/RatingStars";
import { Loading, repeat, Skeleton } from "@/components/Skeleton";
import { apiFetch, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { MyReview } from "@/lib/types";
import { useTranslations } from "next-intl";

/* eslint-disable @next/next/no-img-element */

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" onClick={() => onChange(i)} className="p-0.5" aria-label={`${i} sao`}>
          <svg
            viewBox="0 0 20 20"
            className={`h-6 w-6 transition-colors ${i <= value ? "text-amber-400" : "text-slate-300 hover:text-amber-200"}`}
            fill="currentColor"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118L2.077 10.1c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        </button>
      ))}
    </div>
  );
}

export default function MyReviewsPage() {
  const t = useTranslations("myReviews");
  const [reviews, setReviews] = useState<MyReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ rating: 5, content: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function load() {
    apiFetch<MyReview[]>("/api/reviews/mine", { auth: true })
      .then((data) => setReviews(data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit(r: MyReview) {
    setError("");
    setEditingId(r.id);
    setDraft({ rating: r.rating, content: r.content ?? "" });
  }

  async function saveEdit(id: string) {
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/reviews/${id}`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({ rating: draft.rating, content: draft.content.trim() }),
      });
      setEditingId(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm(t("confirmDelete"))) return;
    setBusy(true);
    try {
      await apiFetch(`/api/reviews/${id}`, { method: "DELETE", auth: true });
      setReviews((rs) => rs.filter((r) => r.id !== id));
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">{t("heading")}</h1>
      <p className="mt-1 text-sm text-slate-500">{t("subtitle")}</p>

      {loading ? (
        <Loading label={t("loadingList")} className="mt-6 space-y-3">
          {repeat(2, () => (
            <div className="card p-5">
              <div className="flex items-start gap-3">
                <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="mt-3 h-4 w-28" />
              <Skeleton className="mt-2 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-3/5" />
            </div>
          ))}
        </Loading>
      ) : reviews.length > 0 ? (
        <div className="mt-6 space-y-3">
          {reviews.map((r) => (
            <div key={r.id} className="card p-5">
              <div className="flex items-start gap-3">
                <Avatar src={r.pt_avatar_url} name={r.pt_name} size={44} />
                <div className="min-w-0 flex-1">
                  <Link href={`/pt/${r.pt_slug}`} className="font-semibold text-slate-900 hover:text-emerald-700">
                    {r.pt_name}
                  </Link>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs text-slate-400">{formatDate(r.created_at)}</p>
                    {/* Đánh giá hiển thị ngay khi gửi; trạng thái này chỉ xuất
                        hiện khi quản trị viên đã gỡ nó xuống. Vẫn phải nói ra —
                        không thì tác giả tưởng đánh giá của mình biến mất. */}
                    {!r.approved_at && (
                      <span className="badge bg-amber-50 text-amber-700">{t("hidden")}</span>
                    )}
                  </div>
                </div>
                {editingId !== r.id && (
                  <div className="flex shrink-0 gap-2">
                    <button onClick={() => startEdit(r)} className="text-sm font-medium text-emerald-600 hover:underline">
                      {t("edit")}
                    </button>
                    <button onClick={() => remove(r.id)} disabled={busy} className="text-sm font-medium text-rose-600 hover:underline">
                      {t("delete")}
                    </button>
                  </div>
                )}
              </div>

              {editingId === r.id ? (
                <div className="mt-3 space-y-3">
                  <StarPicker value={draft.rating} onChange={(v) => setDraft((d) => ({ ...d, rating: v }))} />
                  <textarea
                    className="input min-h-24"
                    rows={4}
                    value={draft.content}
                    onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
                  />
                  {error && <p className="text-sm text-rose-600">{error}</p>}
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(r.id)} disabled={busy} className="btn-primary">
                      {busy ? t("saving") : t("saveChanges")}
                    </button>
                    <button onClick={() => setEditingId(null)} className="btn-secondary">{t("cancel")}</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mt-2">
                    <RatingStars rating={r.rating} showValue={false} />
                  </div>
                  {r.content && <p className="mt-2 text-sm leading-relaxed text-slate-600">{r.content}</p>}
                  {r.images && r.images.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {r.images.map((img, i) => (
                        <a key={i} href={img} target="_blank" rel="noopener noreferrer">
                          <img src={img} alt={t("imageAlt", { n: i + 1 })} className="h-20 w-20 rounded-lg object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
                  {r.reply_content && (
                    <div className="mt-3 rounded-lg bg-slate-50 p-3">
                      <p className="text-xs font-semibold text-emerald-700">{t("replyFrom", { ptName: r.pt_name })}</p>
                      <p className="mt-1 text-sm text-slate-600">{r.reply_content}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="card mt-6 flex flex-col items-center justify-center p-12 text-center">
          <svg className="h-12 w-12 text-slate-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
          </svg>
          <h2 className="mt-4 font-semibold text-slate-900">{t("emptyTitle")}</h2>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            {t("emptyBody")}
          </p>
          <Link href="/pts" className="btn-primary mt-4">{t("explore")}</Link>
        </div>
      )}
    </div>
  );
}
