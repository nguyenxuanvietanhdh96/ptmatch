"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { EVENTS, track, trackLead } from "@/lib/analytics";
import { getUser, isLoggedIn } from "@/lib/auth";
import { SPECIALTIES } from "@/lib/constants";
import type { LeadCreated } from "@/lib/types";

interface LeadFormProps {
  ptSlug: string;
  ptName: string;
}

export default function LeadForm({ ptSlug, ptName }: LeadFormProps) {
  const t = useTranslations("leadForm");
  const [form, setForm] = useState({
    trainee_name: "",
    trainee_phone: "",
    goal: "",
    area: "",
    budget: "",
  });
  const [loggedIn, setLoggedIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [trackToken, setTrackToken] = useState("");
  const [error, setError] = useState("");

  // Prefill name/phone for logged-in users so they don't re-type.
  useEffect(() => {
    const user = getUser();
    if (user) {
      setLoggedIn(true);
      setForm((f) => ({
        ...f,
        trainee_name: f.trainee_name || user.full_name || "",
        trainee_phone: f.trainee_phone || user.phone || "",
      }));
    }
  }, []);

  // Đo tỷ lệ rơi giữa "bắt đầu điền" và "gửi thành công" — khúc này cho biết
  // form đang hỏi quá nhiều hay người dùng vốn không đủ nhu cầu.
  const startedRef = useRef(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    if (!startedRef.current) {
      startedRef.current = true;
      track(EVENTS.leadFormStart, { pt_slug: ptSlug });
    }
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.trainee_name.trim() || form.trainee_name.trim().length < 2) {
      setError(t("errName"));
      return;
    }
    const phone = form.trainee_phone.replace(/[\s.\-]/g, "");
    if (!/^(0|\+84)\d{9,10}$/.test(phone)) {
      setError(t("errPhone"));
      return;
    }
    setSubmitting(true);
    try {
      const created = await apiFetch<LeadCreated>("/api/leads", {
        method: "POST",
        auth: isLoggedIn(),
        body: JSON.stringify({ pt_slug: ptSlug, ...form }),
      });
      trackLead({ pt_slug: ptSlug, goal: form.goal, budget: form.budget });
      setTrackToken(created.track_token ?? "");
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("errSubmit"));
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="card p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
          <svg className="h-6 w-6 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h3 className="mt-3 font-semibold text-slate-900">{t("successTitle")}</h3>
        {/*
          KHÔNG hứa "thường trong vòng 24 giờ" nữa. Chưa có số liệu nào chống
          lưng cho con số đó, và nó nằm ngoài tầm kiểm soát của mình — PT có gọi
          hay không là việc của PT. Thay bằng thứ nói được chắc chắn: đã báo cho
          PT, và đây là đường để bạn tự kiểm tra.
        */}
        <p className="mt-1 text-sm text-slate-500">
          {t("successBody", { ptName })}
        </p>
        {trackToken && (
          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-left">
            <p className="text-xs text-slate-500">
              {t("trackNote")}
            </p>
            <Link
              href={`/track/${trackToken}`}
              className="mt-1 block break-all text-sm font-semibold text-emerald-600 hover:underline"
            >
              {t("trackLink")}
            </Link>
          </div>
        )}
        {/*
          Phễu không được chết ở một PT. Nỗi lo lớn nhất lúc này là "gửi rồi
          không ai gọi", nên lối ra đặt ngay đây: đăng yêu cầu để nhiều PT cùng
          thấy, hoặc xem tiếp PT khác.
        */}
        <div className="mt-4 border-t border-slate-100 pt-4 text-left">
          <p className="text-xs text-slate-500">
            {t("moreTitle")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href="/requests/new" className="btn-secondary text-xs">
              {t("morePost")}
            </Link>
            <Link
              href="/pts"
              className="inline-flex items-center px-2 text-xs font-semibold text-slate-500 hover:text-emerald-600"
            >
              {t("moreBrowse")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card p-5">
      <h3 className="font-bold text-slate-900">{t("heading")}</h3>
      <p className="mt-1 text-sm text-slate-500">
        {t("subtitle", { ptName })}
      </p>
      <div className="mt-4 space-y-3">
        <div>
          <label className="label" htmlFor="lead-name">{t("name")}</label>
          <input
            id="lead-name"
            className="input"
            placeholder={t("namePlaceholder")}
            value={form.trainee_name}
            onChange={(e) => set("trainee_name", e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="lead-phone">{t("phone")}</label>
          <input
            id="lead-phone"
            className="input"
            type="tel"
            placeholder="09xx xxx xxx"
            value={form.trainee_phone}
            onChange={(e) => set("trainee_phone", e.target.value)}
            required
          />
          <p className="mt-1 text-xs text-slate-400">
            {t("phoneNote", { ptName })}
          </p>
        </div>
        <div>
          <label className="label" htmlFor="lead-goal">{t("goal")}</label>
          <select
            id="lead-goal"
            className="input"
            value={form.goal}
            onChange={(e) => set("goal", e.target.value)}
          >
            <option value="">{t("goalPlaceholder")}</option>
            {SPECIALTIES.map((s) => (
              <option key={s.slug} value={s.label}>{s.label}</option>
            ))}
            <option value="Khác">{t("goalOther")}</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="lead-area">{t("area")}</label>
          <input
            id="lead-area"
            className="input"
            placeholder={t("areaPlaceholder")}
            value={form.area}
            onChange={(e) => set("area", e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="lead-budget">{t("budget")}</label>
          <select
            id="lead-budget"
            className="input"
            value={form.budget}
            onChange={(e) => set("budget", e.target.value)}
          >
            {/* `value` giữ nguyên tiếng Việt vì nó được LƯU vào Lead.budget và
                PT đọc trực tiếp — đây là dữ liệu, không phải nhãn hiển thị.
                Muốn đa ngôn ngữ thật sự thì phải đổi sang mã ổn định
                (under_300k...) ở cả backend; xem ghi chú trong README. */}
            <option value="">{t("budgetPlaceholder")}</option>
            <option value="Dưới 300.000đ/buổi">{t("budget1")}</option>
            <option value="300.000đ - 500.000đ/buổi">{t("budget2")}</option>
            <option value="500.000đ - 1.000.000đ/buổi">{t("budget3")}</option>
            <option value="Trên 1.000.000đ/buổi">{t("budget4")}</option>
          </select>
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? t("submitting") : t("submit")}
        </button>
        <p className="text-center text-xs text-slate-400">
          {loggedIn ? t("footLoggedIn") : t("footGuest")}
        </p>
      </div>
    </form>
  );
}
