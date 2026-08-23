"use client";

import Link from "next/link";
import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useTranslations } from "next-intl";

/**
 * Yêu cầu link đặt lại mật khẩu.
 *
 * Trước đây không có luồng này: PT quên mật khẩu là mất tài khoản vĩnh viễn,
 * kèm theo cả hồ sơ và toàn bộ lead đã nhận. Với đăng ký tự phục vụ thì đó là
 * chuyện chắc chắn xảy ra chứ không phải rủi ro.
 */
export default function ForgotPasswordPage() {
  const t = useTranslations("forgotPassword");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("errSubmit"));
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="card p-6 text-center sm:p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
          <svg className="h-6 w-6 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
        </div>
        <h1 className="mt-3 text-xl font-bold text-slate-900">{t("sentHeading")}</h1>
        {/*
          Cố ý không nói "email này có tồn tại hay không" — phân biệt hai trường
          hợp là biếu không công cụ dò xem địa chỉ nào đã đăng ký. Backend cũng
          luôn trả 202 vì cùng lý do.
        */}
        <p className="mt-2 text-sm text-slate-500">
          {t.rich("sentBody", {
            email: () => <span className="font-medium text-slate-700">{email}</span>,
          })}
        </p>
        <p className="mt-3 text-xs text-slate-400">
          {t("sentNote")}
        </p>
        <Link href="/login" className="btn-secondary mt-5 inline-block">
          {t("backToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <div className="card p-6 sm:p-8">
      <h1 className="text-2xl font-bold text-slate-900">{t("heading")}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {t("subtitle")}
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="label" htmlFor="forgot-email">{t("email")}</label>
          <input
            id="forgot-email"
            type="email"
            className="input"
            placeholder="ban@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? t("submitting") : t("submit")}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-slate-500">
        {t("oauthNote")}{" "}
        <Link href="/login" className="font-semibold text-emerald-600 hover:underline">
          {t("backLink")}
        </Link>
      </p>
    </div>
  );
}
