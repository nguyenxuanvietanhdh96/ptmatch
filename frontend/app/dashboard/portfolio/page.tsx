"use client";

import { useEffect, useState } from "react";
import ImageUploader from "@/components/ImageUploader";
import { apiFetch, ApiError } from "@/lib/api";
import type { PortfolioItem, PortfolioType, PTProfile } from "@/lib/types";
import { useTranslations } from "next-intl";

/* eslint-disable @next/next/no-img-element */

// Nhãn loại nội dung: "Before / After" và "Video" là thuật ngữ giữ nguyên,
// nhưng vẫn đi qua catalog để ngôn ngữ khác đổi được nếu cần.
const TYPE_KEYS: Record<PortfolioType, string> = {
  before_after: "typeBeforeAfter",
  photo: "typePhoto",
  video: "typeVideo",
};

interface NewItemForm {
  type: PortfolioType;
  before_url: string | null;
  after_url: string | null;
  media_url: string | null;
  video_url: string;
  description: string;
}

const EMPTY_ITEM: NewItemForm = {
  type: "before_after",
  before_url: null,
  after_url: null,
  media_url: null,
  video_url: "",
  description: "",
};

function ItemPreview({ item }: { item: PortfolioItem }) {
  const t = useTranslations("portfolio2");
  if (item.type === "before_after") {
    return (
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-slate-200">
        <div className="relative">
          {item.before_url ? (
            <img src={item.before_url} alt={t("before")} className="aspect-square w-full object-cover" />
          ) : (
            <div className="aspect-square bg-slate-100" />
          )}
          <span className="absolute left-1.5 top-1.5 rounded bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">{t("before")}</span>
        </div>
        <div className="relative">
          {item.after_url ? (
            <img src={item.after_url} alt={t("after")} className="aspect-square w-full object-cover" />
          ) : (
            <div className="aspect-square bg-slate-100" />
          )}
          <span className="absolute left-1.5 top-1.5 rounded bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">{t("after")}</span>
        </div>
      </div>
    );
  }
  if (item.type === "photo") {
    return item.media_url ? (
      <img src={item.media_url} alt={item.description || t("imageAlt")} className="aspect-video w-full rounded-lg object-cover" />
    ) : (
      <div className="aspect-video rounded-lg bg-slate-100" />
    );
  }
  return (
    <a
      href={item.media_url || "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="flex aspect-video items-center justify-center rounded-lg bg-slate-900/90 text-white"
    >
      <svg className="h-10 w-10" fill="currentColor" viewBox="0 0 24 24">
        <path d="M8 5.14v13.72L19 12 8 5.14z" />
      </svg>
    </a>
  );
}

export default function PortfolioPage() {
  const t = useTranslations("portfolio2");
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewItemForm>(EMPTY_ITEM);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const profile = await apiFetch<PTProfile>("/api/pts/me", { auth: true });
        setItems((profile.portfolio_items ?? []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
      } catch {
        setError(t("loadFailed"));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const payload: Record<string, unknown> = {
      type: form.type,
      description: form.description.trim() || null,
      sort_order: items.length,
    };
    if (form.type === "before_after") {
      if (!form.before_url || !form.after_url) {
        setError(t("errBeforeAfter"));
        return;
      }
      payload.before_url = form.before_url;
      payload.after_url = form.after_url;
    } else if (form.type === "photo") {
      if (!form.media_url) {
        setError(t("errPhoto"));
        return;
      }
      payload.media_url = form.media_url;
    } else {
      if (!form.video_url.trim()) {
        setError(t("errVideo"));
        return;
      }
      payload.media_url = form.video_url.trim();
    }
    setSubmitting(true);
    try {
      const created = await apiFetch<PortfolioItem>("/api/pts/me/portfolio", {
        method: "POST",
        auth: true,
        body: JSON.stringify(payload),
      });
      setItems((list) => [...list, created]);
      setForm(EMPTY_ITEM);
      setShowForm(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("addFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(item: PortfolioItem) {
    if (!confirm(t("confirmDelete"))) return;
    setError("");
    try {
      await apiFetch(`/api/pts/me/portfolio/${item.id}`, { method: "DELETE", auth: true });
      setItems((list) => list.filter((i) => i.id !== item.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("deleteFailed"));
    }
  }

  async function handleSortChange(item: PortfolioItem, sortOrder: number) {
    setItems((list) =>
      [...list.map((i) => (i.id === item.id ? { ...i, sort_order: sortOrder } : i))].sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
      )
    );
    try {
      await apiFetch(`/api/pts/me/portfolio/${item.id}`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({ sort_order: sortOrder }),
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("reorderFailed"));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("heading")}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {t("subtitle")}
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? t("close") : t("addNew")}
        </button>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">{error}</div>}

      {showForm && (
        <form onSubmit={handleAdd} className="card space-y-4 p-5">
          <div>
            <span className="label">{t("contentType")}</span>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(TYPE_KEYS) as PortfolioType[]).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setForm((f) => ({ ...EMPTY_ITEM, type: kind, description: f.description }))}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                    form.type === kind
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-slate-300 text-slate-600 hover:border-slate-400"
                  }`}
                >
                  {t(TYPE_KEYS[kind])}
                </button>
              ))}
            </div>
          </div>

          {form.type === "before_after" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <ImageUploader
                label={t("labelBefore")}
                value={form.before_url}
                onChange={(url) => setForm((f) => ({ ...f, before_url: url }))}
              />
              <ImageUploader
                label={t("labelAfter")}
                value={form.after_url}
                onChange={(url) => setForm((f) => ({ ...f, after_url: url }))}
              />
            </div>
          )}
          {form.type === "photo" && (
            <ImageUploader
              label={t("labelPhoto")}
              value={form.media_url}
              onChange={(url) => setForm((f) => ({ ...f, media_url: url }))}
            />
          )}
          {form.type === "video" && (
            <div>
              <label className="label" htmlFor="pf-video">{t("videoLink")}</label>
              <input
                id="pf-video"
                type="url"
                className="input"
                placeholder="https://youtube.com/..."
                value={form.video_url}
                onChange={(e) => setForm((f) => ({ ...f, video_url: e.target.value }))}
              />
            </div>
          )}

          <div>
            <label className="label" htmlFor="pf-desc">{t("description")}</label>
            <textarea
              id="pf-desc"
              className="input"
              rows={2}
              placeholder={t("descPlaceholder")}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? t("adding") : t("add")}
          </button>
        </form>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card h-56 animate-pulse bg-slate-100" />
          ))}
        </div>
      ) : items.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div key={item.id} className="card space-y-3 p-4">
              <ItemPreview item={item} />
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="badge">{t(TYPE_KEYS[item.type]) ?? item.type}</span>
                  {item.description && <p className="mt-1.5 text-sm text-slate-600">{item.description}</p>}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  {t("order")}
                  <input
                    type="number"
                    className="input w-20 py-1.5"
                    defaultValue={item.sort_order ?? 0}
                    min={0}
                    onBlur={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v) && v !== (item.sort_order ?? 0)) handleSortChange(item, v);
                    }}
                  />
                </label>
                <button className="btn-danger px-3 py-1.5 text-xs" onClick={() => handleDelete(item)}>
                  {t("delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-10 text-center text-sm text-slate-500">
          {t("empty")}
        </div>
      )}
    </div>
  );
}
