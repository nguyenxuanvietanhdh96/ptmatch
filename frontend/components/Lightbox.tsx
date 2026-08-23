"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

/* eslint-disable @next/next/no-img-element */

export interface LightboxImage {
  src: string;
  alt?: string;
  caption?: string;
}

interface LightboxState {
  images: LightboxImage[];
  index: number;
}

const SWIPE_THRESHOLD_PX = 50;

function LightboxModal({
  state,
  onClose,
  onNavigate,
}: {
  state: LightboxState | null;
  onClose: () => void;
  onNavigate: (index: number) => void;
}) {
  const t = useTranslations("lightbox");
  const closeRef = useRef<HTMLButtonElement>(null);
  const touchStartX = useRef<number | null>(null);

  const total = state?.images.length ?? 0;
  const hasMany = total > 1;

  const go = useCallback(
    (delta: number) => {
      if (!state || !hasMany) return;
      // Quay vòng: từ ảnh cuối sang ảnh đầu và ngược lại.
      onNavigate((state.index + delta + total) % total);
    },
    [state, hasMany, total, onNavigate]
  );

  useEffect(() => {
    if (!state) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKeyDown);

    // Khoá cuộn nền để không bị "cuộn xuyên" qua lớp phủ.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [state, onClose, go]);

  if (!state) return null;
  const image = state.images[state.index];
  if (!image) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("openZoom")}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4"
      onClick={onClose}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const startX = touchStartX.current;
        touchStartX.current = null;
        if (startX === null) return;
        const deltaX = (e.changedTouches[0]?.clientX ?? startX) - startX;
        if (Math.abs(deltaX) > SWIPE_THRESHOLD_PX) go(deltaX < 0 ? 1 : -1);
      }}
    >
      <button
        ref={closeRef}
        type="button"
        aria-label={t("close")}
        onClick={onClose}
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
      >
        <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {hasMany && (
        <>
          <button
            type="button"
            aria-label={t("prev")}
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            className="absolute left-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:left-6"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            aria-label={t("next")}
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            className="absolute right-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:right-6"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      {/* object-contain: xem trọn ảnh, khác với thumbnail bị object-cover cắt. */}
      <img
        src={image.src}
        alt={image.alt || t("zoomed")}
        className="max-h-[82vh] max-w-full rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />

      {(image.caption || hasMany) && (
        <div className="mt-3 text-center" onClick={(e) => e.stopPropagation()}>
          {image.caption && <p className="text-sm text-white/90">{image.caption}</p>}
          {hasMany && (
            <p className="mt-1 text-xs text-white/50">
              {state.index + 1} / {total}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Quản lý một lightbox dùng chung cho nhiều bộ ảnh trên cùng trang.
 *
 * `open()` nhận trực tiếp danh sách ảnh, nên mỗi lần mở có thể là một bộ khác
 * nhau (VD: ảnh của từng đánh giá) mà chỉ cần một instance duy nhất.
 *
 *   const { open, lightbox } = useLightbox();
 *   <button onClick={() => open(images, 2)}>…</button>
 *   {lightbox}
 */
export function useLightbox() {
  const [state, setState] = useState<LightboxState | null>(null);

  const open = useCallback((images: LightboxImage[], index = 0) => {
    if (images.length > 0) setState({ images, index });
  }, []);

  const lightbox = (
    <LightboxModal
      state={state}
      onClose={() => setState(null)}
      onNavigate={(index) => setState((s) => (s ? { ...s, index } : s))}
    />
  );

  return { open, lightbox };
}

/**
 * Ảnh đơn lẻ tự mở lightbox khi bấm — dùng được cả trong server component.
 */
export function LightboxImageButton({
  src,
  alt,
  caption,
  className,
}: {
  src: string;
  alt?: string;
  caption?: string;
  className?: string;
}) {
  const t = useTranslations("lightbox");
  const { open, lightbox } = useLightbox();
  return (
    <>
      <button
        type="button"
        onClick={() => open([{ src, alt, caption }])}
        className="block cursor-zoom-in transition hover:opacity-90"
        aria-label={alt ? t("zoomNamed", { name: alt }) : t("zoom")}
      >
        <img src={src} alt={alt || ""} className={className} />
      </button>
      {lightbox}
    </>
  );
}
