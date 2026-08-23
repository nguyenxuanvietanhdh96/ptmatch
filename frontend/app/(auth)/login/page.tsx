"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useEffect } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { safeNextPath, saveAuth } from "@/lib/auth";
import OAuthButtons from "@/components/OAuthButtons";
import type { AuthResponse } from "@/lib/types";
import { useTranslations } from "next-intl";

function LoginForm() {
  const t = useTranslations("login");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // searchParams.get() đã tự decode — decode thêm lần nữa ném URIError nếu
    // chuỗi có ký tự "%" đứng riêng (ví dụ oauth_error chứa "50%").
    const oauthError = searchParams.get("oauth_error");
    if (oauthError) setError(oauthError);
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const data = await apiFetch<AuthResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      saveAuth(data.access_token, data.refresh_token, data.user);
      const next = safeNextPath(searchParams.get("next"), "");
      if (next) {
        router.push(next);
      } else if (data.user?.role === "pt") {
        router.push("/dashboard");
      } else if (data.user?.role === "trainee") {
        router.push("/account/favorites");
      } else {
        router.push("/");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("errSubmit"));
      setSubmitting(false);
    }
  }

  return (
    <div className="card p-6 sm:p-8">
      <h1 className="text-2xl font-bold text-slate-900">{t("heading")}</h1>
      <p className="mt-1 text-sm text-slate-500">{t("subtitle")}</p>

      {/*
        KHÔNG có bộ chọn vai trò ở đây nữa.

        Với đăng nhập bằng mật khẩu nó vốn không làm gì — vai trò lấy từ tài
        khoản. Nhưng với nút SNS thì nó quyết định vĩnh viễn loại tài khoản
        được TẠO, mà mặc định lại là "học viên": một PT tới từ group Facebook
        bấm "Đăng nhập với Facebook" ở đây sẽ thành học viên không có hồ sơ, và
        không có đường tự sửa. Người đang đăng nhập cũng không có lý do gì phải
        khai lại mình là ai.

        Tài khoản tạo mới qua SNS giờ được hỏi vai trò ở /welcome, nơi câu hỏi
        đó thực sự có nghĩa.
      */}
      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div>
          <label className="label" htmlFor="login-email">{t("email")}</label>
          <input
            id="login-email"
            type="email"
            className="input"
            placeholder="ban@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <label className="label mb-0" htmlFor="login-password">{t("password")}</label>
            <Link
              href="/forgot-password"
              className="text-xs font-semibold text-emerald-600 hover:underline"
            >
              {t("forgot")}
            </Link>
          </div>
          <input
            id="login-password"
            type="password"
            className="input"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? t("submitting") : t("submit")}
        </button>
      </form>

      <div className="mt-5">
        {/* Vai trò mặc định chỉ là chỗ giữ chỗ: tài khoản đã tồn tại thì backend
            dùng vai trò thật của nó, còn tài khoản mới sẽ được hỏi ở /welcome. */}
        <OAuthButtons role="trainee" next={searchParams.get("next") ?? undefined} />
      </div>

      <p className="mt-5 text-center text-sm text-slate-500">
        {t("noAccount")}{" "}
        <Link href="/register" className="font-semibold text-emerald-600 hover:underline">
          {t("registerNow")}
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
