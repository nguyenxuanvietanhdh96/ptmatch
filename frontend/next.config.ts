import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { OPTIMISABLE_IMAGE_HOSTS } from "./lib/image-hosts";

// Trỏ next-intl tới file cấu hình request (xem i18n/config.ts để biết cách
// thêm ngôn ngữ thứ hai).
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  eslint: { ignoreDuringBuilds: true },
  /**
   * Cho trình duyệt gọi /api ngay trên origin của trang, Next chuyển tiếp
   * xuống backend.
   *
   * Trước đây dev bắt trình duyệt gọi thẳng cổng backend (localhost:8000),
   * còn production thì gọi cùng origin và để nginx định tuyến. Hai đường khác
   * nhau nghĩa là dev gánh thêm CORS mà production không có, và hễ đổi cách
   * vào site — IP LAN, máy khác, WSL forward chập chờn — là "localhost:8000"
   * trỏ sang máy của người xem chứ không phải backend. Rewrite này xoá luôn
   * lớp lệch đó: cùng origin ở cả hai môi trường, không còn CORS cho trình
   * duyệt.
   *
   * Production đặt NEXT_PUBLIC_API_URL thành domain thật thì nginx vẫn chặn
   * /api trước khi tới Next, nên rewrite chỉ nằm đó làm lưới đỡ.
   */
  async rewrites() {
    const backend = process.env.API_INTERNAL_URL || "http://backend:8000";
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
  /**
   * Host được phép đi qua /_next/image — khai báo tại lib/image-hosts.ts để
   * component ảnh và cấu hình này không bao giờ lệch nhau.
   */
  images: {
    remotePatterns: OPTIMISABLE_IMAGE_HOSTS.map((h) => ({ ...h })),
  },
};

export default withNextIntl(nextConfig);
