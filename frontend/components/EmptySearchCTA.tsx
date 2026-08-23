"use client";

import Link from "next/link";
import { EVENTS, track } from "@/lib/analytics";
import { buildQuery } from "@/lib/api";
import { useTranslations } from "next-intl";

interface EmptySearchCTAProps {
  specialty?: string;
  city?: string;
  ward?: string;
}

/**
 * Lối thoát cho lượt tìm kiếm không ra kết quả nào.
 *
 * Khi nguồn cung mới có vài chục PT trong một quận thì phần lớn tổ hợp lọc sẽ
 * ra rỗng. Nếu màn hình đó chỉ mời "xoá bộ lọc" thì nhu cầu vừa được khai mất
 * luôn — trong khi chợ ngược sinh ra chính là để hứng đúng ca này: đăng một
 * lần, PT phù hợp tự tìm đến.
 *
 * Chuyển tiếp chuyên môn và khu vực đang lọc sang form để không phải khai lại.
 */
export default function EmptySearchCTA({ specialty, city, ward }: EmptySearchCTAProps) {
  const t = useTranslations("emptySearch");
  const href = `/requests/new${buildQuery({ specialty, city, ward })}`;

  return (
    <div className="mt-5 flex flex-col items-center gap-3">
      <Link
        href={href}
        className="btn-primary"
        onClick={() => track(EVENTS.emptySearchToRequest, { specialty, ward, city })}
      >
        {t("post")}
      </Link>
      <Link href="/pts" className="text-sm font-semibold text-slate-500 hover:text-emerald-600">
        {t("clear")}
      </Link>
    </div>
  );
}
