"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import ImageUploader from "@/components/ImageUploader";
import ListingChecklist from "@/components/ListingChecklist";
import LocationSelect from "@/components/LocationSelect";
import { apiFetch, ApiError } from "@/lib/api";
import { revalidatePublicPages } from "@/lib/revalidate";
import { SPECIALTIES } from "@/lib/constants";
import type { CertificationItem, PTLocation, PTProfile } from "@/lib/types";
import { useTranslations } from "next-intl";

function normalizeCert(c: CertificationItem | string): CertificationItem {
  return typeof c === "string" ? { name: c } : c;
}

interface ProfileForm {
  full_name: string;
  gender: string;
  age: string;
  experience_years: string;
  bio: string;
  avatar_url: string | null;
  certifications: CertificationItem[];
  specialties: string[];
  social_links: { facebook: string; instagram: string; tiktok: string; zalo: string };
  pricing: { per_session: string; package_12: string; package_24: string; package_36: string };
}

const EMPTY_FORM: ProfileForm = {
  full_name: "",
  gender: "",
  age: "",
  experience_years: "",
  bio: "",
  avatar_url: null,
  certifications: [],
  specialties: [],
  social_links: { facebook: "", instagram: "", tiktok: "", zalo: "" },
  pricing: { per_session: "", package_12: "", package_24: "", package_36: "" },
};

function toInt(value: string): number | null {
  const n = parseInt(value, 10);
  return isNaN(n) ? null : n;
}

export default function ProfileEditorPage() {
  const t = useTranslations("profileEditor");
  const tLoc = useTranslations("location");
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);
  // Tên ĐÃ LƯU, tách khỏi `form.full_name` đang gõ dở — cùng lối như slug /
  // slugInput. Link "tìm tôi trên trang tìm kiếm" phải tra bằng tên backend
  // đang giữ; tra bằng tên chưa lưu thì ra 0 kết quả, tức là đẩy PT vào đúng
  // cái kết luận "hệ thống lỗi" mà khối này tồn tại để tránh.
  const [savedName, setSavedName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugInput, setSlugInput] = useState("");
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const slugTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const [locations, setLocations] = useState<PTLocation[]>([]);
  const [newCert, setNewCert] = useState("");
  const [customSpecialty, setCustomSpecialty] = useState("");
  const [showCustomSpecialty, setShowCustomSpecialty] = useState(false);
  const [newLocation, setNewLocation] = useState({ gym_name: "", ward: "", city: "" });
  const [locationFormKey, setLocationFormKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  // Luật "hồ sơ đủ điều kiện hiển thị" do backend giữ (app/services/listing.py);
  // ở đây chỉ nhận kết quả về hiển thị, không tính lại.
  const [missingListing, setMissingListing] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);

  // Giá trị đang được kiểm tra. Phản hồi của một lượt kiểm tra cũ về muộn sẽ bị
  // bỏ qua — không thì trạng thái "còn trống" của chuỗi vừa gõ dở có thể ghi đè
  // lên kết quả của chuỗi hiện tại.
  const slugChecking = useRef("");

  const checkSlug = useCallback(async (value: string) => {
    if (value.length < 3) { setSlugStatus("invalid"); return; }
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(value)) { setSlugStatus("invalid"); return; }
    slugChecking.current = value;
    setSlugStatus("checking");
    try {
      const res = await apiFetch<{ available: boolean }>(`/api/pts/me/check-slug?slug=${encodeURIComponent(value)}`, { auth: true });
      if (slugChecking.current !== value) return;
      setSlugStatus(res.available ? "available" : "taken");
    } catch {
      if (slugChecking.current !== value) return;
      setSlugStatus("idle");
    }
  }, []);

  function handleSlugChange(value: string) {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setSlugInput(cleaned);
    setSlugStatus("idle");
    if (slugTimer.current) clearTimeout(slugTimer.current);
    if (cleaned && cleaned !== slug) {
      slugTimer.current = setTimeout(() => checkSlug(cleaned), 500);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const p = await apiFetch<PTProfile>("/api/pts/me", { auth: true });
        setSlug(p.slug ?? "");
        setSlugInput(p.slug ?? "");
        setSavedName(p.full_name ?? "");
        setLocations(p.locations ?? []);
        setMissingListing(p.missing_listing ?? []);
        setIsActive(p.is_active !== false);
        const knownSlugs = new Set(SPECIALTIES.map((s) => s.slug));
        const hasCustom = (p.specialties ?? []).some((s) => !knownSlugs.has(s));
        if (hasCustom) setShowCustomSpecialty(true);
        setForm({
          full_name: p.full_name ?? "",
          gender: p.gender ?? "",
          age: p.age != null ? String(p.age) : "",
          experience_years: p.experience_years != null ? String(p.experience_years) : "",
          bio: p.bio ?? "",
          avatar_url: p.avatar_url ?? null,
          certifications: (p.certifications ?? []).map(normalizeCert),
          specialties: p.specialties ?? [],
          social_links: {
            facebook: p.social_links?.facebook ?? "",
            instagram: p.social_links?.instagram ?? "",
            tiktok: p.social_links?.tiktok ?? "",
            zalo: p.social_links?.zalo ?? "",
          },
          pricing: {
            per_session: p.pricing?.per_session != null ? String(p.pricing.per_session) : "",
            package_12: p.pricing?.package_12 != null ? String(p.pricing.package_12) : "",
            package_24: p.pricing?.package_24 != null ? String(p.pricing.package_24) : "",
            package_36: p.pricing?.package_36 != null ? String(p.pricing.package_36) : "",
          },
        });
      } catch {
        setMessage({ type: "error", text: t("loadFailed") });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function toggleSpecialty(slug: string) {
    setForm((f) => ({
      ...f,
      specialties: f.specialties.includes(slug)
        ? f.specialties.filter((s) => s !== slug)
        : [...f.specialties, slug],
    }));
  }

  function addCert() {
    const name = newCert.trim();
    if (!name) return;
    setForm((f) => ({ ...f, certifications: [...f.certifications, { name }] }));
    setNewCert("");
  }

  function removeCert(index: number) {
    setForm((f) => ({ ...f, certifications: f.certifications.filter((_, i) => i !== index) }));
  }

  function setCertImage(index: number, url: string | null) {
    setForm((f) => ({
      ...f,
      certifications: f.certifications.map((c, i) =>
        i === index ? { ...c, image_url: url } : c
      ),
    }));
  }

  async function addLocation() {
    if (!newLocation.gym_name.trim() || !newLocation.city.trim()) {
      setMessage({ type: "error", text: t("errGymCity") });
      return;
    }
    setMessage(null);
    try {
      const created = await apiFetch<PTLocation>("/api/pts/me/locations", {
        method: "POST",
        auth: true,
        body: JSON.stringify({
          gym_name: newLocation.gym_name.trim(),
          ward: newLocation.ward.trim(),
          city: newLocation.city.trim(),
        }),
      });
      setLocations((ls) => [...ls, created ?? newLocation]);
      setNewLocation({ gym_name: "", ward: "", city: "" });
      setLocationFormKey((k) => k + 1);
      refreshListingStatus();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof ApiError ? err.message : t("addLocationFailed") });
    }
  }

  async function removeLocation(loc: PTLocation, index: number) {
    if (!loc.id) {
      setLocations((ls) => ls.filter((_, i) => i !== index));
      return;
    }
    try {
      await apiFetch(`/api/pts/me/locations/${loc.id}`, { method: "DELETE", auth: true });
      setLocations((ls) => ls.filter((_, i) => i !== index));
      refreshListingStatus();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof ApiError ? err.message : t("removeLocationFailed") });
    }
  }

  /**
   * Hỏi lại backend xem hồ sơ đã đủ điều kiện hiển thị chưa.
   *
   * Địa điểm được lưu ngay lúc thêm/xoá chứ không đợi nút Lưu, nên sau hai thao
   * tác đó trạng thái cũ trên màn hình là sai. Gọi lại một lần rẻ hơn nhiều so
   * với việc chép luật của backend sang đây rồi hai bên trôi khỏi nhau.
   */
  const refreshListingStatus = useCallback(async () => {
    try {
      const p = await apiFetch<PTProfile>("/api/pts/me", { auth: true });
      setMissingListing(p.missing_listing ?? []);
      revalidatePublicPages();
    } catch {
      // Chỉ là chỉ báo phụ — hỏng thì giữ nguyên trạng thái đang hiện, không
      // đáng để bắn thông báo lỗi che mất việc người dùng vừa làm xong.
    }
  }, []);

  // Chỉ chặn khi người dùng thực sự đang đổi URL sang giá trị chưa dùng được.
  const slugBlocked =
    slugInput !== slug && ["checking", "taken", "invalid"].includes(slugStatus);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    // Không gửi lên rồi để API từ chối: người dùng đã được báo ngay dưới ô nhập
    // là URL này bị chiếm, gửi tiếp chỉ đổi thông báo rõ ràng thành lỗi API.
    if (slugBlocked) {
      setMessage({
        type: "error",
        text:
          slugStatus === "checking"
            ? t("slugChecking")
            : t("slugBlocked"),
      });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const updated = await apiFetch<PTProfile>("/api/pts/me", {
        method: "PUT",
        auth: true,
        body: JSON.stringify({
          ...(slugInput !== slug ? { slug: slugInput } : {}),
          is_active: isActive,
          full_name: form.full_name.trim(),
          gender: form.gender || null,
          age: toInt(form.age),
          experience_years: toInt(form.experience_years),
          bio: form.bio,
          avatar_url: form.avatar_url,
          certifications: form.certifications,
          specialties: form.specialties,
          social_links: {
            facebook: form.social_links.facebook.trim() || null,
            instagram: form.social_links.instagram.trim() || null,
            tiktok: form.social_links.tiktok.trim() || null,
            zalo: form.social_links.zalo.trim() || null,
          },
          pricing: {
            per_session: toInt(form.pricing.per_session),
            package_12: toInt(form.pricing.package_12),
            package_24: toInt(form.pricing.package_24),
            package_36: toInt(form.pricing.package_36),
          },
        }),
      });
      if (slugInput !== slug) setSlug(slugInput);
      setSavedName(updated?.full_name ?? form.full_name.trim());
      setSlugStatus("idle");
      setMissingListing(updated?.missing_listing ?? []);
      setMessage({ type: "success", text: t("saved") });
      // Trang công khai dựng sẵn theo ISR, nên không xoá cache ở đây thì PT bấm
      // "Xem trang của tôi" ngay sau khi lưu vẫn thấy nội dung cũ.
      revalidatePublicPages();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof ApiError ? err.message : t("saveFailed") });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="card h-96 animate-pulse bg-slate-100" />;
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("heading")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("subtitle")}</p>
        </div>
        {slug && (
          <Link href={`/pt/${slug}`} target="_blank" className="btn-secondary">
            {t("viewPublic")}
          </Link>
        )}
      </div>

      {message && (
        <div
          className={`rounded-lg border p-4 text-sm ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-600"
          }`}
        >
          {message.text}
        </div>
      )}

      <ListingChecklist missing={missingListing} slug={slug} fullName={savedName} hideAction />

      {/* URL cá nhân */}
      <section className="card space-y-2 p-5">
        <h2 className="font-bold text-slate-900">{t("slugHeading")}</h2>
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-sm text-slate-400">ptmatch.vn/pt/</span>
          <input
            className="input max-w-xs"
            value={slugInput}
            onChange={(e) => handleSlugChange(e.target.value)}
            placeholder="your-name"
          />
          {slugInput !== slug && slugStatus === "checking" && (
            <span className="text-xs text-slate-400">{t("slugChecking2")}</span>
          )}
          {slugInput !== slug && slugStatus === "available" && (
            <span className="text-xs text-emerald-600">&#10003; {t("slugAvailable")}</span>
          )}
          {slugInput !== slug && slugStatus === "taken" && (
            <span className="text-xs text-rose-600">&#10007; {t("slugTaken")}</span>
          )}
          {slugInput !== slug && slugStatus === "invalid" && (
            <span className="text-xs text-rose-600">&#10007; {t("slugInvalid")}</span>
          )}
        </div>
      </section>

      {/* Thông tin cơ bản */}
      <section className="card space-y-4 p-5">
        <h2 className="font-bold text-slate-900">{t("basicHeading")}</h2>
        <ImageUploader
          label={t("avatarLabel")}
          value={form.avatar_url}
          onChange={(url) => setForm((f) => ({ ...f, avatar_url: url }))}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="pf-name">{t("name")}</label>
            <input
              id="pf-name"
              className="input"
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="pf-gender">{t("gender")}</label>
            <select
              id="pf-gender"
              className="input"
              value={form.gender}
              onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
            >
              <option value="">{t("genderPlaceholder")}</option>
              <option value="male">{t("male")}</option>
              <option value="female">{t("female")}</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="pf-age">{t("age")}</label>
            <input
              id="pf-age"
              type="number"
              min={16}
              max={99}
              className="input"
              value={form.age}
              onChange={(e) => setForm((f) => ({ ...f, age: e.target.value }))}
            />
          </div>
          <div>
            <label className="label" htmlFor="pf-exp">{t("experience")}</label>
            <input
              id="pf-exp"
              type="number"
              min={0}
              max={60}
              className="input"
              value={form.experience_years}
              onChange={(e) => setForm((f) => ({ ...f, experience_years: e.target.value }))}
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="pf-bio">{t("bio")}</label>
          <textarea
            id="pf-bio"
            className="input min-h-32"
            rows={6}
            placeholder={t("bioPlaceholder")}
            value={form.bio}
            onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
          />
        </div>
      </section>

      {/* Chuyên môn */}
      <section className="card space-y-3 p-5">
        <h2 className="font-bold text-slate-900">{t("specialtyHeading")}</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {SPECIALTIES.map((s) => (
            <label
              key={s.slug}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm transition-colors ${
                form.specialties.includes(s.slug)
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              <input
                type="checkbox"
                className="h-4 w-4 accent-emerald-600"
                checked={form.specialties.includes(s.slug)}
                onChange={() => toggleSpecialty(s.slug)}
              />
              {s.label}
            </label>
          ))}
          <button
            type="button"
            onClick={() => setShowCustomSpecialty(true)}
            className={`flex items-center gap-2 rounded-lg border border-dashed p-2.5 text-sm transition-colors ${
              showCustomSpecialty
                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                : "border-slate-300 text-slate-500 hover:border-slate-400"
            }`}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {t("other")}
          </button>
        </div>
        {showCustomSpecialty && (
          <div className="space-y-2">
            {form.specialties
              .filter((s) => !SPECIALTIES.some((sp) => sp.slug === s))
              .map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <span className="rounded-lg border border-emerald-500 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-700">{s}</span>
                  <button
                    type="button"
                    onClick={() => toggleSpecialty(s)}
                    className="text-rose-500 hover:text-rose-600"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            <div className="flex gap-2">
              <input
                className="input max-w-xs"
                placeholder={t("customPlaceholder")}
                value={customSpecialty}
                onChange={(e) => setCustomSpecialty(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const slug = customSpecialty.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
                    if (slug && !form.specialties.includes(slug)) {
                      setForm((f) => ({ ...f, specialties: [...f.specialties, slug] }));
                    }
                    setCustomSpecialty("");
                  }
                }}
              />
              <button
                type="button"
                className="btn-secondary shrink-0"
                onClick={() => {
                  const slug = customSpecialty.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
                  if (slug && !form.specialties.includes(slug)) {
                    setForm((f) => ({ ...f, specialties: [...f.specialties, slug] }));
                  }
                  setCustomSpecialty("");
                }}
              >
                {t("add")}
              </button>
            </div>
            <p className="text-xs text-slate-400">{t("customNote")}</p>
          </div>
        )}
      </section>

      {/* Chứng chỉ */}
      <section className="card space-y-3 p-5">
        <h2 className="font-bold text-slate-900">{t("certHeading")}</h2>
        {form.certifications.length > 0 && (
          <ul className="space-y-3">
            {form.certifications.map((cert, i) => (
              <li key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-700">{cert.name}</span>
                  <button
                    type="button"
                    onClick={() => removeCert(i)}
                    className="text-rose-500 hover:text-rose-600"
                    aria-label={t("removeCert", { name: cert.name })}
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="mt-2">
                  <ImageUploader
                    label={t("certImageLabel")}
                    value={cert.image_url ?? null}
                    onChange={(url) => setCertImage(i, url)}
                    previewClassName="h-20 w-28"
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input
            className="input"
            placeholder={t("certPlaceholder")}
            value={newCert}
            onChange={(e) => setNewCert(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCert();
              }
            }}
          />
          <button type="button" className="btn-secondary shrink-0" onClick={addCert}>
            {t("add")}
          </button>
        </div>
      </section>

      {/* Bảng giá */}
      <section className="card space-y-3 p-5">
        <h2 className="font-bold text-slate-900">{t("pricingHeading")}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {([
            ["per_session", "pricePerSession"],
            ["package_12", "package12"],
            ["package_24", "package24"],
            ["package_36", "package36"],
          ] as const).map(([key, label]) => (
            <div key={key}>
              <label className="label" htmlFor={`pf-price-${key}`}>{t(label)}</label>
              <input
                id={`pf-price-${key}`}
                type="number"
                min={0}
                step={10000}
                className="input"
                placeholder={t("pricePlaceholder")}
                value={form.pricing[key]}
                onChange={(e) =>
                  setForm((f) => ({ ...f, pricing: { ...f.pricing, [key]: e.target.value } }))
                }
              />
            </div>
          ))}
        </div>
      </section>

      {/* Social links */}
      <section className="card space-y-3 p-5">
        <h2 className="font-bold text-slate-900">{t("socialHeading")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {([
            ["facebook", "Facebook"],
            ["instagram", "Instagram"],
            ["tiktok", "TikTok"],
            ["zalo", "Zalo"],
          ] as const).map(([key, label]) => (
            <div key={key}>
              {/* Tên thương hiệu, không dịch — không có trong catalog i18n */}
              <label className="label" htmlFor={`pf-social-${key}`}>{label}</label>
              <input
                id={`pf-social-${key}`}
                type="url"
                className="input"
                placeholder={t("socialPlaceholder", { name: label })}
                value={form.social_links[key]}
                onChange={(e) =>
                  setForm((f) => ({ ...f, social_links: { ...f.social_links, [key]: e.target.value } }))
                }
              />
            </div>
          ))}
        </div>
      </section>

      {/* Khu vực hoạt động */}
      <section className="card space-y-3 p-5">
        <h2 className="font-bold text-slate-900">{t("locationsHeading")}</h2>
        <p className="text-xs text-slate-400">{t("locationsNote")}</p>
        {locations.length > 0 && (
          <ul className="space-y-2">
            {locations.map((loc, i) => (
              <li
                key={loc.id ?? i}
                className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700"
              >
                {[loc.gym_name, loc.ward, loc.city].filter(Boolean).join(" · ")}
                <button
                  type="button"
                  onClick={() => removeLocation(loc, i)}
                  className="text-rose-500 hover:text-rose-600"
                  aria-label={t("removeLocation")}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
        {/* Ô CHỌN, không phải input tự do.
            Gõ tay thì "HCM" / "TP.HCM" / "Thành phố Hồ Chí Minh" thành ba giá
            trị khác nhau trong DB, mà bộ lọc khu vực so khớp theo chuỗi con nên
            hồ sơ lưu dạng viết tắt biến mất khỏi kết quả tìm kiếm — đúng lỗi
            alembic 0012 đã phải dọn một lần. Ô chọn ghi xuống tên chuẩn của
            danh mục, và chỉ hiện các tỉnh đang phục vụ. */}
        <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
          <input
            className="input"
            placeholder={t("gymPlaceholder")}
            value={newLocation.gym_name}
            onChange={(e) => setNewLocation((l) => ({ ...l, gym_name: e.target.value }))}
          />
          {/* key: LocationSelect giữ state chọn bên trong và chỉ đồng bộ TỪ
              cityValue khi giá trị không rỗng, nên reset về "" sau khi thêm sẽ
              không xoá lựa chọn đang hiện. Đổi key để remount là cách reset
              chắc chắn nhất. */}
          <LocationSelect
            key={locationFormKey}
            layout="row"
            cityValue={newLocation.city}
            wardValue={newLocation.ward}
            onCityChange={(city) => setNewLocation((l) => ({ ...l, city, ward: "" }))}
            onWardChange={(ward) => setNewLocation((l) => ({ ...l, ward }))}
          />
          <button type="button" className="btn-secondary" onClick={addLocation}>
            {t("add")}
          </button>
        </div>
        <p className="text-xs text-slate-400">{tLoc("coverageNote")}</p>
      </section>

      {/* Tạm ẩn hồ sơ */}
      <section className="card space-y-3 p-5">
        <h2 className="font-bold text-slate-900">{t("visibilityHeading")}</h2>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <span className="text-sm text-slate-600">
            <span className="font-medium text-slate-900">{t("visibilityLabel")}</span>
            <span className="mt-0.5 block text-slate-500">
              {t("visibilityNote")}
            </span>
          </span>
        </label>
      </section>

      <div className="sticky bottom-4 z-10">
        <button type="submit" className="btn-primary w-full py-3 shadow-lg" disabled={saving || slugBlocked}>
          {saving ? t("saving") : t("save")}
        </button>
      </div>
    </form>
  );
}
