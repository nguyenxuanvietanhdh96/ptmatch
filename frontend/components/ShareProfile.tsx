"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { EVENTS, track } from "@/lib/analytics";

interface ShareProfileProps {
  slug: string;
  ptName: string;
}

/**
 * Biến mỗi PT thành một kênh phân phối.
 *
 * Ở giai đoạn chưa có lưu lượng, người có động cơ mạnh nhất để quảng bá một hồ
 * sơ PT chính là PT đó. Họ đã sẵn sàng đăng bài giới thiệu mình lên Facebook —
 * việc của mình là làm cho việc đăng kèm link mất đúng một chạm, và soạn sẵn
 * đoạn text để họ không phải nghĩ.
 *
 * Hiệu ứng kép: học viên cũ của chính PT đó theo link vào, và họ là nguồn đánh
 * giá thật duy nhất có thể có lúc này — thứ làm hồ sơ đáng tin với người lạ.
 *
 * Origin lấy từ `window` chứ không phải biến build: link phải đúng với domain
 * người dùng đang mở (staging, IP LAN, tunnel), nếu không PT sẽ copy nhầm một
 * link trỏ về nơi khác.
 */
export default function ShareProfile({ slug, ptName }: ShareProfileProps) {
  const t = useTranslations("shareProfile");
  const [copied, setCopied] = useState<"link" | "text" | null>(null);
  const path = `/pt/${slug}`;
  const url = typeof window === "undefined" ? path : `${window.location.origin}${path}`;

  async function copy(kind: "link" | "text") {
    const value = kind === "link" ? url : t("postText", { ptName, url });
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
      track(EVENTS.shareProfile, { method: kind === "link" ? "copy_link" : "copy_text" });
    } catch {
      // Clipboard bị chặn (thiếu HTTPS, hoặc trình duyệt từ chối quyền) —
      // chọn sẵn nội dung trong ô để người dùng tự Ctrl+C là đủ, không đáng
      // bắn một thông báo lỗi.
      const input = document.getElementById("share-url") as HTMLInputElement | null;
      input?.select();
    }
  }

  function shareNative() {
    track(EVENTS.shareProfile, { method: "native" });
    navigator
      .share?.({ title: ptName, text: t("postText", { ptName, url }), url })
      // Người dùng bấm huỷ bảng chia sẻ cũng ném lỗi — không phải chuyện đáng báo.
      .catch(() => {});
  }

  function shareFacebook() {
    track(EVENTS.shareProfile, { method: "facebook" });
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
      "_blank",
      "noopener,noreferrer,width=600,height=500"
    );
  }

  const canShareNative = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div className="card border-emerald-200 bg-emerald-50 p-4">
      <div className="flex items-start gap-3">
        <svg className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-900">
            {t("title")}
          </p>
          <p className="mt-1 text-sm text-emerald-800">
            {t("body")}
          </p>

          <div className="mt-3 flex gap-2">
            <input
              id="share-url"
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="input min-w-0 flex-1 bg-white font-mono text-xs"
              aria-label={t("urlLabel")}
            />
            <button type="button" onClick={() => copy("link")} className="btn-secondary shrink-0">
              {copied === "link" ? t("copied") : t("copyLink")}
            </button>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            {canShareNative && (
              <button type="button" onClick={shareNative} className="btn-primary px-3 py-1.5 text-xs">
                {t("share")}
              </button>
            )}
            <button type="button" onClick={shareFacebook} className="btn-secondary px-3 py-1.5 text-xs">
              {t("facebook")}
            </button>
            <button type="button" onClick={() => copy("text")} className="btn-secondary px-3 py-1.5 text-xs">
              {copied === "text" ? t("copiedText") : t("copyText")}
            </button>
            <a
              href={`/pt/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-2 text-xs font-semibold text-emerald-700 hover:underline"
            >
              {t("viewMine")}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
