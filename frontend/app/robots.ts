import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // /track: mã bí mật nằm trong URL, một link lọt vào chỉ mục là ai cũng
      // xem được yêu cầu của người khác. Trang cũng đã tự đặt noindex.
      // /reset-password: token đặt lại mật khẩu nằm trong URL, cùng lý do
      // với /track. /welcome chỉ có nghĩa ngay sau khi đăng ký xong.
      disallow: [
        "/dashboard",
        "/account",
        "/login",
        "/register",
        "/auth",
        "/track",
        "/admin",
        "/welcome",
        "/forgot-password",
        "/reset-password",
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
