import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { cache } from "react";
import ActivitySignals from "@/components/ActivitySignals";
import Avatar from "@/components/Avatar";
import FavoriteButton from "@/components/FavoriteButton";
import LeadForm from "@/components/LeadForm";
import { LightboxImageButton } from "@/components/Lightbox";
import MobileLeadCTA from "@/components/MobileLeadCTA";
import PortfolioGallery from "@/components/PortfolioGallery";
import ProfileViewBeacon from "@/components/ProfileViewBeacon";
import RatingStars from "@/components/RatingStars";
import ReviewSection from "@/components/ReviewSection";
import { ApiError, apiFetch } from "@/lib/api";
import { genderLabel, specialtyLabel } from "@/lib/constants";
import { formatVND } from "@/lib/format";
import { jsonLdScript } from "@/lib/site";
import type { Paginated, PTProfile, Review } from "@/lib/types";

/**
 * Profile pages are the SEO surface and change rarely — serve them from the
 * cache and refresh in the background. View counting happens client-side
 * (ProfileViewBeacon) precisely because this HTML gets reused.
 */
export const revalidate = 300;

const getProfile = cache(async (slug: string): Promise<PTProfile | null> => {
  try {
    return await apiFetch<PTProfile>(`/api/pts/${encodeURIComponent(slug)}`, {
      cache: "force-cache",
      next: { revalidate: 300 },
    });
  } catch (err) {
    // Only a genuine 404 means "no such PT". Anything else (backend down,
    // network) must bubble up, or we would cache a 404 for a live profile.
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
});

/** Số đánh giá render sẵn trong HTML. Khớp `pageSize` của ReviewSection để
 *  trang đầu không bị tải lại ngay sau khi hydrate. */
const SSR_REVIEW_COUNT = 5;

/**
 * Lấy trang đánh giá đầu tiên NGAY TRÊN SERVER.
 *
 * Trước đây toàn bộ phần đánh giá do client tự fetch sau khi hydrate, nghĩa là
 * nội dung giàu nhất của trang không có trong HTML nguồn. Googlebot có chạy JS
 * (dù trễ), nhưng phần lớn crawler của engine sinh nội dung thì gần như không —
 * với chúng, mọi đánh giá coi như không tồn tại. Đây cũng là điều kiện để đánh
 * giá xuất hiện được trong JSON-LD: markup review phải khớp nội dung NHÌN THẤY
 * trên trang, nếu không thì đúng định nghĩa spam.
 *
 * Không bao giờ ném lỗi: đánh giá tải hỏng không được làm sập cả trang hồ sơ.
 */
const getReviews = cache(async (slug: string): Promise<Review[]> => {
  try {
    const data = await apiFetch<Paginated<Review>>(
      `/api/pts/${encodeURIComponent(slug)}/reviews?page=1&page_size=${SSR_REVIEW_COUNT}`,
      { cache: "force-cache", next: { revalidate: 300 } }
    );
    return data.items ?? [];
  } catch {
    return [];
  }
});

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await props.params;
  const profile = await getProfile(slug);
  if (!profile) notFound();
  const t = await getTranslations("ptProfile");
  const specialties = (profile.specialties ?? []).map(specialtyLabel).join(", ");
  const location = profile.locations?.[0];
  const place = location ? [location.ward, location.city].filter(Boolean).join(", ") : "";
  const description = t("metaDescription", {
    name: profile.full_name,
    specialtyPart: specialties ? t("metaSpecialty", { list: specialties }) : "",
    locationPart: place ? t("metaLocation", { place }) : "",
    experiencePart: profile.experience_years
      ? t("metaExperience", { years: profile.experience_years })
      : "",
  });
  const canonical = `/pt/${profile.slug}`;
  return {
    title: t("metaTitle", { name: profile.full_name }),
    description,
    alternates: { canonical },
    openGraph: {
      title: t("ogTitle", { name: profile.full_name }),
      description,
      type: "profile",
      siteName: "PTMatch",
      locale: "vi_VN",
      url: canonical,
      ...(profile.avatar_url ? { images: [{ url: profile.avatar_url }] } : {}),
    },
  };
}

/**
 * JSON-LD cho hồ sơ PT.
 *
 * `LocalBusiness`, KHÔNG phải `Person` như bản đầu. Lý do rất cụ thể: Google chỉ
 * hiện sao (review snippet) cho một tập type nhất định, và `Person` không nằm
 * trong đó — nên `aggregateRating` gắn vào `Person` là markup đúng cú pháp mà
 * không bao giờ ra kết quả. `LocalBusiness` thì nằm trong tập đó.
 *
 * Đánh đổi đã biết: PT là người, không phải doanh nghiệp, và ta chỉ có
 * phường/xã chứ không có số nhà nên `address` là địa chỉ một phần. Đổi lại là
 * hồ sơ có cơ hội hiện sao — mà "trang cá nhân chuẩn SEO" chính là thứ
 * /for-trainers đang bán cho PT, nên đây không phải tối ưu suông.
 *
 * `review` chỉ nhận những đánh giá THẬT SỰ render trên trang (đã SSR). Markup
 * nhiều hơn nội dung nhìn thấy là vi phạm chính sách structured data.
 */
function buildJsonLd(profile: PTProfile, reviews: Review[]) {
  const location = profile.locations?.[0];
  const perSession = profile.pricing?.per_session;

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: profile.full_name,
    description: profile.bio || undefined,
    image: profile.avatar_url || undefined,
    knowsAbout: (profile.specialties ?? []).map(specialtyLabel),
    ...(location
      ? {
          address: {
            "@type": "PostalAddress",
            addressLocality: location.ward,
            addressRegion: location.city,
            addressCountry: "VN",
          },
          ...(location.gym_name
            ? {
                containedInPlace: { "@type": "Place", name: location.gym_name },
              }
            : {}),
        }
      : {}),
    // priceRange là chuỗi tự do theo schema.org; makesOffer mới là giá có cấu
    // trúc. Khai cả hai vì hai bên đọc khác nhau.
    ...(perSession
      ? {
          priceRange: `${perSession.toLocaleString("vi-VN")}₫`,
          makesOffer: {
            "@type": "Offer",
            price: perSession,
            priceCurrency: "VND",
            itemOffered: {
              "@type": "Service",
              name: "Personal Training",
              serviceType: (profile.specialties ?? []).map(specialtyLabel).join(", ") || undefined,
            },
          },
        }
      : {}),
    ...(profile.review_count && profile.review_count > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: profile.avg_rating ?? 0,
            reviewCount: profile.review_count,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
    ...(reviews.length > 0
      ? {
          review: reviews.map((r) => ({
            "@type": "Review",
            author: { "@type": "Person", name: r.reviewer_name },
            reviewRating: {
              "@type": "Rating",
              ratingValue: r.rating,
              bestRating: 5,
              worstRating: 1,
            },
            ...(r.content ? { reviewBody: r.content } : {}),
            ...(r.created_at ? { datePublished: r.created_at.slice(0, 10) } : {}),
          })),
        }
      : {}),
  };
  return jsonLd;
}

const SOCIAL_META: { key: keyof NonNullable<PTProfile["social_links"]>; label: string }[] = [
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "TikTok" },
  { key: "zalo", label: "Zalo" },
];

const PRICING_ROWS: { key: "per_session" | "package_12" | "package_24" | "package_36"; labelKey: string; sessions?: number }[] = [
  { key: "per_session", labelKey: "perSession" },
  { key: "package_12", labelKey: "package12", sessions: 12 },
  { key: "package_24", labelKey: "package24", sessions: 24 },
  { key: "package_36", labelKey: "package36", sessions: 36 },
];

/**
 * Số tiền tiết kiệm khi mua gói so với mua lẻ từng buổi.
 *
 * Trả 0 (ẩn nhãn) khi PT chưa nhập giá theo buổi, khi hàng này không phải gói,
 * hoặc khi gói không rẻ hơn mua lẻ — không bao giờ hiện "tiết kiệm" số âm.
 */
function packageSavings(
  perSession: number | null | undefined,
  packagePrice: number | null | undefined,
  sessions?: number
): number {
  if (!perSession || !packagePrice || !sessions) return 0;
  return Math.max(0, perSession * sessions - packagePrice);
}

export default async function PTProfilePage(props: { params: Promise<{ slug: string }> }) {
  const t = await getTranslations("ptProfile");
  const { slug } = await props.params;
  const profile = await getProfile(slug);
  if (!profile) notFound();
  const reviews = await getReviews(slug);

  const location = profile.locations?.[0];
  const pricing = profile.pricing ?? {};
  const certifications = profile.certifications ?? [];
  const specialties = profile.specialties ?? [];
  const socials = profile.social_links ?? {};
  const portfolio = profile.portfolio_items ?? [];
  const pricingRows = PRICING_ROWS.filter((row) => pricing[row.key]);

  return (
    <div>
      <ProfileViewBeacon slug={profile.slug} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(buildJsonLd(profile, reviews)) }}
      />

      {/* Header */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <Avatar src={profile.avatar_url} name={profile.full_name} size={96} className="ring-4 ring-emerald-50" />
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">{profile.full_name}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                <RatingStars rating={profile.avg_rating} count={profile.review_count} />
                {profile.gender && <span>{genderLabel(profile.gender)}</span>}
                {profile.age ? <span>{t("age", { age: profile.age })}</span> : null}
                {profile.experience_years ? (
                  <span className="font-medium text-emerald-700">{t("experience", { years: profile.experience_years })}</span>
                ) : null}
              </div>
              {location && (
                <p className="mt-1.5 flex items-center gap-1 text-sm text-slate-500">
                  <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                  </svg>
                  {[location.gym_name, location.ward, location.city].filter(Boolean).join(" · ")}
                </p>
              )}
              {specialties.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {specialties.map((s) => (
                    <span key={s} className="badge">{specialtyLabel(s)}</span>
                  ))}
                </div>
              )}
              <ActivitySignals activity={profile.activity} />
            </div>
            <div className="flex flex-wrap gap-2 sm:flex-col sm:items-stretch">
              <FavoriteButton ptSlug={profile.slug} />
              {SOCIAL_META.filter((s) => socials[s.key]).map((s) => (
                <a
                  key={s.key}
                  href={socials[s.key] as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary px-3 py-1.5 text-xs"
                >
                  {s.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Body */}
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-10">
          {/* Bio */}
          {profile.bio && (
            <section>
              <h2 className="text-xl font-bold text-slate-900">{t("aboutHeading")}</h2>
              <p className="mt-3 whitespace-pre-line leading-relaxed text-slate-600">{profile.bio}</p>
            </section>
          )}

          {/* Chứng chỉ */}
          {certifications.length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-slate-900">{t("certHeading")}</h2>
              <ul className="mt-3 space-y-3">
                {certifications.map((rawCert, i) => {
                  const cert = typeof rawCert === "string" ? { name: rawCert } : rawCert;
                  return (
                    <li key={i} className="flex items-start gap-2 text-slate-600">
                      {/* Icon TÀI LIỆU trung tính, không phải dấu tích xanh.
                          Dấu tích xanh là ngôn ngữ hình ảnh của "đã xác thực",
                          trong khi đây là chữ PT tự khai và điều khoản sử dụng
                          nói rõ PTMatch KHÔNG xác minh chứng chỉ. Ảnh chứng chỉ
                          kèm bên dưới (nếu có) là bằng chứng người xem tự đánh
                          giá — hệ thống không đứng ra bảo đảm.
                          (ListingChecklist vẫn dùng dấu tích xanh, và ở đó thì
                          đúng: nó báo một trạng thái hệ thống thật biết.) */}
                      <svg className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <div>
                        <span>{cert.name}</span>
                        {cert.image_url && (
                          <div className="mt-1.5">
                            <LightboxImageButton
                              src={cert.image_url}
                              alt={cert.name}
                              caption={cert.name}
                              className="h-24 rounded-lg border border-slate-200 object-cover"
                            />
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* Bảng giá — chỉ những gói PT thực sự có.
              Trước đây luôn dựng đủ bốn thẻ, nên PT chưa nhập gói nào thì hồ sơ
              hiện một hàng bốn ô "—": trông như trang hỏng đúng chỗ người xem
              đang cân nhắc trả tiền. */}
          {pricingRows.length > 0 && (
          <section>
            <h2 className="text-xl font-bold text-slate-900">{t("pricingHeading")}</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {pricingRows.map((row) => {
                const value = pricing[row.key];
                const savings = packageSavings(pricing.per_session, value, row.sessions);
                return (
                  <div key={row.key} className="card p-4 text-center">
                    <p className="text-sm font-medium text-slate-500">{t(row.labelKey)}</p>
                    <p className="mt-1 text-lg font-bold text-emerald-600">{formatVND(value)}</p>
                    {row.sessions && value ? (
                      // Dùng "≈" kèm khoảng trắng: dấu "~" ở cỡ chữ nhỏ trông
                      // như dấu trừ, khiến giá mỗi buổi bị đọc thành số âm.
                      <p className="mt-0.5 text-xs text-slate-400">{t("perSessionApprox", { price: formatVND(Math.round(value / row.sessions)) })}</p>
                    ) : null}
                    {savings ? (
                      // Tách thành nhãn riêng thay vì nối vào dòng "…đ/buổi",
                      // để số tiền tiết kiệm không bị đọc nhầm là theo buổi.
                      <p className="mt-1.5 inline-block rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        {t("savings", { amount: formatVND(savings) })}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
          )}

          {/* Khu vực hoạt động */}
          {(profile.locations?.length ?? 0) > 1 && (
            <section>
              <h2 className="text-xl font-bold text-slate-900">{t("locationsHeading")}</h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {profile.locations!.map((loc, i) => (
                  <li key={loc.id ?? i} className="card flex items-center gap-2 p-3 text-sm text-slate-600">
                    <svg className="h-4 w-4 shrink-0 text-emerald-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                    </svg>
                    {[loc.gym_name, loc.ward, loc.city].filter(Boolean).join(" · ")}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Portfolio */}
          {portfolio.length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-slate-900">{t("portfolioHeading")}</h2>
              <div className="mt-3">
                <PortfolioGallery items={portfolio} />
              </div>
            </section>
          )}

          {/* Reviews */}
          <section>
            <ReviewSection
              slug={profile.slug}
              ptName={profile.full_name}
              initialReviews={reviews}
              initialTotal={profile.review_count ?? 0}
            />
          </section>
        </div>

        {/* Lead form sticky */}
        <aside>
          <div id="lead-form" className="scroll-mt-20 lg:sticky lg:top-20">
            <LeadForm ptSlug={profile.slug} ptName={profile.full_name} />
          </div>
        </aside>
      </div>

      <MobileLeadCTA
        ptSlug={profile.slug}
        ptName={profile.full_name}
        pricePerSession={pricing.per_session}
        targetId="lead-form"
      />
    </div>
  );
}
