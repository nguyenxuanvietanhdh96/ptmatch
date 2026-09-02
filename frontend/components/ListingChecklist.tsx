"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

/**
 * Cho PT biết hồ sơ đã đủ điều kiện hiển thị công khai chưa.
 *
 * Hồ sơ thiếu ảnh/giá/khu vực bị loại khỏi /pts và sitemap (xem backend
 * app/services/listing.py). Không có khối này thì PT không có cách nào biết
 * điều đó: dashboard vẫn mở bình thường, hồ sơ vẫn "tồn tại", chỉ là không ai
 * tìm thấy — và họ sẽ kết luận nền tảng không có người dùng.
 *
 * Backend gửi sang KHOÁ kỹ thuật (avatar/price/location); nhãn hiển thị nằm
 * trong messages/<locale>.json cùng namespace. Luật thuộc về backend, frontend
 * chỉ dịch sang tiếng người — và dịch sang ngôn ngữ nào là việc của catalog.
 *
 * Khi hồ sơ đã đủ điều kiện, khối này đưa PT tới ĐÚNG chỗ để tự kiểm chứng:
 * /pts?q=<tên> — trang tìm kiếm là `force-dynamic`, không qua cache, nên kết
 * quả luôn có họ. Nói "đang hiển thị công khai" rồi để PT tự đi tìm là cách
 * chắc chắn nhất khiến họ soi mục "PT nổi bật" ở trang chủ — mục đó chỉ lấy 6
 * hồ sơ điểm cao nhất, hồ sơ mới chưa có đánh giá thì không xuất hiện, và họ
 * kết luận nền tảng lỗi. Một cú click chắc chắn thành công hơn mọi lời giải
 * thích.
 */

interface ListingChecklistProps {
  missing: string[];
  slug?: string;
  /** Dùng làm từ khoá cho link "tìm tôi trên trang tìm kiếm". */
  fullName?: string;
  /** Ẩn nút "Bổ sung ngay" khi đang ở chính trang chỉnh sửa hồ sơ. */
  hideAction?: boolean;
}

export default function ListingChecklist({
  missing,
  slug,
  fullName,
  hideAction,
}: ListingChecklistProps) {
  const t = useTranslations("listingChecklist");
  if (missing.length === 0) {
    const searchHref = fullName?.trim()
      ? `/pts?q=${encodeURIComponent(fullName.trim())}`
      : "/pts";
    return (
      <div className="card border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-start gap-3">
          <svg className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-emerald-900">
              {t("liveTitle")}
            </p>
            <p className="mt-1 text-sm text-emerald-800">
              {t("homeNote")}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Link
                href={searchHref}
                className="text-sm font-semibold text-emerald-700 hover:underline"
              >
                {t("findMe")}
              </Link>
              {slug && (
                <Link
                  href={`/pt/${slug}`}
                  className="text-sm font-semibold text-emerald-700 hover:underline"
                >
                  {t("viewMine")}
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900">
            {t("pendingTitle")}
          </p>
          <p className="mt-1 text-sm text-amber-800">
            {t("pendingBody")}
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {missing.map((key) => (
              <li
                key={key}
                className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-amber-900 ring-1 ring-amber-200"
              >
                {t.has(key) ? t(key) : key}
              </li>
            ))}
          </ul>
          {!hideAction && (
            <Link href="/dashboard/profile" className="btn-primary mt-4">
              {t("fix")}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
