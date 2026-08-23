import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { CONTACT_EMAIL, LEGAL_UPDATED_AT } from "@/lib/contact";

/**
 * Điều khoản sử dụng.
 *
 * Điểm phải nói rõ nhất: PTMatch là nơi kết nối, không phải bên cung cấp dịch
 * vụ huấn luyện. Buổi tập diễn ra ngoài nền tảng, tiền trao tay trực tiếp giữa
 * hai bên — nếu trang này không nói ra thì mặc định người dùng sẽ coi chúng tôi
 * chịu trách nhiệm cho chất lượng và cho cả tai nạn khi tập.
 *
 * Nội dung nằm ở messages/<locale>.json — sửa câu chữ ở đó, không sửa ở đây.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("terms");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: "/terms" },
  };
}

const TAGS = {
  b: (chunks: React.ReactNode) => <strong className="text-slate-900">{chunks}</strong>,
  i: (chunks: React.ReactNode) => <em>{chunks}</em>,
};

export default async function TermsPage() {
  const t = await getTranslations("terms");
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
          <p className="mt-3 leading-relaxed">{t.rich("s1p1", TAGS)}</p>
          <p className="mt-3 leading-relaxed">{t("s1p2")}</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900">{t("s2Heading")}</h2>
          <p className="mt-3 leading-relaxed">{t("s2intro")}</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed">
            {(["s2li1", "s2li2", "s2li3", "s2li4"] as const).map((k) => (
              <li key={k}>{t.rich(k, TAGS)}</li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900">{t("s3Heading")}</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed">
            {(["s3li1", "s3li2", "s3li3", "s3li4"] as const).map((k) => (
              <li key={k}>{t.rich(k, TAGS)}</li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900">{t("s4Heading")}</h2>
          <p className="mt-3 leading-relaxed">{t("s4p")}</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900">{t("s5Heading")}</h2>
          <p className="mt-3 leading-relaxed">{t("s5p1")}</p>
          <p className="mt-3 leading-relaxed">{t("s5p2")}</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900">{t("s6Heading")}</h2>
          <p className="mt-3 leading-relaxed">{t("s6p")}</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900">{t("s7Heading")}</h2>
          <p className="mt-3 leading-relaxed">
            {t.rich("s7p", {
              ...TAGS,
              email: () => email,
              privacyLink: () => (
                <Link href="/privacy" className="font-semibold text-emerald-600 hover:underline">
                  {t("privacyLinkText")}
                </Link>
              ),
            })}
          </p>
        </section>
      </div>
    </article>
  );
}
