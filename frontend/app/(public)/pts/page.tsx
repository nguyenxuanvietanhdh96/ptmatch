import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cache, Suspense } from "react";
import EmptySearchCTA from "@/components/EmptySearchCTA";
import PTCard from "@/components/PTCard";
import TrackEvent from "@/components/TrackEvent";
import Pagination from "@/components/Pagination";
import SearchFilters from "@/components/SearchFilters";
import { Loading, PTCardSkeleton, repeat, Skeleton } from "@/components/Skeleton";
import { EVENTS } from "@/lib/analytics";
import { apiFetch, buildQuery } from "@/lib/api";
import { specialtyLabel } from "@/lib/constants";
import type { Paginated, PTSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

export async function generateMetadata(props: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const sp = await props.searchParams;
  const specialty = first(sp.specialty);
  const ward = first(sp.ward);
  const t = await getTranslations("ptSearch");
  const parts = [t("titleBase")];
  if (specialty) parts.push(specialtyLabel(specialty));
  if (ward) parts.push(t("titleAt", { ward }));
  // Canonical chỉ giữ lại specialty + ward — hai chiều lọc thật sự tạo ra
  // trang đáng lập chỉ mục riêng. Mọi tổ hợp còn lại (sort, khoảng giá, số
  // trang, từ khoá) đều là cùng một danh sách xem theo kiểu khác; để chúng thành
  // URL riêng là tự chia nhỏ tín hiệu SEO của trang tìm kiếm chính ra hàng trăm
  // bản gần trùng nhau.
  const canonicalQuery = new URLSearchParams();
  if (specialty) canonicalQuery.set("specialty", specialty);
  if (ward) canonicalQuery.set("ward", ward);
  const canonical = canonicalQuery.size ? `/pts?${canonicalQuery}` : "/pts";

  const description = t("metaDescription", {
    specialtyPart: specialty ? t("metaSpecialty", { label: specialtyLabel(specialty) }) : "",
    wardPart: ward ? t("metaWard", { ward }) : "",
  });

  return {
    title: parts.join(" "),
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      siteName: "PTMatch",
      locale: "vi_VN",
      title: parts.join(" "),
      description,
      url: canonical,
    },
  };
}

const PAGE_SIZE = 12;

type Filters = {
  q: string;
  gender: string;
  specialty: string;
  city: string;
  ward: string;
  price_min: string;
  price_max: string;
  experience_min: string;
  sort: string;
};

/**
 * Một lời gọi API cho cả hai vùng chờ bên dưới.
 *
 * Dòng "Tìm thấy N PT" ở đầu trang và lưới kết quả nằm ở hai chỗ khác nhau
 * trong bố cục, nên là hai Suspense boundary riêng. `cache()` khiến chúng dùng
 * chung một lần fetch — không có nó là gọi backend hai lần cho mỗi lượt xem
 * trang tìm kiếm.
 *
 * Tham số là chuỗi query, không phải object: `cache` so sánh từng đối số bằng
 * `===`, nên truyền object literal thì mỗi lần gọi là một khoá khác và việc gộp
 * không xảy ra.
 */
const getResults = cache(
  async (query: string): Promise<{ data: Paginated<PTSummary>; failed: boolean }> => {
    try {
      return { data: await apiFetch<Paginated<PTSummary>>(`/api/pts${query}`), failed: false };
    } catch {
      return { data: { items: [], total: 0, page: 1, page_size: PAGE_SIZE }, failed: true };
    }
  }
);

async function ResultCount({ query }: { query: string }) {
  const t = await getTranslations("ptSearch");
  const { data, failed } = await getResults(query);
  return failed ? t("loadFailedShort") : t("found", { total: data.total ?? 0 });
}

async function Results({
  query,
  filters,
  page,
}: {
  query: string;
  filters: Filters;
  page: number;
}) {
  const t = await getTranslations("ptSearch");
  const { data, failed } = await getResults(query);
  const items = data.items ?? [];

  // Sự kiện tìm kiếm bắn ở đây, không ở vỏ trang: nó cần cả bộ lọc lẫn số kết
  // quả, mà số kết quả chỉ có sau khi backend trả lời.
  const tracker = (
    <TrackEvent
      event={EVENTS.searchPTs}
      props={{
        specialty: filters.specialty,
        ward: filters.ward,
        city: filters.city,
        sort: filters.sort,
        has_query: Boolean(filters.q),
        results: data.total ?? 0,
      }}
    />
  );

  if (items.length === 0) {
    return (
      <>
        {tracker}
        <div className="card flex flex-col items-center justify-center p-12 text-center">
          <svg className="h-12 w-12 text-slate-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197M15.803 15.803A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <h2 className="mt-4 font-semibold text-slate-900">
            {failed ? t("emptyFailedTitle") : t("emptyTitle")}
          </h2>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            {failed
              ? t("emptyFailedBody")
              : t("emptyBody")}
          </p>
          {failed ? (
            <Link href="/pts" className="btn-secondary mt-4">{t("clearFilters")}</Link>
          ) : (
            <EmptySearchCTA
              specialty={filters.specialty}
              city={filters.city}
              ward={filters.ward}
            />
          )}
        </div>
      </>
    );
  }

  return (
    <>
      {tracker}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((pt) => (
          <PTCard key={pt.id ?? pt.slug} pt={pt} />
        ))}
      </div>
      <Pagination
        page={data.page ?? page}
        pageSize={data.page_size ?? PAGE_SIZE}
        total={data.total ?? 0}
        basePath="/pts"
        params={filters}
      />
    </>
  );
}

/** Đúng lưới 6 thẻ mà kết quả thật sẽ chiếm — xem components/Skeleton.tsx. */
function ResultsSkeleton({ label }: { label: string }) {
  return (
    <Loading label={label} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {repeat(6, () => (
        <PTCardSkeleton />
      ))}
    </Loading>
  );
}

export default async function PTSearchPage(props: { searchParams: Promise<SearchParams> }) {
  const t = await getTranslations("ptSearch");
  const sp = await props.searchParams;
  const filters: Filters = {
    q: first(sp.q),
    gender: first(sp.gender),
    specialty: first(sp.specialty),
    city: first(sp.city),
    ward: first(sp.ward),
    price_min: first(sp.price_min),
    price_max: first(sp.price_max),
    experience_min: first(sp.experience_min),
    sort: first(sp.sort),
  };
  const page = Math.max(1, parseInt(first(sp.page) || "1", 10) || 1);
  const query = buildQuery({ ...filters, page, page_size: PAGE_SIZE });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          {t("heading")}
          {filters.specialty ? t("headingSpecialty", { label: specialtyLabel(filters.specialty) }) : ""}
          {filters.ward ? t("headingWard", { ward: filters.ward }) : ""}
        </h1>
        {/* div chứ không p: fallback là một khối <div>, mà div lồng trong p là
            HTML không hợp lệ — trình duyệt tự đóng thẻ p và hydration lệch. */}
        <div className="mt-1 text-sm text-slate-500">
          {/*
            Vỏ trang (tiêu đề + bộ lọc) dựng xong ngay vì chỉ cần searchParams;
            chỉ hai vùng phụ thuộc backend là phải chờ.

            `key={query}`: đổi bộ lọc là điều hướng trong cùng segment, và mặc
            định React GIỮ nội dung cũ trong lúc chờ — người dùng bấm "Áp dụng"
            rồi thấy màn hình y nguyên, tưởng nút không ăn. Khoá thay đổi buộc
            boundary dựng lại, nên fallback hiện ra.
          */}
          <Suspense key={query} fallback={<Skeleton className="inline-block h-4 w-44 align-middle" />}>
            <ResultCount query={query} />
          </Suspense>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside>
          {/* Nằm ngoài mọi Suspense: bộ lọc không phụ thuộc dữ liệu, và biến mất
              cùng kết quả mới là kiểu giật rõ nhất — người dùng mất luôn chỗ
              mình vừa chọn ngay khi vừa bấm. */}
          <SearchFilters filters={filters} />
        </aside>

        {/* Kết quả */}
        <section>
          <Suspense key={query} fallback={<ResultsSkeleton label={t("loadingList")} />}>
            <Results query={query} filters={filters} page={page} />
          </Suspense>
        </section>
      </div>
    </div>
  );
}
