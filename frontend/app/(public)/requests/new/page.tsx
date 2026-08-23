"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import LocationSelect from "@/components/LocationSelect";
import { useTranslations } from "next-intl";
import { track } from "@/lib/analytics";
import { ApiError, apiFetch } from "@/lib/api";
import { getUser, isLoggedIn } from "@/lib/auth";
import { PRICE_OPTIONS, SPECIALTIES } from "@/lib/constants";
import type { TraineeRequest } from "@/lib/types";

/**
 * Form đăng yêu cầu tìm PT — cố tình ngắn.
 *
 * Bài đăng thật trong các group Facebook cho thấy người ta tự viết rất trôi
 * chảy khi không bị ép vào ô: họ nêu khung giờ, chi nhánh phòng tập và tiêu
 * chí chất lượng, nhưng gần như không bao giờ nhắc tới ngân sách hay giới tính
 * PT. Nên ở đây chỉ bốn ô bắt buộc nhìn thấy ngay, phần còn lại xếp gọn lại —
 * chúng vẫn có ích cho bộ lọc của PT, nhưng không đáng để chặn đường người
 * đang muốn đăng.
 *
 * Ô mô tả giữ vai trò chính, và placeholder của nó chính là format bài đăng
 * quen thuộc — đó là cách rẻ nhất để xin được khung giờ và tên phòng tập mà
 * không cần thêm trường dữ liệu nào.
 */

const NOTE_MIN = 10;

export default function NewRequestPage() {
  const t = useTranslations("newRequest");
  const tLoc = useTranslations("location");
  const [form, setForm] = useState({
    trainee_name: "",
    trainee_phone: "",
    contact_other: "",
    specialty: "",
    city: "",
    ward: "",
    budget_min: "",
    budget_max: "",
    preferred_gender: "",
    note: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<TraineeRequest | null>(null);
  const [error, setError] = useState("");
  const started = useRef(false);

  // Điền sẵn cho người đã đăng nhập, giống LeadForm.
  useEffect(() => {
    const user = getUser();
    if (!user) return;
    setForm((f) => ({
      ...f,
      trainee_name: f.trainee_name || user.full_name || "",
      trainee_phone: f.trainee_phone || user.phone || "",
    }));
  }, []);

  // Nhận sẵn chuyên môn/khu vực từ query.
  //
  // Đường vào chính của form này là màn hình tìm kiếm không ra kết quả — lúc đó
  // người dùng vừa khai xong quận và mục tiêu, bắt khai lại là lý do bỏ ngang.
  //
  // Đọc thẳng từ window thay vì useSearchParams: hook đó buộc phải có Suspense
  // bao ngoài, mà việc điền sẵn vốn chỉ xảy ra phía client nên không đáng đánh
  // đổi cả cách dựng trang.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const specialty = sp.get("specialty") ?? "";
    const city = sp.get("city") ?? "";
    const ward = sp.get("ward") ?? "";
    if (!specialty && !city && !ward) return;
    setForm((f) => ({
      ...f,
      specialty: f.specialty || specialty,
      city: f.city || city,
      ward: f.ward || ward,
    }));
  }, []);

  function set<K extends keyof typeof form>(key: K, value: string) {
    if (!started.current) {
      started.current = true;
      track("request_form_start");
    }
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (form.trainee_name.trim().length < 2) {
      setError(t("errName"));
      return;
    }
    const phone = form.trainee_phone.replace(/[\s.\-]/g, "");
    if (!/^(0|\+84)\d{9,10}$/.test(phone)) {
      setError(t("errPhone"));
      return;
    }
    // Mô tả là nội dung duy nhất PT nhìn thấy trên bảng; một dòng trống làm
    // yêu cầu vô dụng với cả hai bên nên chặn ngay tại đây.
    if (form.note.trim().length < NOTE_MIN) {
      setError(t("errNote"));
      return;
    }
    const min = form.budget_min ? Number(form.budget_min) : null;
    const max = form.budget_max ? Number(form.budget_max) : null;
    if (min !== null && max !== null && min > max) {
      setError(t("errBudget"));
      return;
    }

    setSubmitting(true);
    try {
      const result = await apiFetch<TraineeRequest>("/api/requests", {
        method: "POST",
        auth: isLoggedIn(),
        body: JSON.stringify({
          trainee_name: form.trainee_name.trim(),
          trainee_phone: phone,
          contact_other: form.contact_other.trim() || null,
          specialty: form.specialty || null,
          city: form.city || null,
          ward: form.ward || null,
          budget_min: min,
          budget_max: max,
          preferred_gender: form.preferred_gender || null,
          note: form.note.trim(),
        }),
      });
      track("request_submit_success", {
        specialty: form.specialty,
        ward: form.ward,
      });
      setCreated(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("errSubmit"));
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
        <div className="card p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
            <svg className="h-6 w-6 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h1 className="mt-3 text-xl font-bold text-slate-900">{t("successHeading")}</h1>
          {/* Không hứa số PT sẽ gọi: không có giới hạn nào để mà hứa, và một
              con số ở đây đọc như lời cảnh báo chứ không phải lời mời. */}
          <p className="mt-2 text-sm text-slate-500">
            {t.rich("successBody", { b: (c) => <strong>{c}</strong> })}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {isLoggedIn() && (
              <Link href="/account/requests" className="btn-primary">
                {t("viewMine")}
              </Link>
            )}
            <Link href="/pts" className="btn-secondary">
              {t("browsePTs")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900">{t("heading")}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {t("subtitle")}
      </p>

      <form onSubmit={handleSubmit} className="card mt-5 space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="rq-name">{t("name")}</label>
            <input
              id="rq-name"
              className="input"
              placeholder={t("namePlaceholder")}
              value={form.trainee_name}
              onChange={(e) => set("trainee_name", e.target.value)}
              required
            />
            <p className="mt-1 text-xs text-slate-400">{t("nameNote")}</p>
          </div>
          <div>
            <label className="label" htmlFor="rq-phone">{t("phone")}</label>
            <input
              id="rq-phone"
              className="input"
              type="tel"
              placeholder="09xx xxx xxx"
              value={form.trainee_phone}
              onChange={(e) => set("trainee_phone", e.target.value)}
              required
            />
            <p className="mt-1 text-xs text-slate-400">{t("phoneNote")}</p>
          </div>
        </div>

        <div>
          <LocationSelect
            cityValue={form.city}
            wardValue={form.ward}
            onCityChange={(v) => set("city", v)}
            onWardChange={(v) => set("ward", v)}
          />
          <p className="mt-1 text-xs text-slate-400">{tLoc("coverageNote")}</p>
        </div>

        <div>
          <label className="label" htmlFor="rq-note">{t("note")}</label>
          <textarea
            id="rq-note"
            className="input min-h-[150px]"
            placeholder={t("notePlaceholder")}
            maxLength={2000}
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
            required
          />
          <p className="mt-1 text-xs text-slate-400">
            {t("noteHint")}
          </p>
        </div>

        {/* Những trường bài đăng thật gần như không bao giờ nhắc tới. Vẫn giữ
            vì chúng nuôi bộ lọc bên phía PT, nhưng không bày ra chặn đường. */}
        <details className="rounded-lg border border-slate-200 px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-600">
            {t("moreDetails")}
          </summary>
          <div className="mt-4 space-y-4">
            <div>
              <label className="label" htmlFor="rq-contact">{t("contactOther")}</label>
              <input
                id="rq-contact"
                className="input"
                placeholder={t("contactOtherPlaceholder")}
                maxLength={200}
                value={form.contact_other}
                onChange={(e) => set("contact_other", e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-400">
                {t("contactOtherNote")}
              </p>
            </div>

            <div>
              <label className="label" htmlFor="rq-specialty">{t("specialty")}</label>
              <select
                id="rq-specialty"
                className="input"
                value={form.specialty}
                onChange={(e) => set("specialty", e.target.value)}
              >
                <option value="">{t("specialtyNone")}</option>
                {SPECIALTIES.map((s) => (
                  <option key={s.slug} value={s.slug}>{s.label}</option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="rq-bmin">{t("budgetFrom")}</label>
                <select
                  id="rq-bmin"
                  className="input"
                  value={form.budget_min}
                  onChange={(e) => set("budget_min", e.target.value)}
                >
                  <option value="">{t("budgetAny")}</option>
                  {PRICE_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>{t("budgetOption", { label: p.label })}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="rq-bmax">{t("budgetTo")}</label>
                <select
                  id="rq-bmax"
                  className="input"
                  value={form.budget_max}
                  onChange={(e) => set("budget_max", e.target.value)}
                >
                  <option value="">{t("budgetAny")}</option>
                  {PRICE_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>{t("budgetOption", { label: p.label })}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="label" htmlFor="rq-gender">{t("gender")}</label>
              <select
                id="rq-gender"
                className="input"
                value={form.preferred_gender}
                onChange={(e) => set("preferred_gender", e.target.value)}
              >
                <option value="">{t("genderAny")}</option>
                <option value="female">{t("genderFemale")}</option>
                <option value="male">{t("genderMale")}</option>
              </select>
            </div>
          </div>
        </details>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? t("submitting") : t("submit")}
        </button>
        <p className="text-center text-xs text-slate-400">
          {t("footNote")}
        </p>
      </form>
    </div>
  );
}
