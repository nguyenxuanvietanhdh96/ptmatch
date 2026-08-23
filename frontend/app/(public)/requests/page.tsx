"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import LocationSelect from "@/components/LocationSelect";
import RequestCard from "@/components/RequestCard";
import { Loading, Refreshing, RequestCardSkeleton, repeat } from "@/components/Skeleton";
import { ApiError, apiFetch, buildQuery } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";
import { PRICE_OPTIONS, SPECIALTIES } from "@/lib/constants";
import type { Paginated, TraineeRequest } from "@/lib/types";

/**
 * Bảng "Học viên cần PT" — chiều ngược của marketplace.
 *
 * Render phía client chứ không SSR như /pts, vì cờ `claimed_by_me` phụ thuộc
 * vào Bearer token (chỉ có ở trình duyệt). SSR sẽ luôn trả về trạng thái của
 * khách vãng lai, khiến PT đã nhận vẫn thấy nút "Nhận" rồi bấm vào và bị 409.
 * Trang này cũng noindex nên không mất gì về SEO — xem layout.tsx cùng thư mục.
 */
const PAGE_SIZE = 12;

// Gộp các thay đổi bộ lọc liên tiếp thành một lời gọi API. Chọn tỉnh xong chọn
// tiếp phường là hai lần đổi state cách nhau chưa tới một giây; không gộp lại
// thì bắn hai request, và cái về sau cùng — không phải cái mới nhất — là cái
// được hiển thị.
const FILTER_DEBOUNCE_MS = 350;

export default function RequestBoardPage() {
  const t = useTranslations("requestBoard");
  const [filters, setFilters] = useState({ specialty: "", city: "", ward: "", budget_min: "" });
  // Bộ lọc đã "chốt" sau debounce; đây mới là thứ kích hoạt gọi API.
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [items, setItems] = useState<TraineeRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  // "Xem thêm" khác với "đổi bộ lọc": lượt nối thêm không được làm mờ những thẻ
  // người dùng đang đọc — nút đã tự báo trạng thái của nó rồi.
  const [appending, setAppending] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setAppliedFilters(filters), FILTER_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [filters]);

  const load = useCallback(
    async (nextPage: number, append: boolean) => {
      // Huỷ request đang bay: nếu không, một phản hồi cũ về muộn sẽ ghi đè lên
      // kết quả mới hơn và danh sách hiện ra không khớp với bộ lọc đang chọn.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setAppending(append);
      setError("");
      try {
        const query = buildQuery({
          ...appliedFilters,
          page: nextPage,
          page_size: PAGE_SIZE,
        });
        const data = await apiFetch<Paginated<TraineeRequest>>(`/api/requests${query}`, {
          auth: isLoggedIn(),
          signal: controller.signal,
        });
        setItems((prev) => (append ? [...prev, ...(data.items ?? [])] : data.items ?? []));
        setTotal(data.total ?? 0);
        setPage(nextPage);
      } catch (err) {
        // Bị huỷ vì có request mới hơn — không phải lỗi, và tuyệt đối không
        // được đụng vào state của lượt tải đang chạy.
        if (controller.signal.aborted) return;
        setError(err instanceof ApiError ? err.message : t("loadFailed"));
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setAppending(false);
        }
      }
    },
    [appliedFilters]
  );

  useEffect(() => {
    load(1, false);
  }, [load]);

  // Huỷ request còn treo khi rời trang.
  useEffect(() => () => abortRef.current?.abort(), []);

  const hasFilters = Object.values(appliedFilters).some(Boolean);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("heading")}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {/* Không hiện "0 yêu cầu" khi tải lỗi — đó là con số bịa, và nó
                khiến PT tưởng chợ vắng rồi bỏ đi thay vì thử lại. */}
            {error
              ? " "
              : loading && items.length === 0
                ? t("loading")
                : t("count", { total })}
          </p>
        </div>
        <Link href="/requests/new" className="btn-primary">
          {t("post")}
        </Link>
      </div>

      <div className="card mt-5 grid gap-3 p-4 sm:grid-cols-4">
        <div>
          <label className="label" htmlFor="r-specialty">{t("goal")}</label>
          <select
            id="r-specialty"
            className="input"
            value={filters.specialty}
            onChange={(e) => setFilters((f) => ({ ...f, specialty: e.target.value }))}
          >
            <option value="">{t("all")}</option>
            {SPECIALTIES.map((s) => (
              <option key={s.slug} value={s.slug}>{s.label}</option>
            ))}
          </select>
        </div>
        {/*
          Chọn từ danh mục thay cho ô gõ tự do.
          Ô tự do trước đây gợi ý "VD: Quận 7" — một đơn vị hành chính đã bị bãi
          bỏ từ 01/07/2025 — và người gõ tay thì mỗi người một kiểu, trong khi
          học viên đăng yêu cầu lại chọn từ danh sách. Hai bên nhập khác dạng thì
          không bao giờ gặp nhau.
        */}
        <LocationSelect
          layout="contents"
          cityValue={filters.city}
          wardValue={filters.ward}
          onCityChange={(v) => setFilters((f) => ({ ...f, city: v, ward: "" }))}
          onWardChange={(v) => setFilters((f) => ({ ...f, ward: v }))}
        />
        <div>
          <label className="label" htmlFor="r-budget">{t("minBudget")}</label>
          <select
            id="r-budget"
            className="input"
            value={filters.budget_min}
            onChange={(e) => setFilters((f) => ({ ...f, budget_min: e.target.value }))}
          >
            <option value="">{t("all")}</option>
            {PRICE_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>{t("budgetOption", { label: p.label })}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-sm text-rose-600">{error}</p>
          <button
            className="btn-secondary"
            disabled={loading}
            onClick={() => load(1, false)}
          >
            {loading ? t("retrying") : t("retry")}
          </button>
        </div>
      )}

      {!loading && items.length === 0 && !error && (
        <div className="card mt-5 p-8 text-center">
          <p className="font-medium text-slate-900">{t("emptyTitle")}</p>
          <p className="mt-1 text-sm text-slate-500">
            {t("emptyBody")}
          </p>
          {hasFilters && (
            <button
              type="button"
              className="btn-secondary mt-4"
              onClick={() => setFilters({ specialty: "", city: "", ward: "", budget_min: "" })}
            >
              {t("clearFilters")}
            </button>
          )}
        </div>
      )}

      {/*
        Hai trạng thái chờ khác nhau, cố ý:

        - Lần đầu (chưa có gì trên màn hình): skeleton, để chiều cao của lưới có
          sẵn thay vì trang thụt lên rồi giãn ra khi dữ liệu về.
        - Đổi bộ lọc (đã có danh sách): giữ nguyên danh sách và làm mờ. Thay nó
          bằng skeleton là mất chỗ người dùng đang đọc và thêm một cú nhảy nữa,
          trong khi phần lớn lần lọc chỉ mất vài trăm ms.
      */}
      {loading && items.length === 0 && !error ? (
        <Loading label={t("loadingList")} className="mt-5 grid gap-4 sm:grid-cols-2">
          {repeat(4, () => (
            <RequestCardSkeleton />
          ))}
        </Loading>
      ) : (
        <Refreshing busy={loading && !appending} className="mt-5 grid gap-4 sm:grid-cols-2">
          {items.map((request) => (
            <RequestCard key={request.id} request={request} />
          ))}
        </Refreshing>
      )}

      {items.length < total && (
        <div className="mt-6 text-center">
          <button className="btn-secondary" disabled={loading} onClick={() => load(page + 1, true)}>
            {loading ? t("loading") : t("loadMore")}
          </button>
        </div>
      )}
    </div>
  );
}
