import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { CONTACT_EMAIL, LEGAL_UPDATED_AT } from "@/lib/contact";

/**
 * Chính sách bảo mật.
 *
 * Không phải thủ tục cho có: site thu số điện thoại của người thật rồi chuyển
 * cho bên thứ ba (PT), và bắn sự kiện chuyển đổi về Facebook/Google. Cả hai
 * việc đó đều phải được nói ra ở một trang công khai — đây cũng là thứ đầu tiên
 * bên duyệt quảng cáo tìm khi xét trang đích thu thập thông tin cá nhân.
 *
 * Viết theo đúng những gì hệ thống LÀM THẬT. Mỗi câu ở đây đều đối chiếu được
 * với code: xem app/api/leads.py (ai nhận số), app/api/requests.py (số chỉ lộ
 * sau khi PT nhận), components/Analytics.tsx (script đo lường nào được nạp).
 *
 * Nội dung nằm ở messages/<locale>.json — sửa câu chữ ở đó, không sửa ở đây.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("privacy");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: "/privacy" },
  };
}

/** Thẻ inline dùng chung cho mọi đoạn có chữ đậm/nghiêng trong catalog. */
const TAGS = {
  b: (chunks: React.ReactNode) => <strong className="text-slate-900">{chunks}</strong>,
  i: (chunks: React.ReactNode) => <em>{chunks}</em>,
};

export default async function PrivacyPage() {
  const t = await getTranslations("privacy");
  const email = (
    <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-emerald-600 hover:underline">
      {CONTACT_EMAIL}
    </a>
  );

  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold text-slate-900">{t("title")}</h1>
      <p className="mt-2 text-sm text-slate-500">{t("updated", { date: LEGAL_UPDATED_AT })}</p>

      <div className="mt-8 space-y-8 text-slate-600">
        <section>
          <h2 className="text-xl font-bold text-slate-900">{t("s1Heading")}</h2>
          {(["s1p1", "s1p2", "s1p3", "s1p4"] as const).map((k) => (
            <p key={k} className="mt-3 leading-relaxed">{t.rich(k, TAGS)}</p>
          ))}
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900">{t("s2Heading")}</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed">
            {(["s2li1", "s2li2", "s2li3", "s2li4"] as const).map((k) => (
              <li key={k}>{t.rich(k, TAGS)}</li>
            ))}
          </ul>
          <p className="mt-3 leading-relaxed">{t.rich("s2p", TAGS)}</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900">{t("s3Heading")}</h2>
          <p className="mt-3 leading-relaxed">{t("s3intro")}</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed">
            {(["s3li1", "s3li2", "s3li3", "s3li4"] as const).map((k) => (
              <li key={k}>{t.rich(k, TAGS)}</li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900">{t("s4Heading")}</h2>
          <p className="mt-3 leading-relaxed">{t("s4intro")}</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed">
            {(["s4li1", "s4li2", "s4li3"] as const).map((k) => (
              <li key={k}>{t.rich(k, TAGS)}</li>
            ))}
          </ul>
          <p className="mt-3 leading-relaxed">{t("s4p")}</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900">{t("s5Heading")}</h2>
          <p className="mt-3 leading-relaxed">{t("s5p")}</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900">{t("s6Heading")}</h2>
          <p className="mt-3 leading-relaxed">{t.rich("s6p1", { ...TAGS, email: () => email })}</p>
          <p className="mt-3 leading-relaxed">{t("s6p2")}</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900">{t("s7Heading")}</h2>
          <p className="mt-3 leading-relaxed">{t("s7p")}</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900">{t("s8Heading")}</h2>
          <p className="mt-3 leading-relaxed">
            {t.rich("s8p", {
              ...TAGS,
              email: () => email,
              termsLink: () => (
                <Link href="/terms" className="font-semibold text-emerald-600 hover:underline">
                  {t("termsLinkText")}
                </Link>
              ),
            })}
          </p>
        </section>
      </div>
    </article>
  );
}
