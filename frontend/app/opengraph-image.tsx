import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";

/**
 * Ảnh chia sẻ mặc định cho toàn site.
 *
 * Theo quy ước app/opengraph-image.* của App Router, file này phủ cho mọi route
 * không tự khai `openGraph.images` — trang chủ, /pts, /requests/new, các trang
 * tĩnh. Trước đây không có ảnh nào nên mọi link dán lên Facebook/Zalo đều hiện
 * thẻ trắng, đúng lúc kênh phân phối chính là chia sẻ trong group.
 *
 * Sinh bằng ImageResponse thay vì file PNG có sẵn: không phải nhét ảnh nhị phân
 * vào repo, và sửa chữ chỉ là sửa code. Chỉ dùng màu nền + chữ hệ thống nên
 * không cần nạp font — nhúng font tiếng Việt vào đây sẽ thành vài trăm KB tải
 * thêm cho mỗi lần sinh ảnh.
 */
// `alt` là hằng cấp module nên không gọi được t(); giữ bản tiếng Việt ở đây
// và đồng bộ thủ công với messages ogImage.alt khi thêm ngôn ngữ.
export const alt = "PTMatch — Tìm Personal Trainer phù hợp với bạn";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const t = await getTranslations("ogImage");
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0f172a 0%, #064e3b 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
          padding: "0 80px",
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 84,
              height: 84,
              borderRadius: 20,
              background: "#059669",
              fontSize: 44,
              fontWeight: 800,
            }}
          >
            PT
          </div>
          {/* display:flex là bắt buộc với mọi thẻ có nhiều hơn một con —
              Satori (bộ dựng của ImageResponse) không có block layout và sẽ làm
              hỏng cả bản build chứ không chỉ ảnh này. */}
          <div style={{ display: "flex", fontSize: 60, fontWeight: 800, letterSpacing: -1 }}>
            PT<span style={{ color: "#34d399" }}>Match</span>
          </div>
        </div>

        <div
          style={{
            marginTop: 40,
            fontSize: 52,
            fontWeight: 700,
            lineHeight: 1.25,
            maxWidth: 940,
          }}
        >
          {t("title")}
        </div>

        <div style={{ marginTop: 28, fontSize: 30, color: "#cbd5e1" }}>
          {t("subtitle")}
        </div>
      </div>
    ),
    size
  );
}
