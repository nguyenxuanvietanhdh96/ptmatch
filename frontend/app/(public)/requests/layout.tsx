import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

/**
 * Yêu cầu chứa tên, khu vực và ngân sách của người thật, lại chỉ sống 14 ngày.
 * Không có lý do gì để Google lập chỉ mục — trang này phục vụ PT đã đăng nhập,
 * không phải khách tìm kiếm.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("requestBoard");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    robots: { index: false, follow: false },
  };
}

export default function RequestsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
