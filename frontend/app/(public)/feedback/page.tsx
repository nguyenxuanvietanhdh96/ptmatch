"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";

// Icon giữ ở đây, nhãn lấy từ catalog theo `key`.
const CATEGORIES = [
  { value: "feature", key: "catFeature", icon: "💡" },
  { value: "bug", key: "catBug", icon: "🐛" },
  { value: "ui", key: "catUi", icon: "🎨" },
  { value: "other", key: "catOther", icon: "💬" },
] as const;

export default function FeedbackPage() {
  const t = useTranslations("feedback");
  const [category, setCategory] = useState<string>("feature");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (message.trim().length < 10) {
      setError(t("errShort"));
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch("/api/feedback", {
        method: "POST",
        auth: true,
        body: JSON.stringify({
          category,
          message: message.trim(),
          contact_email: email.trim() || null,
        }),
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("errSubmit"));
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <svg className="h-8 w-8 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h2 className="mt-4 text-xl font-bold text-slate-900">{t("thanksTitle")}</h2>
        <p className="mt-2 text-slate-500">
          {t("thanksBody")}
        </p>
        <button
          onClick={() => { setSuccess(false); setMessage(""); setEmail(""); }}
          className="btn-secondary mt-6"
        >
          {t("sendAnother")}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900">{t("heading")}</h1>
        <p className="mt-2 text-sm text-slate-500">
          {t("subtitle")}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        {/* Category */}
        <div>
          <label className="label">{t("typeLabel")}</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value)}
                className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-sm transition-colors ${
                  category === c.value
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                <span className="text-lg">{c.icon}</span>
                {t(c.key)}
              </button>
            ))}
          </div>
        </div>

        {/* Message */}
        <div>
          <label className="label" htmlFor="fb-msg">{t("messageLabel")}</label>
          <textarea
            id="fb-msg"
            className="input min-h-32"
            rows={5}
            placeholder={
              category === "bug"
                ? t("placeholderBug")
                : category === "feature"
                ? t("placeholderFeature")
                : t("placeholderOther")
            }
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
          />
        </div>

        {/* Email */}
        <div>
          <label className="label" htmlFor="fb-email">{t("emailLabel")}</label>
          <input
            id="fb-email"
            type="email"
            className="input"
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <p className="mt-1 text-xs text-slate-400">{t("emailNote")}</p>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <button type="submit" className="btn-primary w-full py-3" disabled={submitting}>
          {submitting ? t("submitting") : t("submit")}
        </button>
      </form>
    </div>
  );
}
