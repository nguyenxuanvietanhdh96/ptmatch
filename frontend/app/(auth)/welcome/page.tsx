"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import LocationSelect from "@/components/LocationSelect";
import { apiFetch, ApiError } from "@/lib/api";
import { getUser, saveAuth } from "@/lib/auth";
import type { AuthResponse, PTProfile, Role } from "@/lib/types";
import { useTranslations } from "next-intl";

/**
 * Màn hình sau khi đăng ký bằng SNS.
 *
 * Hai việc, đúng hai bước, và không có bước thứ ba:
 *
 * 1. **Xác nhận vai trò.** Vai trò chỉ được ghi một lần lúc tạo tài khoản, mà
 *    người bấm "Đăng nhập với Facebook" ở trang /login thì không hề chọn gì —
 *    trước đây họ thành học viên vĩnh viễn, không hồ sơ, không sửa được nếu
 *    không chạy SQL. Hỏi lại ở đây là chốt chặn cho đúng cái bẫy đó.
 *
 * 2. **Hai ô còn thiếu để hồ sơ PT hiển thị được.** Điều kiện là ảnh + giá +
 *    khu vực (xem backend app/services/listing.py), mà ảnh thì nhà cung cấp
 *    OAuth đã đưa sẵn — nên chỉ còn giá và khu vực. Hai ô thì không dựng
 *    wizard nhiều bước: mọi thứ còn lại (bio, chứng chỉ, portfolio, các gói)
 *    là làm giàu hồ sơ, không chặn publish, và được nhắc dần bằng
 *    ListingChecklist trong dashboard.
 *
 * Học viên không có bước 2 — họ không có gì phải điền.
 */
const PRICE_PLACEHOLDER = "400000";

export default function WelcomePage() {
  const t = useTranslations("welcome");
  const tLoc = useTranslations("location");
  const router = useRouter();
  const [step, setStep] = useState<"role" | "profile">("role");
  const [role, setRole] = useState<Role>("trainee");
  const [ready, setReady] = useState(false);
  // Zalo không trả email, Facebook thì người dùng từ chối chia sẻ được. Không
  // có email thật thì PT sẽ KHÔNG nhận được thông báo lead nào — hỏi ngay ở đây
  // là chỗ rẻ nhất, muộn hơn thì họ đã bỏ đi vì tưởng nền tảng không có khách.
  const [needsEmail, setNeedsEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [price, setPrice] = useState("");
  const [city, setCity] = useState("");
  const [ward, setWard] = useState("");
  const [gymName, setGymName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const user = getUser();
    if (!user) {
      router.replace("/login");
      return;
    }
    // Chọn sẵn đúng vai trò tài khoản đang có: phần lớn người đã chọn đúng ở
    // trang đăng ký, với họ đây chỉ là một chạm xác nhận.
    setRole(user.role === "pt" ? "pt" : "trainee");
    setNeedsEmail(Boolean(user.needs_email));
    setReady(true);
  }, [router]);

  async function confirmRole() {
    setError("");
    if (role === "trainee") {
      // Đang là PT mà chọn học viên: không tự hạ vai trò ở đây. Hồ sơ, lead và
      // đánh giá đã gắn với tài khoản PT, hạ xuống là làm mồ côi hết — hiếm và
      // cần người xử lý, không đáng để tự động hoá.
      router.replace("/account/favorites");
      return;
    }

    setSubmitting(true);
    try {
      if (getUser()?.role !== "pt") {
        const data = await apiFetch<AuthResponse>("/api/auth/become-pt", {
          method: "POST",
          auth: true,
          body: JSON.stringify({}),
        });
        // Token cũ mang role "trainee"; không lưu token mới thì mọi lời gọi
        // tiếp theo của PT đều bị từ chối.
        saveAuth(data.access_token, data.refresh_token, data.user);
      }
      setStep("profile");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("errBecomePT"));
    } finally {
      setSubmitting(false);
    }
  }

  async function saveProfile() {
    setError("");
    if (needsEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t("errEmail"));
      return;
    }
    const priceNumber = parseInt(price.replace(/\D/g, ""), 10);
    if (!priceNumber || priceNumber <= 0) {
      setError(t("errPrice"));
      return;
    }
    if (!city) {
      setError(t("errCity"));
      return;
    }

    setSubmitting(true);
    try {
      // Email trước: nếu bước này hỏng thì dừng lại luôn, đừng lưu hồ sơ rồi để
      // PT tưởng đã xong trong khi vẫn không nhận được thông báo nào.
      if (needsEmail) {
        const updated = await apiFetch<AuthResponse>("/api/auth/set-email", {
          method: "POST",
          auth: true,
          body: JSON.stringify({ email: email.trim().toLowerCase() }),
        });
        saveAuth(updated.access_token, updated.refresh_token, updated.user);
        setNeedsEmail(false);
      }
      await apiFetch<PTProfile>("/api/pts/me", {
        method: "PUT",
        auth: true,
        body: JSON.stringify({ pricing: { per_session: priceNumber } }),
      });
      await apiFetch("/api/pts/me/locations", {
        method: "POST",
        auth: true,
        body: JSON.stringify({ gym_name: gymName.trim(), ward, city }),
      });
      router.replace("/dashboard/profile");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("errSave"));
      setSubmitting(false);
    }
  }

  if (!ready) {
    return <div className="card h-64 animate-pulse bg-slate-100" />;
  }

  if (step === "role") {
    return (
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-slate-900">{t("heading")}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("subtitle")}
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {(
            [
              { value: "trainee" as Role, label: t("roleTrainee"), desc: t("roleTraineeDesc") },
              { value: "pt" as Role, label: t("rolePT"), desc: t("rolePTDesc") },
            ]
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setRole(opt.value)}
              aria-pressed={role === opt.value}
              className={`rounded-xl border-2 p-4 text-left transition-all ${
                role === opt.value
                  ? "border-emerald-500 bg-emerald-50 shadow-sm ring-2 ring-emerald-500/20"
                  : "border-slate-200 hover:border-emerald-300"
              }`}
            >
              <p className="font-semibold text-slate-900">{opt.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{opt.desc}</p>
            </button>
          ))}
        </div>

        {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}

        <button
          onClick={confirmRole}
          disabled={submitting}
          className="btn-primary mt-6 w-full"
        >
          {submitting ? t("processing") : t("continue")}
        </button>
      </div>
    );
  }

  return (
    <div className="card p-6 sm:p-8">
      <h1 className="text-2xl font-bold text-slate-900">{t("profileHeading")}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {t("profileSubtitle")}
      </p>

      <div className="mt-6 space-y-4">
        {needsEmail && (
          <div>
            <label className="label" htmlFor="welcome-email">{t("emailLabel")}</label>
            <input
              id="welcome-email"
              className="input"
              type="email"
              autoComplete="email"
              placeholder={t("emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-400">{t("emailNote")}</p>
          </div>
        )}
        <div>
          <label className="label" htmlFor="welcome-price">{t("priceLabel")}</label>
          <input
            id="welcome-price"
            className="input"
            type="text"
            inputMode="numeric"
            placeholder={PRICE_PLACEHOLDER}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <p className="mt-1 text-xs text-slate-400">
            {t("priceNote")}
          </p>
        </div>

        <div>
          <LocationSelect
            cityValue={city}
            wardValue={ward}
            onCityChange={(v) => {
              setCity(v);
              setWard("");
            }}
            onWardChange={setWard}
          />
          <p className="mt-1 text-xs text-slate-400">{tLoc("coverageNote")}</p>
        </div>

        <div>
          <label className="label" htmlFor="welcome-gym">{t("gymLabel")}</label>
          <input
            id="welcome-gym"
            className="input"
            placeholder={t("gymPlaceholder")}
            value={gymName}
            onChange={(e) => setGymName(e.target.value)}
          />
          <p className="mt-1 text-xs text-slate-400">{t("gymNote")}</p>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <button onClick={saveProfile} disabled={submitting} className="btn-primary w-full">
          {submitting ? t("saving") : t("finish")}
        </button>
      </div>
    </div>
  );
}
