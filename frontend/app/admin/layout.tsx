import type { Metadata } from "next";

/**
 * Khu vực quản trị — không bao giờ được lập chỉ mục.
 *
 * Không có gì bí mật về việc trang này tồn tại (bảo vệ thật nằm ở role check
 * của API), nhưng cũng không có lý do gì để nó xuất hiện trên Google: chỉ tổ
 * hút thêm lượt dò mật khẩu vào đúng cửa có quyền cao nhất.
 */
export const metadata: Metadata = {
  title: "Quản trị",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
