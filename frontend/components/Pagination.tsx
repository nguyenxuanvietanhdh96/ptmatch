import Link from "next/link";
import { useTranslations } from "next-intl";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  params: Record<string, string | undefined>;
}

function buildHref(basePath: string, params: Record<string, string | undefined>, page: number): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) sp.set(k, v);
  }
  sp.set("page", String(page));
  return `${basePath}?${sp.toString()}`;
}

export default function Pagination({ page, pageSize, total, basePath, params }: PaginationProps) {
  const t = useTranslations("pagination");
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  if (totalPages <= 1) return null;

  const pages: number[] = [];
  for (let p = Math.max(1, page - 2); p <= Math.min(totalPages, page + 2); p++) {
    pages.push(p);
  }

  return (
    <nav className="mt-8 flex items-center justify-center gap-1" aria-label={t("label")}>
      {page > 1 && (
        <Link href={buildHref(basePath, params, page - 1)} className="btn-secondary px-3 py-2">
          {t("prev")}
        </Link>
      )}
      {pages[0] > 1 && <span className="px-2 text-slate-400">…</span>}
      {pages.map((p) => (
        <Link
          key={p}
          href={buildHref(basePath, params, p)}
          className={
            p === page
              ? "btn bg-emerald-600 px-3.5 py-2 text-white"
              : "btn-secondary px-3.5 py-2"
          }
        >
          {p}
        </Link>
      ))}
      {pages[pages.length - 1] < totalPages && <span className="px-2 text-slate-400">…</span>}
      {page < totalPages && (
        <Link href={buildHref(basePath, params, page + 1)} className="btn-secondary px-3 py-2">
          {t("next")}
        </Link>
      )}
    </nav>
  );
}
