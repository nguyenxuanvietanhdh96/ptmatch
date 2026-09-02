"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "@/lib/api";
import { getUser, isLoggedIn } from "@/lib/auth";

/**
 * Vỏ chung cho mọi trang quản trị: kiểm tra quyền, thanh điều hướng, đăng xuất.
 *
 * Gộp vào một chỗ vì cả ba việc đó đều dễ làm sai theo cùng một kiểu nếu lặp
 * lại ở từng trang: quên chặn quyền ở một trang là hở cả bề mặt, quên nút đăng
 * xuất là vào rồi không ra được.
 *
 * QUAN TRỌNG: children chỉ được render khi đã xác nhận là admin. Nhờ vậy trang
 * con gọi API ngay lúc mount mà không phải tự kiểm tra lại — không có cửa sổ
 * nào mà trang con chạy trước khi biết người xem là ai.
 *
 * Chặn thật vẫn nằm ở backend (get_current_admin trên từng endpoint). Đây chỉ
 * là để giao diện không nhá nội dung rồi mới báo lỗi.
 */

const NAV = [
  { href: "/admin", label: "Tổng quan" },
  { href: "/admin/leads", label: "Đường ống lead" },
  { href: "/admin/reviews", label: "Đánh giá" },
  { href: "/admin/feedback", label: "Góp ý" },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // null = chưa chạy kiểm tra (kiểm tra dựa vào localStorage nên chỉ có ở client)
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isLoggedIn()) {
      // Cửa riêng, không phải /login: backend từ chối tài khoản admin ở cửa
      // thường, nên đẩy sang đó chỉ khiến người dùng đâm vào tường 403.
      router.replace("/admin/login");
      return;
    }
    setAllowed(getUser()?.role === "admin");
  }, [router]);

  async function handleLogout() {
    await logout();
    router.replace("/admin/login");
  }

  if (allowed === null) {
    return (
      <p className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-slate-400">
        Đang kiểm tra quyền...
      </p>
    );
  }

  if (allowed === false) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-slate-900">Trang này chỉ dành cho admin</h1>
        <p className="mt-2 text-sm text-slate-500">
          Tài khoản <strong>{getUser()?.email}</strong> không có quyền xem số liệu vận
          hành.
        </p>
        {/*
          Lệnh cấp quyền chỉ hiện ở dev. Trên production nó là thông báo viết cho
          lập trình viên nhưng hiện cho BẤT KỲ ai đăng nhập rồi mở /admin — tiết
          lộ đường dẫn module backend và cơ chế phân quyền, thứ đầu tiên kẻ tấn
          công cần biết nếu chạm được vào một lỗ thực thi mã. Người dùng thật
          cũng chẳng làm gì được với một lệnh python.
        */}
        {process.env.NODE_ENV !== "production" && (
          <code className="mt-3 block rounded-lg bg-slate-50 p-3 text-left text-xs text-slate-600">
            python -m app.jobs.grant_admin {getUser()?.email ?? "email@cua-ban"}
          </code>
        )}
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/" className="btn-secondary">Về trang chủ</Link>
          <Link href="/admin/login" className="btn-primary">Đăng nhập tài khoản khác</Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {/*
        Thanh riêng cho khu quản trị. Cần thiết vì Navbar của site đã bị ẩn ở
        /admin (xem components/SiteChrome) — mà menu người dùng, tức đường đăng
        xuất duy nhất, nằm trong Navbar đó.
      */}
      <header className="bg-slate-900">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 pt-3 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-white px-2 py-0.5 text-xs font-bold text-slate-900">
              ADMIN
            </span>
            <span className="text-sm text-slate-300">{getUser()?.email}</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm text-slate-300 hover:text-white">
              Xem site
            </Link>
            <button
              onClick={handleLogout}
              className="text-sm font-semibold text-slate-300 hover:text-white"
            >
              Đăng xuất
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 px-4 sm:px-6">
          {NAV.map((item) => {
            const active =
              item.href === "/admin" ? pathname === "/admin" : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
                  active
                    ? "border-emerald-400 text-white"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">{children}</div>
    </>
  );
}
