"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import RatingStars from "@/components/RatingStars";
import { Loading, Refreshing, repeat, Skeleton } from "@/components/Skeleton";
import { ApiError, apiFetch } from "@/lib/api";
import SuspendPTButton from "@/components/SuspendPTButton";
import { timeAgo } from "@/lib/format";
import type { AdminReviewItem, AdminReviewList } from "@/lib/types";

/**
 * Kiểm duyệt đánh giá.
 *
 * Lý do tồn tại: đánh giá ẩn danh trước đây KHÔNG AI xoá được — `trainee_id`
 * bằng NULL nên không khớp `trainee_id == user.id` của bất kỳ ai, kể cả admin.
 * Đường duy nhất còn lại là SQL tay, mà xoá bằng SQL còn phải tự tính lại
 * avg_rating/review_count; quên bước đó là điểm công khai của PT sai vĩnh viễn.
 *
 * Xoá qua API thì rating tự tính lại (xem reviews.py::delete_review), nên đây là
 * cách duy nhất làm việc này mà không có nguy cơ để lại dữ liệu sai.
 *
 * CỐ Ý KHÔNG có nút sửa nội dung: kiểm duyệt là bỏ đi, không phải viết lại lời
 * người khác rồi để nguyên tên họ.
 */

const PAGE_SIZE = 20;

function ReviewsContent() {
  const [onlyAnonymous, setOnlyAnonymous] = useState(false);
  // Đánh giá lên thẳng hồ sơ, không qua hàng chờ — bộ lọc này chỉ để soi lại
  // những cái đã bị gỡ, nên mặc định TẮT.
  const [onlyPending, setOnlyPending] = useState(false);
  const [maxRating, setMaxRating] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminReviewList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [moderatingId, setModeratingId] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(PAGE_SIZE),
    });
    if (onlyAnonymous) params.set("only_anonymous", "true");
    if (onlyPending) params.set("only_pending", "true");
    if (maxRating) params.set("max_rating", maxRating);

    apiFetch<AdminReviewList>(`/api/admin/reviews?${params}`, { auth: true })
      .then(setData)
      .catch((err) =>
        setError(
          err instanceof ApiError && err.status === 403
            ? "Tài khoản này không có quyền admin."
            : "Không tải được danh sách đánh giá."
        )
      )
      .finally(() => setLoading(false));
  }, [page, onlyAnonymous, onlyPending, maxRating]);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(item: AdminReviewItem) {
    setDeletingId(item.id);
    try {
      // Endpoint xoá nằm ở /api/reviews/{id}, KHÔNG dưới /admin: cùng một
      // endpoint phục vụ cả tác giả tự xoá và admin kiểm duyệt, phân quyền nằm
      // bên trong nó (xem reviews.py::delete_review).
      await apiFetch(`/api/reviews/${item.id}`, { method: "DELETE", auth: true });
      // Bỏ khỏi danh sách tại chỗ và giảm tổng, thay vì tải lại cả trang.
      setData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.filter((i) => i.id !== item.id),
              total: prev.total - 1,
            }
          : prev
      );
      setConfirmId("");
    } catch {
      setError("Không xoá được đánh giá.");
    } finally {
      setDeletingId("");
    }
  }

  async function moderate(item: AdminReviewItem, approved: boolean) {
    setModeratingId(item.id);
    setError("");
    try {
      const updated = await apiFetch<AdminReviewItem>(`/api/admin/reviews/${item.id}`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({ approved }),
      });
      setData((prev) =>
        prev
          ? {
              ...prev,
              // Đang lọc "đang bị ẩn" thì hiện lại xong là dòng đó rời danh sách —
              // giữ lại chỉ khiến người xử lý bấm nhầm lần hai.
              items: onlyPending
                ? prev.items.filter((i) => i.id !== item.id)
                : prev.items.map((i) => (i.id === item.id ? updated : i)),
              total: onlyPending ? prev.total - 1 : prev.total,
            }
          : prev
      );
    } catch {
      setError(approved ? "Không hiện lại được đánh giá." : "Không gỡ được đánh giá.");
    } finally {
      setModeratingId("");
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Kiểm duyệt đánh giá</h1>
          <p className="mt-1 text-sm text-slate-500">
            {data ? `${data.total} đánh giá` : "Đang tải..."} · gỡ hoặc xoá xong
            điểm của PT tự tính lại
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <select
            className="input w-auto py-1.5 text-sm"
            value={maxRating}
            onChange={(e) => {
              setPage(1);
              setMaxRating(e.target.value);
            }}
          >
            <option value="">Mọi mức điểm</option>
            <option value="1">Chỉ 1 sao</option>
            <option value="2">1–2 sao</option>
            <option value="3">1–3 sao</option>
          </select>
          <button
            onClick={() => {
              setPage(1);
              setOnlyPending((v) => !v);
            }}
            className={`rounded-lg border-2 px-3 py-1.5 text-sm font-semibold transition-all ${
              onlyPending
                ? "border-amber-500 bg-amber-50 text-amber-700"
                : "border-slate-200 text-slate-500 hover:border-amber-300"
            }`}
          >
            Đang bị ẩn
          </button>
          <button
            onClick={() => {
              setPage(1);
              setOnlyAnonymous((v) => !v);
            }}
            className={`rounded-lg border-2 px-3 py-1.5 text-sm font-semibold transition-all ${
              onlyAnonymous
                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                : "border-slate-200 text-slate-500 hover:border-emerald-300"
            }`}
          >
            Chỉ ẩn danh
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-400">
        Đánh giá hiển thị ngay khi gửi — trang này để xử lý <strong>sau</strong>, không
        phải để duyệt trước. Phá hoại gần như luôn là điểm thấp gửi ẩn danh; hai bộ lọc
        đầu lọc đúng nhóm đó. &ldquo;Gỡ hiển thị&rdquo; ẩn đánh giá khỏi hồ sơ nhưng
        giữ lại bản ghi (bật lại được); &ldquo;Xoá&rdquo; là vĩnh viễn. PT không tự xoá
        được đánh giá về mình (họ chỉ trả lời công khai), nên đây là chỗ duy nhất xử lý được.
      </p>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
          {error}
        </div>
      )}
      {/* Xem ghi chú cùng dạng trong app/admin/page.tsx. */}
      {loading && !data && (
        <Loading label="Đang tải đánh giá" className="space-y-3">
          {repeat(4, () => (
            <div className="card space-y-2 p-4">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </Loading>
      )}

      {data && data.items.length === 0 && !loading && (
        <div className="card p-12 text-center">
          <p className="font-medium text-slate-900">Không có đánh giá nào khớp bộ lọc</p>
        </div>
      )}

      {data && data.items.length > 0 && (
        <Refreshing busy={loading} className="space-y-3">
          {data.items.map((item) => (
            <div key={item.id} className="card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <RatingStars rating={item.rating} showValue={false} />
                <Link
                  href={`/pt/${item.pt_slug}`}
                  className="text-sm font-semibold text-emerald-600 hover:underline"
                >
                  {item.pt_name}
                </Link>
                {item.is_anonymous ? (
                  <span className="badge bg-amber-50 text-amber-700">Ẩn danh</span>
                ) : (
                  <span className="badge bg-slate-100 text-slate-500">Có tài khoản</span>
                )}
                {item.has_reply && (
                  <span className="badge bg-sky-50 text-sky-700">PT đã trả lời</span>
                )}
                {item.approved_at ? (
                  <span className="badge bg-emerald-50 text-emerald-700">Đang hiển thị</span>
                ) : (
                  <span className="badge bg-amber-50 text-amber-700">Đã bị ẩn</span>
                )}
                <span className="text-xs text-slate-400">{timeAgo(item.created_at)}</span>
              </div>

              {item.content && (
                <p className="mt-2 whitespace-pre-line text-sm text-slate-700">
                  {item.content}
                </p>
              )}
              {item.image_count > 0 && (
                <p className="mt-1 text-xs text-slate-400">
                  {item.image_count} ảnh kèm theo
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                <p className="text-xs text-slate-500">
                  {item.reviewer_name}
                  {item.reviewer_phone && (
                    <span className="ml-2 text-slate-400">{item.reviewer_phone}</span>
                  )}
                </p>
                {/* Xác nhận hai bước: xoá là không hoàn tác được, và bấm nhầm
                    một dòng trong danh sách dài là chuyện rất dễ xảy ra. */}
                {confirmId === item.id ? (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-rose-600">Xoá vĩnh viễn?</span>
                    <button
                      onClick={() => remove(item)}
                      disabled={deletingId === item.id}
                      className="text-sm font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-50"
                    >
                      {deletingId === item.id ? "Đang xoá..." : "Xoá"}
                    </button>
                    <button
                      onClick={() => setConfirmId("")}
                      className="text-sm text-slate-500 hover:text-slate-900"
                    >
                      Huỷ
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Xử lý HỒ SƠ, không phải đánh giá: gỡ một đánh giá xấu chỉ
                        dọn triệu chứng khi vấn đề là chính PT. Đặt ở đây vì đây
                        là nơi báo cáo đi vào. */}
                    <SuspendPTButton
                      slug={item.pt_slug}
                      ptName={item.pt_name}
                      suspended={item.pt_suspended}
                      onChanged={() => load()}
                    />
                    {item.approved_at ? (
                      <button
                        onClick={() => moderate(item, false)}
                        disabled={moderatingId === item.id}
                        className="text-sm font-semibold text-amber-600 hover:text-amber-700 disabled:opacity-50"
                      >
                        {moderatingId === item.id ? "Đang gỡ..." : "Gỡ hiển thị"}
                      </button>
                    ) : (
                      <button
                        onClick={() => moderate(item, true)}
                        disabled={moderatingId === item.id}
                        className="btn-primary px-3 py-1.5 text-sm disabled:opacity-50"
                      >
                        {moderatingId === item.id ? "Đang bật..." : "Hiện lại"}
                      </button>
                    )}
                    <button
                      onClick={() => setConfirmId(item.id)}
                      className="text-sm font-semibold text-slate-500 hover:text-rose-600"
                    >
                      Xoá
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </Refreshing>
      )}

      {data && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            className="btn-secondary"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Trước
          </button>
          <span className="text-sm text-slate-500">
            {page} / {totalPages}
          </span>
          <button
            className="btn-secondary"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Sau
          </button>
        </div>
      )}
    </>
  );
}

export default function AdminReviewsPage() {
  return (
    <AdminShell>
      <ReviewsContent />
    </AdminShell>
  );
}
