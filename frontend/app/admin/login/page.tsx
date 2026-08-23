"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { saveAuth } from "@/lib/auth";
import type { AuthResponse } from "@/lib/types";

/**
 * Cửa đăng nhập riêng cho quản trị.
 *
 * Cố ý KHÔNG có ba thứ mà form đăng nhập thường có:
 *
 * 1. Nút OAuth — quyền quản trị không được phụ thuộc vào việc giữ tài khoản
 *    Google/Facebook/Zalo. Backend cũng từ chối cấp phiên admin qua OAuth, nên
 *    đây không chỉ là ẩn nút đi (xem api/auth.py::_handle_oauth_callback).
 * 2. Ô chọn vai trò — vô nghĩa ở mọi cửa đăng nhập: vai trò là thuộc tính của
 *    tài khoản, không phải thứ chọn lúc vào.
 * 3. Link đăng ký — không có đường tự đăng ký làm admin, và không nên gợi ý
 *    rằng có. Quyền cấp bằng lệnh trên server.
 *
 * Giao diện cũng cố ý khác hẳn — nền tối, và khung điều hướng của site bị ẩn
 * trong toàn khu /admin (xem components/SiteChrome) — để không ai nhầm đây với
 * trang đăng nhập của người dùng.
 */
export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const data = await apiFetch<AuthResponse>("/api/auth/admin/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      saveAuth(data.access_token, data.refresh_token, data.user);
      router.replace("/admin");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Đăng nhập thất bại. Vui lòng thử lại."
      );
      setSubmitting(false);
    }
  }

  return (
    // min-h-screen chứ không phải 80vh: khu /admin đã ẩn Navbar/Footer nên
    // <main> giãn hết màn hình, và nền tối chỉ cao 80vh sẽ để hở 20% cuối
    // trang thành dải sáng (body có bg-slate-50).
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-12">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl sm:p-8">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-slate-900 px-2 py-1 text-xs font-bold text-white">
            ADMIN
          </span>
          <h1 className="text-xl font-bold text-slate-900">Đăng nhập quản trị</h1>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Chỉ dành cho tài khoản quản trị. Người dùng thường đăng nhập tại{" "}
          <Link href="/login" className="font-semibold text-emerald-600 hover:underline">
            /login
          </Link>
          .
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="label" htmlFor="admin-email">Email</label>
            <input
              id="admin-email"
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="label" htmlFor="admin-password">Mật khẩu</label>
            <input
              id="admin-password"
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
          <button
            type="submit"
            className="w-full rounded-lg bg-slate-900 py-2.5 font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
            disabled={submitting}
          >
            {submitting ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>
      </div>
    </div>
  );
}
