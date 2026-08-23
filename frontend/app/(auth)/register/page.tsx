"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { saveAuth } from "@/lib/auth";
import OAuthButtons from "@/components/OAuthButtons";
import type { AuthResponse, Role } from "@/lib/types";
import { useTranslations } from "next-intl";

export default function RegisterPage() {
  const t = useTranslations("register");
  const router = useRouter();
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    password: "",
    // KHÔNG mặc định vai trò nào.
    //
    // Nút ở navbar giờ chỉ ghi "Đăng ký" (cả học viên lẫn PT đều dùng), nên
    // chọn sẵn "Personal Trainer" ở đây là bẫy: người vào tạo tài khoản học
    // viên mà không để ý sẽ thành PT — và chiều pt → trainee KHÔNG có đường
    // tự sửa (become-pt chỉ chạy một chiều).
    //
    // Những lối vào đã nói rõ vai trò (/for-trainers, thẻ yêu cầu) truyền
    // `?role=pt` nên vẫn được chọn sẵn, không thêm thao tác nào.
    role: "" as Role | "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // `?role=trainee` từ những chỗ mời học viên đăng ký. Trước đây trang không
  // đọc tham số này: mọi link `/register?role=...` đều rơi về mặc định "pt" và
  // chạy đúng chỉ vì tình cờ trùng — đổi mặc định là hỏng lặng lẽ.
  //
  // Đọc thẳng từ window thay vì useSearchParams để không phải bọc Suspense chỉ
  // vì một giá trị khởi tạo.
  useEffect(() => {
    const role = new URLSearchParams(window.location.search).get("role");
    if (role === "trainee" || role === "pt") set("role", role);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.role) {
      setError(t("errRole"));
      return;
    }
    if (form.password.length < 8) {
      setError(t("errPassword"));
      return;
    }
    setSubmitting(true);
    try {
      const data = await apiFetch<AuthResponse>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(form),
      });
      saveAuth(data.access_token, data.refresh_token, data.user);
      // PT vào thẳng trang chỉnh sửa hồ sơ, không phải trang tổng quan.
      // Hồ sơ vừa tạo chưa đủ điều kiện hiển thị (thiếu ảnh/giá/khu vực), nên
      // /dashboard lúc này chỉ là một bảng toàn số 0 — nó không nói cho người
      // vừa đăng ký biết việc cần làm tiếp theo là gì.
      router.push(data.user?.role === "pt" ? "/dashboard/profile" : "/account/favorites");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("errSubmit"));
      setSubmitting(false);
    }
  }

  const roleBlurb =
    form.role === "trainee"
      ? t("blurbTrainee")
      : form.role === "pt"
        // Không hứa "nhận học viên ngay hôm nay": cùng lý do đã gỡ lời hứa
        // 24 giờ khỏi trang chủ — lượng học viên nằm ngoài tầm kiểm soát.
        ? t("blurbPT")
        : t("blurbNone");
  const ROLE_OPTIONS = [
    {
      value: "trainee" as Role,
      label: t("roleTrainee"),
      desc: t("roleTraineeDesc"),
      icon: (
        <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
      ),
    },
    {
      value: "pt" as Role,
      label: t("rolePT"),
      desc: t("rolePTDesc"),
      icon: (
        <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 5.25v13.5M17.25 5.25v13.5M3.75 9h3M17.25 9h3M3.75 15h3M17.25 15h3M6.75 12h10.5" />
        </svg>
      ),
    },
  ];

  return (
    <div className="card p-6 sm:p-8">
      <h1 className="text-2xl font-bold text-slate-900">{t("heading")}</h1>
      <p className="mt-1 text-sm text-slate-500">{roleBlurb}</p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <span className="label">{t("roleQuestion")}</span>
          <div className="grid grid-cols-2 gap-3">
            {ROLE_OPTIONS.map((opt) => {
              const active = form.role === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => set("role", opt.value)}
                  aria-pressed={active}
                  className={`relative flex flex-col items-start gap-1.5 rounded-xl border-2 p-4 text-left transition-all ${
                    active
                      ? "border-emerald-500 bg-emerald-50 shadow-sm ring-2 ring-emerald-500/20"
                      : "border-slate-200 hover:border-emerald-300 hover:bg-slate-50"
                  }`}
                >
                  <span
                    className={`absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full transition-colors ${
                      active ? "bg-emerald-500 text-white" : "border-2 border-slate-300 text-transparent"
                    }`}
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </span>
                  <span className={active ? "text-emerald-600" : "text-slate-400"}>{opt.icon}</span>
                  <span className="text-sm font-bold text-slate-900">{opt.label}</span>
                  <span className="text-xs leading-snug text-slate-500">{opt.desc}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="reg-name">{t("name")}</label>
          <input
            id="reg-name"
            className="input"
            placeholder={t("namePlaceholder")}
            value={form.full_name}
            onChange={(e) => set("full_name", e.target.value)}
            required
            autoComplete="name"
          />
        </div>
        <div>
          <label className="label" htmlFor="reg-email">{t("email")}</label>
          <input
            id="reg-email"
            type="email"
            className="input"
            placeholder="ban@email.com"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div>
          <label className="label" htmlFor="reg-phone">{t("phone")}</label>
          <input
            id="reg-phone"
            type="tel"
            className="input"
            placeholder="09xx xxx xxx"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            required
            autoComplete="tel"
          />
        </div>
        <div>
          <label className="label" htmlFor="reg-password">{t("password")}</label>
          <input
            id="reg-password"
            type="password"
            className="input"
            placeholder={t("passwordPlaceholder")}
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
            required
            autoComplete="new-password"
          />
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting
            ? t("submitting")
            : form.role === "trainee"
              ? t("submitTrainee")
              : form.role === "pt"
                ? t("submitPT")
                : t("submitNeutral")}
        </button>
      </form>
      <div className="mt-2">
        {/* Chưa chọn vai trò thì tạm coi là học viên — đó là chiều SỬA ĐƯỢC
            (become-pt chạy trainee → pt). Và mọi tài khoản tạo mới qua SNS đều
            được hỏi lại vai trò ở /welcome, nên giá trị ở đây chỉ quyết định
            lựa chọn nào được chọn sẵn tại đó. */}
        <OAuthButtons role={form.role || "trainee"} />
      </div>

      <p className="mt-5 text-center text-sm text-slate-500">
        {t("hasAccount")}{" "}
        <Link href="/login" className="font-semibold text-emerald-600 hover:underline">
          {t("loginNow")}
        </Link>
      </p>
    </div>
  );
}
