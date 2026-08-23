"use client";

import { useEffect, useState } from "react";
import RatingStars from "@/components/RatingStars";
import { apiFetch, ApiError, buildQuery } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { Paginated, PTProfile, Review } from "@/lib/types";
import { useTranslations } from "next-intl";

/* eslint-disable @next/next/no-img-element */

function replyContent(review: Review): string | null {
  if (typeof review.reply === "string" && review.reply) return review.reply;
  if (review.reply && typeof review.reply === "object" && review.reply.content) return review.reply.content;
  if (review.reply_content) return review.reply_content;
  return null;
}

export default function DashboardReviewsPage() {
  const t = useTranslations("dashboardReviews");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const pageSize = 10;

  async function loadReviews(ptSlug: string, p: number, append: boolean) {
    const data = await apiFetch<Paginated<Review>>(
      `/api/pts/${ptSlug}/reviews${buildQuery({ page: p, page_size: pageSize })}`
    );
    setReviews((prev) => (append ? [...prev, ...(data.items ?? [])] : data.items ?? []));
    setTotal(data.total ?? 0);
    setPage(p);
  }

  useEffect(() => {
    (async () => {
      try {
        const profile = await apiFetch<PTProfile>("/api/pts/me", { auth: true });
        setSlug(profile.slug);
        await loadReviews(profile.slug, 1, false);
      } catch {
        setError(t("loadFailed"));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleReply(review: Review) {
    if (!replyText.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      await apiFetch(`/api/reviews/${review.id}/reply`, {
        method: "POST",
        auth: true,
        body: JSON.stringify({ content: replyText.trim() }),
      });
      setReviews((list) =>
        list.map((r) => (r.id === review.id ? { ...r, reply: { content: replyText.trim() } } : r))
      );
      setReplyingId(null);
      setReplyText("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("replyFailed"));
    } finally {
      setSubmitting(false);
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
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card h-32 animate-pulse bg-slate-100" />
          ))}
        </div>
      ) : reviews.length > 0 ? (
        <div className="space-y-4">
          {reviews.map((review) => {
            const reply = replyContent(review);
            return (
              <div key={review.id} className="card p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{review.reviewer_name}</p>
                    <RatingStars rating={review.rating} showValue={false} />
                  </div>
                  <span className="text-xs text-slate-400">{formatDate(review.created_at)}</span>
                </div>
                {review.content && <p className="mt-2 text-sm leading-relaxed text-slate-600">{review.content}</p>}
                {review.images && review.images.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {review.images.map((img, i) => (
                      <a key={i} href={img} target="_blank" rel="noopener noreferrer">
                        <img src={img} alt={t("imageAlt", { n: i + 1 })} className="h-16 w-16 rounded-lg object-cover" />
                      </a>
                    ))}
                  </div>
                )}

                {reply ? (
                  <div className="mt-3 rounded-lg bg-emerald-50 p-3">
                    <p className="text-xs font-semibold text-emerald-700">{t("yourReply")}</p>
                    <p className="mt-1 text-sm text-slate-600">{reply}</p>
                  </div>
                ) : replyingId === review.id ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      className="input"
                      rows={3}
                      placeholder={t("replyPlaceholder")}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button className="btn-primary px-4 py-2 text-xs" disabled={submitting} onClick={() => handleReply(review)}>
                        {submitting ? t("sending") : t("send")}
                      </button>
                      <button
                        className="btn-secondary px-4 py-2 text-xs"
                        onClick={() => {
                          setReplyingId(null);
                          setReplyText("");
                        }}
                      >
                        {t("cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="btn-secondary mt-3 px-4 py-2 text-xs"
                    onClick={() => {
                      setReplyingId(review.id);
                      setReplyText("");
                    }}
                  >
                    {t("reply")}
                  </button>
                )}
              </div>
            );
          })}
          {reviews.length < total && (
            <div className="text-center">
              <button className="btn-secondary" onClick={() => loadReviews(slug, page + 1, true)}>
                {t("loadMore")}
              </button>
            </div>
          )}
        </div>
      ) : (
        !error && (
          <div className="card p-10 text-center text-sm text-slate-500">
            {t("empty")}
          </div>
        )
      )}
    </div>
  );
}
