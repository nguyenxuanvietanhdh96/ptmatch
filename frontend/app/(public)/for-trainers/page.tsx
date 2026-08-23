import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { jsonLdScript } from "@/lib/site";

/**
 * Trang đích cho PT — nơi dán link vào bài post trong group Facebook.
 *
 * Trước đây không có trang nào trả lời "vì sao tôi nên tham gia": PT bấm link
 * từ group sẽ rơi vào trang chủ vốn viết cho học viên, hoặc thẳng vào form đăng
 * ký. Cả hai đều bắt người ta tự suy ra giá trị.
 *
 * NGUYÊN TẮC VIẾT Ở ĐÂY — đọc trước khi sửa:
 *
 * Không hứa có sẵn học viên. Chợ đang ở giai đoạn đầu, và PT là phía khó kiếm
 * nhất: hứa "có học viên đang chờ" rồi họ vào thấy trống là mất luôn, không có
 * lần thứ hai. Thứ bán được ngay hôm nay mà không cần chợ đông là **trang cá
 * nhân**: link sạch, chuẩn SEO, có bảng giá và đánh giá — thứ một bài post
 * Facebook trôi mất sau một ngày không giữ được.
 *
 * Phần nhận yêu cầu tư vấn nói như thứ đang lớn dần, không làm tiêu đề.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("forTrainers");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: "/for-trainers" },
  };
}

// Chỉ icon ở đây; tiêu đề/mô tả lấy từ catalog theo `key`.
const BENEFIT_KEYS = ["benefit1", "benefit2", "benefit3", "benefit4", "benefit5", "benefit6"] as const;

const BENEFIT_ICONS: Record<string, React.ReactNode> = {
  benefit1: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
  ),
  benefit2: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197M15.803 15.803A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
  ),
  benefit3: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M18 6.75h.008v.008H18V6.75z" />
  ),
  benefit4: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
  ),
  benefit5: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
  ),
  benefit6: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
  ),
};

const STEP_KEYS = ["step1", "step2", "step3"] as const;

const FAQ_KEYS = ["faq1", "faq2", "faq3", "faq4", "faq5", "faq6"] as const;

/**
 * 6 câu hỏi này dưới dạng máy trích xuất được.
 *
 * ĐỪNG kỳ vọng rich result FAQ của Google: từ 2023 Google gần như chỉ còn hiện
 * nó cho site cơ quan nhà nước / y tế. Giá trị thật ở đây là engine sinh nội
 * dung: đây đúng những câu một PT hỏi trước khi đăng ký ("miễn phí thật không",
 * "có ăn hoa hồng không", "có phải môi giới không"), và cặp Q/A có cấu trúc thì
 * dễ trích dẫn đúng nguyên văn hơn là đoạn văn xuôi.
 *
 * Nội dung lấy từ CÙNG catalog với phần hiển thị bên dưới — không viết lại. Hai
 * bản lệch nhau là markup nói khác trang, và đó là thứ Google coi là spam.
 */
function faqJsonLd(t: (key: string) => string) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_KEYS.map((key) => ({
      "@type": "Question",
      name: t(`${key}Q`),
      acceptedAnswer: { "@type": "Answer", text: t(`${key}A`) },
    })),
  };
}

export default async function ForTrainersPage() {
  const t = await getTranslations("forTrainers");
  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(faqJsonLd(t)) }}
      />
      {/* Hero */}
      <section className="bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950 px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="badge mb-4 bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20">
            {t("badge")}
          </p>
          <h1 className="text-3xl font-extrabold leading-tight text-white sm:text-5xl">
            {t.rich("heroTitle", {
              em: (chunks) => <span className="text-emerald-400">{chunks}</span>,
            })}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-300 sm:text-lg">
            {t("heroBody")}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/register?role=pt" className="btn bg-emerald-600 px-6 text-white hover:bg-emerald-500">
              {t("heroCta")}
            </Link>
            <Link href="/pts" className="btn border border-slate-600 px-6 text-slate-200 hover:bg-slate-800">
              {t("heroSample")}
            </Link>
          </div>
          <p className="mt-4 text-xs text-slate-400">{t("heroNote")}</p>
        </div>
      </section>

      {/*
        Đoạn định nghĩa thực thể — cố ý là văn xuôi thuần, không icon, không thẻ.
        Đặt NGAY SAU hero để crawler (và engine sinh nội dung) gặp sớm, vì phần
        hero là câu quảng cáo không dẫn được.
        Mỗi câu là một khẳng định kiểm chứng được, viết để trích nguyên văn:
        engine dẫn lại y nguyên, nên câu mơ hồ vừa không được dùng vừa dễ bị
        diễn giải sai thành điều ta không hứa. Xem forTrainers.aboutBody.
      */}
      <section className="mx-auto max-w-3xl px-4 pt-12 sm:px-6">
        <h2 className="text-xl font-bold text-slate-900">{t("aboutHeading")}</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{t("aboutBody")}</p>
      </section>

      {/* Lợi ích */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <h2 className="text-center text-2xl font-bold text-slate-900">{t("benefitsHeading")}</h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFIT_KEYS.map((key) => (
            <div key={key} className="card p-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  {BENEFIT_ICONS[key]}
                </svg>
              </div>
              <h3 className="mt-4 font-semibold text-slate-900">{t(`${key}Title`)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{t(`${key}Body`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Các bước */}
      <section className="bg-white py-14">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <h2 className="text-center text-2xl font-bold text-slate-900">{t("stepsHeading")}</h2>
          <ol className="mt-8 space-y-4">
            {STEP_KEYS.map((key, i) => (
              <li key={key} className="card flex items-start gap-4 p-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-semibold text-slate-900">{t(`${key}Title`)}</h3>
                  <p className="mt-1 text-sm text-slate-500">{t(`${key}Body`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Câu hỏi thường gặp */}
      <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <h2 className="text-center text-2xl font-bold text-slate-900">{t("faqHeading")}</h2>
        <div className="mt-8 space-y-3">
          {FAQ_KEYS.map((key) => (
            <details key={key} className="card group p-5">
              <summary className="flex cursor-pointer items-center justify-between gap-4 font-semibold text-slate-900 marker:content-['']">
                {t(`${key}Q`)}
                <svg
                  className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{t(`${key}A`)}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA cuối */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-700 px-6 py-12 text-center sm:px-12">
          <h2 className="text-2xl font-extrabold text-white sm:text-3xl">{t("ctaHeading")}</h2>
          <p className="mx-auto mt-3 max-w-xl text-emerald-50">
            {t("ctaBody")}
          </p>
          <Link
            href="/register?role=pt"
            className="btn mt-6 bg-white px-6 text-emerald-700 hover:bg-emerald-50"
          >
            {t("ctaButton")}
          </Link>
        </div>
      </section>
    </div>
  );
}
