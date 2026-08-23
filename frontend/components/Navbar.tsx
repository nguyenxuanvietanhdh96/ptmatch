"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { logout } from "@/lib/api";
import type { PTStats, User } from "@/lib/types";

// Nhịp làm mới huy hiệu "lead mới". Đủ thưa để không tốn tài nguyên khi PT mở
// tab cả ngày, đủ dày để không phải F5 mới thấy học viên vừa liên hệ.
const LEAD_BADGE_REFRESH_MS = 60_000;

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [newLeads, setNewLeads] = useState(0);
  const t = useTranslations("nav");
  const pathname = usePathname();
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUser(getUser());
    setMobileOpen(false);
    setUserMenuOpen(false);
  }, [pathname]);

  // Số lead mới lấy riêng, KHÔNG theo pathname.
  //
  // Trước đây nó nằm chung effect ở trên nên mỗi lần chuyển trang trong app đều
  // tốn một lượt gọi /api/pts/me/stats chỉ để vẽ lại con số trên huy hiệu. Chỉ
  // cần lấy khi phiên đăng nhập đổi, cộng một nhịp làm mới định kỳ để PT đang
  // mở sẵn dashboard vẫn thấy lead mới về.
  useEffect(() => {
    if (user?.role !== "pt") {
      setNewLeads(0);
      return;
    }
    let alive = true;
    const fetchStats = () => {
      // redirectOnAuthFailure: false — đây là poll nền cho một huy hiệu số;
      // một phiên hết hạn không được ép PT đang đọc trang khác/điền form
      // bật ngược về /login chỉ vì badge chạy ngầm này fail.
      apiFetch<PTStats>("/api/pts/me/stats", { auth: true, redirectOnAuthFailure: false })
        .then((s) => {
          if (alive) setNewLeads(s.leads_new);
        })
        .catch(() => {});
    };
    fetchStats();
    const timer = setInterval(fetchStats, LEAD_BADGE_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [user?.id, user?.role]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleLogout() {
    await logout();
    setUser(null);
    setUserMenuOpen(false);
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-slate-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-sm font-black text-white">PT</span>
          PT<span className="text-emerald-600">Match</span>
        </Link>

        <nav className="hidden items-center gap-2 sm:flex">
          {user?.role !== "pt" && (
            <Link href="/pts" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">
              {t("findPT")}
            </Link>
          )}
          {/* Đường vào chợ ngược cho phía cầu. Trước đây chỉ tới được từ block
              trên trang chủ, nên người vào thẳng /pts không biết là có. */}
          {user?.role !== "pt" && (
            <Link href="/requests/new" className="rounded-lg px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50">
              {t("postRequest")}
            </Link>
          )}
          <Link href="/requests" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">
            {t("requestBoard")}
          </Link>
          {user ? (
            <>
              {user.role === "pt" && (
                <Link href="/dashboard" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">
                  {t("dashboard")}
                </Link>
              )}
              {user.role === "pt" && (
                <Link href="/dashboard/leads" className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                  </svg>
                  {newLeads > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                      {newLeads > 99 ? "99+" : newLeads}
                    </span>
                  )}
                </Link>
              )}
              {/* User dropdown */}
              <div className="relative ml-1" ref={menuRef}>
                <button
                  onClick={() => setUserMenuOpen((v) => !v)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                    {(user.full_name || user.email).charAt(0).toUpperCase()}
                  </span>
                  <span className="hidden md:block">{user.full_name || user.email}</span>
                  <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                {userMenuOpen && (
                  <div className="absolute right-0 mt-1 w-48 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                    <div className="border-b border-slate-100 px-4 py-2">
                      <p className="truncate text-sm font-semibold text-slate-900">{user.full_name}</p>
                      <p className="truncate text-xs text-slate-400">{user.email}</p>
                    </div>
                    {user.role === "pt" && (
                      <Link
                        href="/dashboard/profile"
                        className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {t("profile")}
                      </Link>
                    )}
                    {user.role === "trainee" && (
                      <>
                        <Link href="/account/favorites" className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50" onClick={() => setUserMenuOpen(false)}>
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                          </svg>
                          {t("savedPTs")}
                        </Link>
                        <Link href="/account/leads" className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50" onClick={() => setUserMenuOpen(false)}>
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                          </svg>
                          {t("myRequests")}
                        </Link>
                        <Link href="/account/reviews" className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50" onClick={() => setUserMenuOpen(false)}>
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                          </svg>
                          {t("myReviews")}
                        </Link>
                      </>
                    )}
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-rose-600 hover:bg-rose-50"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-7.5A2.25 2.25 0 003.75 5.25v13.5A2.25 2.25 0 006 21h7.5a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                      </svg>
                      {t("logout")}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">
                {t("login")}
              </Link>
              <Link href="/register" className="btn-primary">
                {t("register")}
              </Link>
            </>
          )}
        </nav>

        <button
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 sm:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={t("openMenu")}
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            {mobileOpen ? <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /> : <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />}
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <nav className="border-t border-slate-200 bg-white px-4 py-3 sm:hidden">
          <div className="flex flex-col gap-1">
            {user?.role !== "pt" && (
              <Link href="/pts" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                {t("findPT")}
              </Link>
            )}
            {user?.role !== "pt" && (
              <Link href="/requests/new" className="rounded-lg px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50">
                {t("postRequest")}
              </Link>
            )}
            <Link href="/requests" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
              {t("requestBoard")}
            </Link>
            {user ? (
              <>
                {user.role === "pt" && (
                  <Link href="/dashboard" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                    {t("dashboard")}
                  </Link>
                )}
                {user.role === "pt" && (
                  <Link href="/dashboard/leads" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                    {t("leads")}
                    {newLeads > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">
                        {newLeads > 99 ? "99+" : newLeads}
                      </span>
                    )}
                  </Link>
                )}
                {user.role === "pt" && (
                  <Link href="/dashboard/profile" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                    {t("profile")}
                  </Link>
                )}
                {user.role === "trainee" && (
                  <>
                    <Link href="/account/favorites" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                      {t("savedPTs")}
                    </Link>
                    <Link href="/account/leads" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                      {t("myRequests")}
                    </Link>
                    <Link href="/account/reviews" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                      {t("myReviews")}
                    </Link>
                  </>
                )}
                <button
                  onClick={handleLogout}
                  className="rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-600 hover:bg-rose-50"
                >
                  {t("logout")}
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                  {t("login")}
                </Link>
                <Link href="/register" className="rounded-lg px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50">
                  {t("register")}
                </Link>
              </>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
