import Link from "next/link";
import Avatar from "./Avatar";
import RatingStars from "./RatingStars";
import { specialtyLabel } from "@/lib/constants";
import { formatLastActive, formatVND } from "@/lib/format";
import type { PTSummary } from "@/lib/types";
import { useTranslations } from "next-intl";

export default function PTCard({ pt }: { pt: PTSummary }) {
  const t = useTranslations("ptCard");
  const price = pt.pricing?.per_session ?? pt.price_per_session ?? null;
  const location = pt.locations?.[0];
  // Khu vực chỉ đến từ locations[]. Trước đây còn một nhánh dự phòng đọc
  // pt.city/pt.district cấp cao — backend chưa bao giờ gửi hai trường đó, nên
  // nhánh ấy là code chết giả vờ có ý nghĩa.
  const locationText = [location?.ward, location?.city].filter(Boolean).join(", ");
  const specialties = pt.specialties ?? [];
  // Chỉ hiện khi thật sự gần đây (xem formatLastActive) — mục đích là trấn an
  // "PT này còn hoạt động", nên mốc cũ thì im lặng tốt hơn.
  const lastActive = formatLastActive(pt.last_active_at, 14);

  return (
    <Link
      href={`/pt/${pt.slug}`}
      className="card group flex flex-col gap-3 p-5 transition-shadow hover:shadow-md"
    >
      <div className="flex items-center gap-4">
        <Avatar src={pt.avatar_url} name={pt.full_name} size={56} />
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-slate-900 group-hover:text-emerald-700">
            {pt.full_name}
          </h3>
          <RatingStars rating={pt.avg_rating} count={pt.review_count} />
        </div>
      </div>

      {specialties.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {specialties.slice(0, 3).map((s) => (
            <span key={s} className="badge">
              {specialtyLabel(s)}
            </span>
          ))}
          {specialties.length > 3 && (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500">
              +{specialties.length - 3}
            </span>
          )}
        </div>
      )}

      <div className="mt-auto flex items-end justify-between gap-2 border-t border-slate-100 pt-3">
        <div className="min-w-0 text-sm text-slate-500">
          {locationText ? (
            <span className="flex items-center gap-1 truncate">
              <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              <span className="truncate">{locationText}</span>
            </span>
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-slate-400">{t("pricePerSession")}</p>
          <p className="font-bold text-emerald-600">{formatVND(price)}</p>
        </div>
      </div>
      {lastActive && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
          {lastActive}
        </p>
      )}
    </Link>
  );
}
