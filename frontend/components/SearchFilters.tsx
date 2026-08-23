"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import LocationSelect from "@/components/LocationSelect";
import { PRICE_OPTIONS, SORT_OPTIONS, SPECIALTIES } from "@/lib/constants";
import { useTranslations } from "next-intl";

interface SearchFiltersProps {
  filters: {
    q: string;
    gender: string;
    specialty: string;
    city: string;
    ward: string;
    price_min: string;
    price_max: string;
    experience_min: string;
    sort: string;
  };
}

export default function SearchFilters({ filters }: SearchFiltersProps) {
  const t = useTranslations("filters");
  const router = useRouter();
  const [applying, startTransition] = useTransition();

  /**
   * Điều hướng phía client thay cho submit native.
   *
   * `method="GET" action="/pts"` vẫn giữ nguyên bên dưới làm đường dự phòng khi
   * không có JS, nhưng khi có JS thì submit native là một lần tải lại cả tài
   * liệu: màn hình loé trắng, mất luôn vị trí cuộn, và tải lại toàn bộ JS/CSS
   * chỉ để đổi một tham số lọc. Đó chính là cái giật rõ nhất trên trang này.
   *
   * Đi qua router thì chỉ vùng kết quả được thay (xem Suspense trong
   * app/(public)/pts/page.tsx), và `applying` cho biết nút đã ăn.
   */
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const params = new URLSearchParams();
    for (const [name, value] of new FormData(event.currentTarget).entries()) {
      // Bỏ ô trống: form GET native gửi cả `q=&gender=&price_min=` — URL dài vô
      // ích, và mỗi tổ hợp rỗng khác nhau lại là một khoá cache khác ở tầng CDN.
      const text = typeof value === "string" ? value.trim() : "";
      if (text) params.set(name, text);
    }

    const query = params.toString();
    startTransition(() => {
      // Không giữ `page`: đổi bộ lọc xong mà còn ở trang 5 thì rất dễ ra danh
      // sách rỗng, người dùng tưởng không có PT nào khớp.
      router.push(query ? `/pts?${query}` : "/pts");
    });
  }

  return (
    <form method="GET" action="/pts" onSubmit={handleSubmit} className="card space-y-4 p-4">
      <div>
        <label className="label" htmlFor="f-q">{t("keyword")}</label>
        <input id="f-q" name="q" className="input" placeholder={t("keywordPlaceholder")} defaultValue={filters.q} />
      </div>
      <div>
        <label className="label" htmlFor="f-gender">{t("gender")}</label>
        <select id="f-gender" name="gender" className="input" defaultValue={filters.gender}>
          <option value="">{t("all")}</option>
          <option value="male">{t("male")}</option>
          <option value="female">{t("female")}</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="f-specialty">{t("specialty")}</label>
        <select id="f-specialty" name="specialty" className="input" defaultValue={filters.specialty}>
          <option value="">{t("all")}</option>
          {SPECIALTIES.map((s) => (
            <option key={s.slug} value={s.slug}>{s.label}</option>
          ))}
        </select>
      </div>
      <LocationSelect cityValue={filters.city} wardValue={filters.ward} />
      <div>
        <span className="label">{t("priceRange")}</span>
        <div className="grid grid-cols-2 gap-2">
          <select name="price_min" className="input" defaultValue={filters.price_min} aria-label={t("priceFromLabel")}>
            <option value="">{t("from")}</option>
            {PRICE_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <select name="price_max" className="input" defaultValue={filters.price_max} aria-label={t("priceToLabel")}>
            <option value="">{t("to")}</option>
            {PRICE_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="f-exp">{t("minExperience")}</label>
        <select id="f-exp" name="experience_min" className="input" defaultValue={filters.experience_min}>
          <option value="">{t("all")}</option>
          <option value="1">{t("exp1")}</option>
          <option value="3">{t("exp3")}</option>
          <option value="5">{t("exp5")}</option>
          <option value="10">{t("exp10")}</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="f-sort">{t("sort")}</label>
        <select id="f-sort" name="sort" className="input" defaultValue={filters.sort}>
          <option value="">{t("sortDefault")}</option>
          {SORT_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2 pt-1">
        <button type="submit" className="btn-primary flex-1" disabled={applying}>
          {applying ? t("applying") : t("apply")}
        </button>
        <Link href="/pts" className="btn-secondary">{t("clear")}</Link>
      </div>
    </form>
  );
}
