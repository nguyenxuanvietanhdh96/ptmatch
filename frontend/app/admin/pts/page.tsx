"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import Avatar from "@/components/Avatar";
import PTModerationActions from "@/components/PTModerationActions";
import { Loading, Refreshing, repeat, Skeleton } from "@/components/Skeleton";
import { ApiError, apiFetch } from "@/lib/api";
import type { AdminPTList } from "@/lib/types";

/**
 * Danh sách hồ sơ PT — nơi xử lý được MỌI PT, không chỉ PT đã có lead hoặc
 * đánh giá.
 *
 * Các thao tác xử lý ban đầu chỉ nằm trong trang Đánh giá và Đường ống lead, tức
 * là chỉ với tới được PT đã xuất hiện ở một trong hai chỗ đó. Một PT vừa đăng ký
 * và đang làm phiền học viên qua kênh khác thì không hiện ra ở đâu cả — trang
 * này lấp đúng khoảng đó.
 *
 * CỐ Ý không phải "danh sách người dùng": chỉ có hồ sơ PT, và chỉ những trường
 * vốn đã công khai (tên, slug, ảnh, mức hoàn thiện) cộng trạng thái xử lý. Không
 * email, không số điện thoại — admin cần xử lý một hồ sơ, không cần đọc thông
 * tin liên hệ của chủ nó, mà một trang liệt kê PII thì chỉ cần lộ một lần.
 */

const PAGE_SIZE = 25;

const MISSING_LABEL: Record<string, string> = {
  avatar: "ảnh",
  price: "giá",
  location: "khu vực",
};

function PTsContent() {
  const [q, setQ] = useState("");
  // Giá trị thật dùng để gọi API, cập nhật khi bấm Tìm — không gọi theo từng
  // ký tự gõ vào.
  const [query, setQuery] = useState("");
  const [includeClosed, setIncludeClosed] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminPTList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(PAGE_SIZE),
    });
    if (query) params.set("q", query);
    if (includeClosed) params.set("include_closed", "true");

    apiFetch<AdminPTList>(`/api/admin/pts?${params}`, { auth: true })
      .then(setData)
      .catch((err) =>
        setError(
          err instanceof ApiError && err.status === 403
            ? "Tài khoản này không có quyền admin."
            : "Không tải được danh sách PT."
        )
      )
      .finally(() => setLoading(false));
  }, [page, query, includeClosed]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Hồ sơ PT</h1>
        <p className="mt-1 text-sm text-slate-500">
          Xử lý được cả hồ sơ chưa có lead lẫn đánh giá. Dán slug lấy từ báo cáo
          vào ô tìm để tới đúng hồ sơ.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQuery(q.trim());
        }}
        className="card mt-4 flex flex-wrap items-end gap-3 p-4"
      >
        <div className="min-w-[220px] flex-1">
          <label className="label" htmlFor="admin-pt-q">
            Tên hoặc slug
          </label>
          <input
            id="admin-pt-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="nguyen-xuan-viet-anh"
            className="input"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={includeClosed}
            onChange={(e) => {
              setPage(1);
              setIncludeClosed(e.target.checked);
            }}
          />
          Hiện cả tài khoản đã đóng
        </label>
        <button type="submit" className="btn-primary px-4 py-2 text-sm">
          Tìm
        </button>
      </form>

      {error && (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </p>
      )}

      {loading && !data && (
        <Loading className="mt-4 space-y-3">
          {repeat(4, (i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </Loading>
      )}

      {data && data.items.length === 0 && !loading && (
        <div className="card mt-4 p-12 text-center">
          <p className="font-medium text-slate-900">Không có hồ sơ nào khớp</p>
        </div>
      )}

      {data && data.items.length > 0 && (
        <Refreshing busy={loading} className="mt-4 space-y-3">
          <p className="text-xs text-slate-400">{data.total} hồ sơ</p>
          {data.items.map((pt) => (
            <div key={pt.slug} className="card p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Avatar src={pt.avatar_url} name={pt.full_name ?? pt.slug} size={40} />
                <div className="min-w-0">
                  <Link
                    href={`/pt/${pt.slug}`}
                    className="font-semibold text-emerald-600 hover:underline"
                  >
                    {pt.full_name || pt.slug}
                  </Link>
                  <p className="text-xs text-slate-400">{pt.slug}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {!pt.is_active && (
                    <span className="badge bg-slate-100 text-slate-500">PT tự ẩn</span>
                  )}
                  {pt.missing_listing.length > 0 && (
                    <span className="badge bg-amber-50 text-amber-700">
                      Thiếu {pt.missing_listing.map((k) => MISSING_LABEL[k] ?? k).join(", ")}
                    </span>
                  )}
                  {pt.missing_listing.length === 0 &&
                    pt.is_active &&
                    !pt.suspended &&
                    !pt.deleted && (
                      <span className="badge bg-emerald-50 text-emerald-700">Đang hiển thị</span>
                    )}
                </div>

                <div className="ml-auto text-right text-xs text-slate-400">
                  {pt.leads} lead · {pt.review_count} đánh giá
                </div>
              </div>

              {(pt.suspended_reason || pt.ban_reason) && (
                <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-900">
                  {pt.suspended_reason && <>Đình chỉ: {pt.suspended_reason}. </>}
                  {pt.ban_reason && <>Khoá: {pt.ban_reason}.</>}
                </p>
              )}

              <div className="mt-3 border-t border-slate-100 pt-3">
                <PTModerationActions
                  slug={pt.slug}
                  ptName={pt.full_name || pt.slug}
                  suspended={pt.suspended}
                  banned={pt.banned}
                  deleted={pt.deleted}
                  onChanged={() => load()}
                />
              </div>
            </div>
          ))}

        </Refreshing>
      )}

      {data && totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
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

export default function AdminPTsPage() {
  return (
    <AdminShell>
      <PTsContent />
    </AdminShell>
  );
}
