"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { Loading, Refreshing, repeat, Skeleton } from "@/components/Skeleton";
import { ApiError, apiFetch } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import type { FeedbackItem, FeedbackList } from "@/lib/types";

/**
 * Hộp thư góp ý.
 *
 * Trước trang này, bảng `feedbacks` chỉ có đường ghi: form gửi vào, không gì đọc
 * ra được — trong khi giao diện nói với người gửi là "chúng tôi sẽ xem xét và
 * cải thiện PTMatch dựa trên phản hồi của bạn". Một lời hứa với cái bảng không
 * ai đọc.
 */

const CATEGORY_LABEL: Record<string, { label: string; cls: string }> = {
  bug: { label: "Lỗi", cls: "bg-rose-50 text-rose-700" },
  feature: { label: "Đề xuất", cls: "bg-emerald-50 text-emerald-700" },
  ui: { label: "Giao diện", cls: "bg-sky-50 text-sky-700" },
  other: { label: "Khác", cls: "bg-slate-100 text-slate-600" },
};

const PAGE_SIZE = 20;

function FeedbackContent() {
  const [category, setCategory] = useState("");
  const [onlyPending, setOnlyPending] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<FeedbackList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [togglingId, setTogglingId] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
    if (category) params.set("category", category);
    if (onlyPending) params.set("only_pending", "true");

    apiFetch<FeedbackList>(`/api/admin/feedback?${params}`, { auth: true })
      .then(setData)
      .catch((err) =>
        setError(
          err instanceof ApiError && err.status === 403
            ? "Tài khoản này không có quyền admin."
            : "Không tải được góp ý."
        )
      )
      .finally(() => setLoading(false));
  }, [page, category, onlyPending]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleHandled(item: FeedbackItem) {
    setTogglingId(item.id);
    try {
      const updated = await apiFetch<FeedbackItem>(`/api/admin/feedback/${item.id}`, {
        method: "PATCH",
        auth: true,
      });
      // Cập nhật đúng một dòng, không tải lại cả trang: đang đọc dở một góp ý
      // dài mà danh sách nhảy về đầu thì mất chỗ.
      setData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((i) => (i.id === updated.id ? updated : i)),
              pending: prev.pending + (updated.handled_at ? -1 : 1),
            }
          : prev
      );
    } catch {
      setError("Không cập nhật được trạng thái.");
    } finally {
      setTogglingId("");
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Góp ý từ người dùng</h1>
          <p className="mt-1 text-sm text-slate-500">
            {data
              ? `${data.total} góp ý · ${data.pending} chưa xử lý`
              : "Đang tải..."}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <select
            className="input w-auto py-1.5 text-sm"
            value={category}
            onChange={(e) => {
              setPage(1);
              setCategory(e.target.value);
            }}
          >
            <option value="">Tất cả loại</option>
            {Object.entries(CATEGORY_LABEL).map(([key, v]) => (
              <option key={key} value={key}>{v.label}</option>
            ))}
          </select>
          <button
            onClick={() => {
              setPage(1);
              setOnlyPending((v) => !v);
            }}
            className={`rounded-lg border-2 px-3 py-1.5 text-sm font-semibold transition-all ${
              onlyPending
                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                : "border-slate-200 text-slate-500 hover:border-emerald-300"
            }`}
          >
            Chưa xử lý
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
          {error}
        </div>
      )}
      {/* Xem ghi chú cùng dạng trong app/admin/page.tsx. */}
      {loading && !data && (
        <Loading label="Đang tải góp ý" className="space-y-3">
          {repeat(4, () => (
            <div className="card space-y-2 p-4">
              <Skeleton className="h-5 w-28 rounded-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </Loading>
      )}

      {data && data.items.length === 0 && !loading && (
        <div className="card p-12 text-center">
          <p className="font-medium text-slate-900">
            {onlyPending || category ? "Không có góp ý nào khớp bộ lọc" : "Chưa có góp ý nào"}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Người dùng gửi góp ý tại trang /feedback.
          </p>
        </div>
      )}

      {data && data.items.length > 0 && (
        <Refreshing busy={loading} className="space-y-3">
          {data.items.map((item) => {
            const cat = CATEGORY_LABEL[item.category] ?? CATEGORY_LABEL.other;
            const handled = Boolean(item.handled_at);
            return (
              <div
                key={item.id}
                className={`card p-4 ${handled ? "opacity-60" : ""}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`badge ${cat.cls}`}>{cat.label}</span>
                  <span className="text-xs text-slate-400">{timeAgo(item.created_at)}</span>
                  {handled && (
                    <span className="badge bg-slate-100 text-slate-500">Đã xử lý</span>
                  )}
                </div>

                {/* Nội dung góp ý là văn bản người dùng nhập — whitespace-pre-line
                    để giữ ngắt dòng họ gõ, và không bao giờ render như HTML. */}
                <p className="mt-2 whitespace-pre-line text-sm text-slate-700">
                  {item.message}
                </p>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <div className="text-xs text-slate-500">
                    {item.contact_email ? (
                      <a
                        href={`mailto:${item.contact_email}`}
                        className="font-semibold text-emerald-600 hover:underline"
                      >
                        {item.contact_email}
                      </a>
                    ) : (
                      <span className="text-slate-400">Không để lại email</span>
                    )}
                    {item.user_email && item.user_email !== item.contact_email && (
                      <span className="ml-2 text-slate-400">
                        (tài khoản: {item.user_email})
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => toggleHandled(item)}
                    disabled={togglingId === item.id}
                    className="text-sm font-semibold text-slate-500 hover:text-slate-900 disabled:opacity-50"
                  >
                    {togglingId === item.id
                      ? "..."
                      : handled
                        ? "Đánh dấu chưa xử lý"
                        : "Đánh dấu đã xử lý"}
                  </button>
                </div>
              </div>
            );
          })}
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

export default function AdminFeedbackPage() {
  return (
    <AdminShell>
      <FeedbackContent />
    </AdminShell>
  );
}
