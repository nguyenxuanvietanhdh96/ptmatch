"use client";

import { useRef, useState } from "react";
import { ApiError, uploadFile } from "@/lib/api";
import { useTranslations } from "next-intl";

/* eslint-disable @next/next/no-img-element */

interface ImageUploaderProps {
  label?: string;
  value?: string | null;
  onChange: (url: string | null) => void;
  /** Kích thước preview, mặc định h-32 */
  previewClassName?: string;
}

export default function ImageUploader({ label, value, onChange, previewClassName = "h-32 w-32" }: ImageUploaderProps) {
  const t = useTranslations("imageUploader");
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(t("pickImage"));
      return;
    }
    setError("");
    setUploading(true);
    try {
      const url = await uploadFile(file);
      onChange(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      {label && <span className="label">{label}</span>}
      <div className="flex items-center gap-3">
        <div
          className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50 ${previewClassName}`}
        >
          {value ? (
            <img src={value} alt={label || t("imageAlt")} className="h-full w-full object-cover" />
          ) : (
            <svg className="h-8 w-8 text-slate-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 19.5h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z" />
            </svg>
          )}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
            </div>
          )}
        </div>
        <div className="space-y-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? t("uploading") : value ? t("change") : t("choose")}
          </button>
          {value && (
            <button type="button" className="btn-danger ml-2" onClick={() => onChange(null)} disabled={uploading}>
              {t("remove")}
            </button>
          )}
          {error && <p className="text-xs text-rose-600">{error}</p>}
        </div>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>
    </div>
  );
}
