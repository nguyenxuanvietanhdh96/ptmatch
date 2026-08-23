"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import LocationSelect from "@/components/LocationSelect";
import { SPECIALTIES } from "@/lib/constants";

const darkInput =
  "w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/50 backdrop-blur focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 [&>option]:text-slate-800";
const darkLabel = "mb-1.5 block text-sm font-medium text-white/80";

export default function QuickMatchForm() {
  const t = useTranslations("quickMatch");
  const router = useRouter();
  const [specialty, setSpecialty] = useState("");
  const [q, setQ] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData(formRef.current!);
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (specialty) params.set("specialty", specialty);
    const city = (fd.get("city") as string)?.trim();
    const ward = (fd.get("ward") as string)?.trim();
    if (city) params.set("city", city);
    if (ward) params.set("ward", ward);
    router.push(`/pts${params.toString() ? `?${params.toString()}` : ""}`);
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="mx-auto w-full max-w-4xl space-y-3 rounded-2xl border border-white/15 bg-slate-900/40 p-5 text-left shadow-2xl ring-1 ring-white/10 backdrop-blur-xl"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="qm-q" className={darkLabel}>{t("search")}</label>
          <input
            id="qm-q"
            className={darkInput}
            placeholder={t("searchPlaceholder")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="qm-specialty" className={darkLabel}>{t("goal")}</label>
          <select
            id="qm-specialty"
            className={darkInput}
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
          >
            <option value="">{t("allGoals")}</option>
            {SPECIALTIES.map((s) => (
              <option key={s.slug} value={s.slug}>{s.label}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <span className={darkLabel}>{t("area")}</span>
          <LocationSelect layout="row" inputClassName={darkInput} />
        </div>
      </div>
      <div className="flex justify-center pt-3">
        <button
          type="submit"
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-10 py-3 text-base font-semibold text-slate-900 shadow-lg shadow-amber-500/20 transition hover:bg-amber-400 sm:w-auto"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197M15.803 15.803A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          {t("submit")}
        </button>
      </div>
    </form>
  );
}
