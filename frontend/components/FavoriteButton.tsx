"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";
import { useTranslations } from "next-intl";

interface FavoriteButtonProps {
  ptSlug: string;
  /** "full" shows a labelled button; "icon" shows just the heart. */
  variant?: "full" | "icon";
  className?: string;
}

export default function FavoriteButton({ ptSlug, variant = "full", className = "" }: FavoriteButtonProps) {
  const t = useTranslations("favorite");
  const router = useRouter();
  const [favorited, setFavorited] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) {
      setReady(true);
      return;
    }
    apiFetch<string[]>("/api/favorites/ids", { auth: true })
      .then((slugs) => setFavorited(slugs.includes(ptSlug)))
      .catch(() => {})
      .finally(() => setReady(true));
  }, [ptSlug]);

  async function toggle() {
    if (!isLoggedIn()) {
      const next = typeof window !== "undefined" ? window.location.pathname : `/pt/${ptSlug}`;
      router.push(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    setBusy(true);
    const wasFavorited = favorited;
    setFavorited(!wasFavorited); // optimistic
    try {
      if (wasFavorited) {
        await apiFetch(`/api/favorites/${encodeURIComponent(ptSlug)}`, { method: "DELETE", auth: true });
      } else {
        await apiFetch("/api/favorites", {
          method: "POST",
          auth: true,
          body: JSON.stringify({ pt_slug: ptSlug }),
        });
      }
    } catch (err) {
      setFavorited(wasFavorited); // rollback
      if (err instanceof ApiError && err.status === 401) {
        router.push(`/login?next=${encodeURIComponent(`/pt/${ptSlug}`)}`);
      }
    } finally {
      setBusy(false);
    }
  }

  const heart = (
    <svg
      className={variant === "icon" ? "h-5 w-5" : "h-4 w-4"}
      viewBox="0 0 24 24"
      fill={favorited ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
      />
    </svg>
  );

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-label={favorited ? t("unsave") : t("save")}
        aria-pressed={favorited}
        className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
          favorited
            ? "border-rose-200 bg-rose-50 text-rose-500"
            : "border-slate-200 bg-white text-slate-400 hover:text-rose-500"
        } ${className}`}
      >
        {heart}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy || !ready}
      aria-pressed={favorited}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
        favorited
          ? "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      } ${className}`}
    >
      {heart}
      {favorited ? t("saved") : t("save")}
    </button>
  );
}
