"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { saveAuth } from "@/lib/auth";
import type { AuthResponse } from "@/lib/types";
import { useTranslations } from "next-intl";

const MIN_PASSWORD = 8;

function ResetPasswordForm() {
  const t = useTranslations("resetPassword");
  const router = useRouter();
  // null = chưa kiểm tra URL xong (SSR + lần render đầu); "" = đã kiểm, không
  // có token. Không gộp hai trạng thái này thì mọi lượt bấm link hợp lệ đều
  // nháy "liên kết không hợp lệ" một khung hình trước khi lật sang form.
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Đọc token từ window thay vì useSearchParams để không phải bọc thêm một lớp
  // Suspense chỉ cho một giá trị khởi tạo.
  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") ?? "");
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < MIN_PASSWORD) {
      setError(t("errShort", { min: MIN_PASSWORD }));
      return;
    }
    if (password !== confirm) {
      setError(t("errMismatch"));
      return;
    }
    setSubmitting(true);
    try {
      const data = await apiFetch<AuthResponse>("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      // Backend đăng nhập luôn sau khi đổi — bắt gõ lại mật khẩu vừa đặt ở màn
      // hình kế tiếp chỉ thêm một chỗ rơi mà không an toàn hơn.
      saveAuth(data.access_token, data.refresh_token, data.user);
      router.replace(data.user?.role === "pt" ? "/dashboard" : "/account/favorites");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("errSubmit"));
      setSubmitting(false);
    }
  }

  if (token === null) {
    // Chưa kiểm tra xong URL — không render gì thay vì đoán sai thành "hợp lệ"
    // hoặc "không hợp lệ".
    return null;
  }

  if (!token) {
    return (
      <div className="card p-6 text-center sm:p-8">
        <h1 className="text-xl font-bold text-slate-900">{t("invalidHeading")}</h1>
        <p className="mt-2 text-sm text-slate-500">
          {t("invalidBody")}
        </p>
        <Link href="/forgot-password" className="btn-primary mt-5 inline-block">
          {t("resend")}
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
          <label className="label" htmlFor="reset-password">{t("newPassword")}</label>
          <input
            id="reset-password"
            type="password"
            className="input"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
          <p className="mt-1 text-xs text-slate-400">{t("minNote", { min: MIN_PASSWORD })}</p>
        </div>
        <div>
          <label className="label" htmlFor="reset-confirm">{t("confirmPassword")}</label>
          <input
            id="reset-confirm"
            type="password"
            className="input"
            placeholder="••••••••"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            autoComplete="new-password"
          />
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? t("saving") : t("submit")}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
