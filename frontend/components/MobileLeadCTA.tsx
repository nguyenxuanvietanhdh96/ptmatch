"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { EVENTS, track } from "@/lib/analytics";
import { formatVND } from "@/lib/format";

interface MobileLeadCTAProps {
  ptSlug: string;
  ptName: string;
  pricePerSession?: number | null;
  /** id của khối chứa form lead trên trang hồ sơ. */
  targetId: string;
}

/**
 * Thanh CTA ghim đáy màn hình, chỉ có trên mobile.
 *
 * Form lead nằm trong cột phải và chỉ `lg:sticky`, nên ở một cột (mobile) nó
 * rơi xuống tận cuối trang, sau cả danh sách đánh giá. Lưu lượng quảng cáo gần
 * như toàn mobile, tức phần lớn người xem hồ sơ sẽ không bao giờ cuộn tới ô
 * nhập nếu không có lối tắt này.
 *
 * Thanh tự ẩn khi form đã nằm trong khung nhìn — nếu không nó che đúng nút
 * "Gửi yêu cầu tư vấn" mà nó dẫn người ta tới.
 */
export default function MobileLeadCTA({ ptSlug, ptName, pricePerSession, targetId }: MobileLeadCTAProps) {
  const t = useTranslations("mobileCTA");
  const [formVisible, setFormVisible] = useState(false);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target) return;
    const observer = new IntersectionObserver(
      ([entry]) => setFormVisible(entry.isIntersecting),
      // rootMargin âm ở đáy: coi như "đã thấy form" chỉ khi nó thực sự nổi lên
      // trên thanh, không phải lúc mép trên vừa ló ra sau thanh.
      { rootMargin: "0px 0px -96px 0px", threshold: 0 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId]);

  function handleClick() {
    track(EVENTS.leadCtaMobile, { pt_slug: ptSlug });
    document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(15,23,42,0.08)] backdrop-blur transition-transform duration-200 lg:hidden ${
        formVisible ? "translate-y-full" : "translate-y-0"
      }`}
      // Ẩn khỏi luồng đọc của trình đọc màn hình khi đang trượt khỏi màn hình,
      // để nút không bị đọc hai lần cùng với nút thật trong form.
      aria-hidden={formVisible}
    >
      <div className="mx-auto flex max-w-2xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{ptName}</p>
          {pricePerSession ? (
            <p className="text-xs text-slate-500">{t("perSession", { price: formatVND(pricePerSession) })}</p>
          ) : (
            <p className="text-xs text-slate-500">{t("freeNote")}</p>
          )}
        </div>
        <button type="button" onClick={handleClick} className="btn-primary shrink-0" tabIndex={formVisible ? -1 : 0}>
          {t("cta")}
        </button>
      </div>
    </div>
  );
}
