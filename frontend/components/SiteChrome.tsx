"use client";

import { usePathname } from "next/navigation";

/**
 * Ẩn khung giao diện của site (Navbar/Footer) trong khu vực quản trị.
 *
 * Root layout bọc mọi trang, kể cả /admin — mà thanh điều hướng ở đó là dành
 * cho khách: "Tìm PT", "Đăng ký hồ sơ PT". Hiện chúng trên trang đăng nhập quản
 * trị vừa lạc lõng vừa xoá mất ranh giới mà việc tách cửa đăng nhập tạo ra:
 * người dùng phải thấy ngay đây là chỗ khác hẳn, không phải một tab nữa của site.
 *
 * Client component vì cần usePathname; Footer vốn là server component nên được
 * bọc từ ngoài thay vì tự kiểm tra.
 */
export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;
  return <>{children}</>;
}
