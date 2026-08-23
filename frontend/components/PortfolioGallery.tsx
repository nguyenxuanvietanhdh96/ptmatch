"use client";

import { useLightbox, type LightboxImage } from "@/components/Lightbox";
import type { PortfolioItem } from "@/lib/types";
import { useTranslations } from "next-intl";

/* eslint-disable @next/next/no-img-element */

/**
 * Gom mọi ảnh của portfolio thành một danh sách phẳng theo đúng thứ tự hiển
 * thị, để khi mở lightbox người xem lướt được qua lại toàn bộ chứ không kẹt ở
 * một tấm. `index` trả về là vị trí của ảnh trong danh sách đó.
 */
// `t` truyền vào thay vì gọi hook: đây là hàm thuần, chạy ngoài thân component.
function collectImages(
  beforeAfters: PortfolioItem[],
  photos: PortfolioItem[],
  t: (key: string) => string
): LightboxImage[] {
  const images: LightboxImage[] = [];
  for (const item of beforeAfters) {
    if (item.before_url) {
      images.push({ src: item.before_url, alt: t("beforeAlt"), caption: item.description || t("before") });
    }
    if (item.after_url) {
      images.push({ src: item.after_url, alt: t("afterAlt"), caption: item.description || t("after") });
    }
  }
  for (const item of photos) {
    if (item.media_url) {
      images.push({
        src: item.media_url,
        alt: item.description || t("itemAlt"),
        caption: item.description || undefined,
      });
    }
  }
  return images;
}

const THUMB_CLASS = "block w-full cursor-zoom-in transition hover:opacity-90";

export default function PortfolioGallery({ items }: { items: PortfolioItem[] }) {
  const t = useTranslations("portfolio");
  const { open, lightbox } = useLightbox();

  const sorted = [...(items ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const beforeAfters = sorted.filter((i) => i.type === "before_after");
  const photos = sorted.filter((i) => i.type === "photo");
  const videos = sorted.filter((i) => i.type === "video");

  const images = collectImages(beforeAfters, photos, t);
  // Vị trí bắt đầu của nhóm ảnh học viên trong danh sách phẳng.
  const photosOffset = images.length - photos.filter((i) => i.media_url).length;

  if (!items || items.length === 0) return null;

  return (
    <div className="space-y-6">
      {beforeAfters.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{t("beforeAfterHeading")}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {beforeAfters.map((item, itemIndex) => {
              // Mỗi mục trước/sau đóng góp tối đa 2 ảnh vào danh sách phẳng.
              const baseIndex = beforeAfters
                .slice(0, itemIndex)
                .reduce((n, prev) => n + (prev.before_url ? 1 : 0) + (prev.after_url ? 1 : 0), 0);
              return (
                <div key={item.id} className="card overflow-hidden">
                  <div className="grid grid-cols-2">
                    <div className="relative">
                      {item.before_url ? (
                        <button
                          type="button"
                          className={THUMB_CLASS}
                          onClick={() => open(images, baseIndex)}
                          aria-label={t("zoomBefore")}
                        >
                          <img src={item.before_url} alt={t("beforeAlt")} className="aspect-[3/4] w-full object-cover" />
                        </button>
                      ) : (
                        <div className="aspect-[3/4] w-full bg-slate-100" />
                      )}
                      <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-slate-900/80 px-2 py-0.5 text-xs font-semibold text-white">
                        {t("before")}
                      </span>
                    </div>
                    <div className="relative">
                      {item.after_url ? (
                        <button
                          type="button"
                          className={THUMB_CLASS}
                          onClick={() => open(images, baseIndex + (item.before_url ? 1 : 0))}
                          aria-label={t("zoomAfter")}
                        >
                          <img src={item.after_url} alt={t("afterAlt")} className="aspect-[3/4] w-full object-cover" />
                        </button>
                      ) : (
                        <div className="aspect-[3/4] w-full bg-slate-100" />
                      )}
                      <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-emerald-600/90 px-2 py-0.5 text-xs font-semibold text-white">
                        Sau
                      </span>
                    </div>
                  </div>
                  {item.description && <p className="p-3 text-sm text-slate-600">{item.description}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {photos.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{t("photosHeading")}</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {photos.map((item, photoIndex) => (
              <div key={item.id} className="card overflow-hidden">
                {item.media_url && (
                  <button
                    type="button"
                    className={THUMB_CLASS}
                    onClick={() => open(images, photosOffset + photoIndex)}
                    aria-label={item.description ? t("zoomNamed", { name: item.description }) : t("zoom")}
                  >
                    <img
                      src={item.media_url}
                      alt={item.description || t("itemAlt")}
                      className="aspect-square w-full object-cover"
                    />
                  </button>
                )}
                {item.description && <p className="p-3 text-sm text-slate-600">{item.description}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {videos.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{t("videoHeading")}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {videos.map((item) => (
              <a
                key={item.id}
                href={item.media_url || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="card flex items-center gap-3 p-4 transition-shadow hover:shadow-md"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5.14v13.72L19 12 8 5.14z" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{t("videoCaption")}</p>
                  <p className="truncate text-sm text-slate-500">{item.description || item.media_url}</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {lightbox}
    </div>
  );
}
