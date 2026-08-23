import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

/**
 * Trang tra cứu mở bằng mã bí mật nằm ngay trong URL, và nội dung là yêu cầu
 * của một người cụ thể. Tuyệt đối không được lập chỉ mục: một URL lọt vào
 * Google là bất kỳ ai cũng xem được yêu cầu đó.
 *
 * `noarchive`/`nosnippet` để công cụ tìm kiếm không giữ bản sao hay trích nội
 * dung ngay cả khi lỡ bò tới link.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("track");
  return {
    title: t("metaTitle"),
    robots: {
      index: false,
      follow: false,
      noarchive: true,
      nosnippet: true,
      nocache: true,
    },
  };
}

export default function TrackLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
