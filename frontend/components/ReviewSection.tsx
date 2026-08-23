"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import RatingStars from "./RatingStars";
import { useLightbox } from "@/components/Lightbox";
import { Loading, repeat, Skeleton } from "@/components/Skeleton";
import { apiFetch, ApiError, buildQuery } from "@/lib/api";
import { getUser, isLoggedIn } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import type { Paginated, Review } from "@/lib/types";
import { useTranslations } from "next-intl";

/* eslint-disable @next/next/no-img-element */

function replyContent(review: Review): string | null {
  if (typeof review.reply === "string" && review.reply) return review.reply;
  if (review.reply && typeof review.reply === "object" && review.reply.content) return review.reply.content;
  if (review.reply_content) return review.reply_content;
  return null;
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          className="p-0.5"
          aria-label={`${i} sao`}
        >
          <svg
            viewBox="0 0 20 20"
            className={`h-7 w-7 transition-colors ${i <= value ? "text-amber-400" : "text-slate-300 hover:text-amber-200"}`}
            fill="currentColor"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118L2.077 10.1c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        </button>
      ))}
    </div>
  );
}

interface Props {
  slug: string;
  ptName: string;
  /**
   * Trang đánh giá đầu, đã lấy trên server (xem getReviews ở
   * app/(public)/pt/[slug]/page.tsx). Dùng làm state khởi tạo để nội dung nằm
   * SẴN trong HTML nguồn: crawler của engine sinh nội dung phần lớn không chạy
   * JS, nên phần fetch-sau-hydrate trước đây là vô hình với chúng.
   *
   * Phần tương tác (gửi đánh giá, xem thêm, lightbox) vẫn cần client — đây chỉ
   * là bỏ vòng fetch đầu tiên, không phải bỏ tính động.
   */
  initialReviews?: Review[];
  initialTotal?: number;
}

export default function ReviewSection({ slug, ptName, initialReviews, initialTotal }: Props) {
  const t = useTranslations("reviews");
  const { open: openLightbox, lightbox } = useLightbox();
  const [reviews, setReviews] = useState<Review[]>(initialReviews ?? []);
  const [total, setTotal] = useState(initialTotal ?? 0);
  const [page, setPage] = useState(1);
  // Đã có dữ liệu từ server thì không ở trạng thái "đang tải" — nếu không,
  // lần render đầu hiện skeleton thay vì nội dung, và HTML nguồn lại rỗng.
  const [loading, setLoading] = useState(!initialReviews);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [form, setForm] = useState({ reviewer_name: "", reviewer_phone: "", rating: 5, content: "", imageUrls: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const pageSize = 5;

  const load = useCallback(
    async (p: number, append: boolean) => {
      setLoading(true);
      try {
        const data = await apiFetch<Paginated<Review>>(
          `/api/pts/${slug}/reviews${buildQuery({ page: p, page_size: pageSize })}`
        );
        setReviews((prev) => (append ? [...prev, ...(data.items ?? [])] : data.items ?? []));
        setTotal(data.total ?? 0);
        setPage(p);
      } catch {
        /* giữ trạng thái hiện tại */
      } finally {
        setLoading(false);
      }
    },
    [slug]
  );

  // Bỏ vòng fetch đầu khi server đã đưa dữ liệu xuống — gọi lại ngay sau
  // hydrate là một request thừa cho mọi lượt xem hồ sơ, và làm nhấp nháy
  // danh sách vừa hiện.
  const seeded = useRef(Boolean(initialReviews));
  useEffect(() => {
    if (seeded.current) {
      seeded.current = false;
      return;
    }
    load(1, false);
  }, [load]);

  // Prefill reviewer name/phone for logged-in users.
  useEffect(() => {
    const user = getUser();
    if (user) {
      setForm((f) => ({
        ...f,
        reviewer_name: f.reviewer_name || user.full_name || "",
        reviewer_phone: f.reviewer_phone || user.phone || "",
      }));
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.reviewer_name.trim() || !form.reviewer_phone.trim()) {
      setError(t("errRequired"));
      return;
    }
    setSubmitting(true);
    try {
      const images = form.imageUrls
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await apiFetch(`/api/pts/${slug}/reviews`, {
        method: "POST",
        auth: isLoggedIn(),
        body: JSON.stringify({
          reviewer_name: form.reviewer_name.trim(),
          reviewer_phone: form.reviewer_phone.trim(),
          rating: form.rating,
          content: form.content.trim(),
          images,
        }),
      });
      setSuccess(true);
      setShowForm(false);
      load(1, false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("errSubmit"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900">{t("heading")}</h2>
        {!success && (
          <button className="btn-secondary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? t("close") : t("write")}
          </button>
        )}
      </div>

      {success && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {t("thanks", { ptName })}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="card mt-4 space-y-3 p-5">
          <div>
            <span className="label">{t("ratingLabel")}</span>
            <StarPicker value={form.rating} onChange={(v) => setForm((f) => ({ ...f, rating: v }))} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="rv-name">{t("name")}</label>
              <input
                id="rv-name"
                className="input"
                value={form.reviewer_name}
                onChange={(e) => setForm((f) => ({ ...f, reviewer_name: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="rv-phone">{t("phone")}</label>
              <input
                id="rv-phone"
                className="input"
                type="tel"
                value={form.reviewer_phone}
                onChange={(e) => setForm((f) => ({ ...f, reviewer_phone: e.target.value }))}
                required
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="rv-content">{t("content")}</label>
            <textarea
              id="rv-content"
              className="input min-h-24"
              rows={4}
              placeholder={t("contentPlaceholder")}
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            />
          </div>
          <div>
            <label className="label" htmlFor="rv-images">{t("images")}</label>
            <input
              id="rv-images"
              className="input"
              placeholder="https://..."
              value={form.imageUrls}
              onChange={(e) => setForm((f) => ({ ...f, imageUrls: e.target.value }))}
            />
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? t("submitting") : t("submit")}
          </button>
        </form>
      )}

      <div className="mt-4 space-y-4">
        {reviews.length === 0 && !loading && (
          <p className="card p-6 text-center text-sm text-slate-500">
            {t("empty", { ptName })}
          </p>
        )}
        {/*
          Khối đánh giá nằm cuối trang hồ sơ và tải sau phần còn lại, nên nếu
          chỗ này ban đầu cao 0px thì mọi thứ dưới nó nhảy khi dữ liệu về —
          gồm cả người đang cuộn tới đó để đọc.
        */}
        {loading && reviews.length === 0 && (
          <Loading label={t("loadingList")} className="space-y-4">
            {repeat(2, () => (
              <div className="card p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="mt-3 h-4 w-full" />
                <Skeleton className="mt-2 h-4 w-4/5" />
              </div>
            ))}
          </Loading>
        )}
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
                    <button
                      key={i}
                      type="button"
                      className="cursor-zoom-in transition hover:opacity-90"
                      aria-label={t("zoomImage", { n: i + 1 })}
                      onClick={() =>
                        openLightbox(
                          (review.images ?? []).map((src, n) => ({
                            src,
                            alt: t("imageAlt", { n: n + 1, name: review.reviewer_name }),
                          })),
                          i
                        )
                      }
                    >
                      <img src={img} alt={t("imageAltShort", { n: i + 1 })} className="h-20 w-20 rounded-lg object-cover" />
                    </button>
                  ))}
                </div>
              )}
              {reply && (
                <div className="mt-3 rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-emerald-700">{t("replyFrom", { ptName })}</p>
                  <p className="mt-1 text-sm text-slate-600">{reply}</p>
                </div>
              )}
            </div>
          );
        })}
        {/* Nút luôn ở đó khi còn trang sau, chỉ đổi chữ. Trước đây nút bị ẩn đi
            và thay bằng dòng "Đang tải đánh giá..." — hai phần tử cao khác nhau,
            nên mỗi lần bấm là nội dung dưới nhích lên rồi tụt xuống. */}
        {reviews.length < total && (
          <div className="text-center">
            <button
              className="btn-secondary"
              disabled={loading}
              onClick={() => load(page + 1, true)}
            >
              {loading ? t("loading") : t("loadMore")}
            </button>
          </div>
        )}
      </div>
      {lightbox}
    </div>
  );
}
