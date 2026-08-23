"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { getUser } from "@/lib/auth";
import type { User } from "@/lib/types";

/**
 * Dải CTA cuối trang chủ, đổi theo trạng thái đăng nhập.
 *
 * Mặc định dựng nhánh khách (mời PT tạo hồ sơ) ngay từ server thay vì chờ biết
 * người xem là ai: đây là CTA cuối cùng của trang đích chính, mà trước đây nó
 * trả `null` cho tới khi hydrate xong — nghĩa là vắng mặt trong HTML nguồn và
 * chèn vào sau, đẩy layout nhảy một nhịp. `user` khởi tạo `null` nên lần dựng
 * đầu ở client trùng khít với server, không lệch hydration; chỉ PT đã đăng nhập
 * mới thấy khối đổi sang nhánh dashboard sau đó.
 */
export default function HomeCTA() {
  const t = useTranslations("homeCTA");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    setUser(getUser());
  }, []);

  if (user?.role === "pt") {
    return (
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-12 text-center sm:px-12">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20">
            <svg className="h-7 w-7 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>
          <h2 className="text-2xl font-extrabold text-white sm:text-3xl">
            {t("ptHeading")}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-300">
            {t("ptBody")}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/dashboard" className="btn bg-emerald-600 px-6 text-white hover:bg-emerald-500">
              {t("ptDashboard")}
            </Link>
            <Link href="/dashboard/profile" className="btn border border-slate-600 px-6 text-slate-200 hover:bg-slate-700">
              {t("ptEditProfile")}
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
      <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-700 px-6 py-12 text-center sm:px-12">
        <h2 className="text-2xl font-extrabold text-white sm:text-3xl">{t("guestHeading")}</h2>
        <p className="mx-auto mt-3 max-w-2xl text-emerald-50">
          {t("guestBody")}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link href="/register" className="btn bg-white px-6 text-emerald-700 hover:bg-emerald-50">
            {t("guestCreate")}
          </Link>
          {!user && (
            <Link href="/login" className="btn border border-emerald-300/60 px-6 text-white hover:bg-emerald-500/30">
              {t("guestLogin")}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
