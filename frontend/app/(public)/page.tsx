import Image from "next/image";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import HomeCTA from "@/components/HomeCTA";
import HomeRequests from "@/components/HomeRequests";
import PTCard from "@/components/PTCard";
import QuickMatchForm from "@/components/QuickMatchForm";
import { apiFetch } from "@/lib/api";
import type { Paginated, PTSummary } from "@/lib/types";

/**
 * Trang chủ dựng sẵn, làm mới mỗi 60 giây.
 *
 * Trước đây để `force-dynamic`: mỗi lượt vào trang đích có lưu lượng cao nhất
 * đều gọi backend hai lần và dựng lại toàn bộ HTML. Danh sách PT nổi bật và
 * bảng yêu cầu không đổi theo từng giây, nên 60 giây là quá đủ tươi — đổi lại
 * là backend trục trặc cũng không làm chậm người vào trang.
 */
export const revalidate = 60;

async function getFeaturedPTs(): Promise<PTSummary[]> {
  try {
    const data = await apiFetch<Paginated<PTSummary>>("/api/pts?sort=rating&page_size=6", {
      // apiFetch mặc định no-store; phải tự chọn ISR thì trang mới dựng sẵn được.
      cache: "force-cache",
      next: { revalidate: 60 },
    });
    return data.items ?? [];
  } catch {
    return [];
  }
}

// Chỉ icon nằm ở đây; tiêu đề và mô tả lấy từ catalog theo `key`.
const STEPS = [
  {
    key: "step1",
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197M15.803 15.803A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>
    ),
  },
  {
    key: "step2",
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
      </svg>
    ),
  },
  {
    // Không hứa mốc thời gian phản hồi ("trong vòng 24 giờ" trước đây): PT có
    // gọi hay không nằm ngoài tầm kiểm soát của nền tảng, và chưa có số liệu
    // nào chống lưng cho con số đó. LeadForm cũng đã bỏ vì cùng lý do.
    key: "step3",
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
  },
];

export default async function HomePage() {
  const t = await getTranslations("home");
  const featured = await getFeaturedPTs();

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden px-4 pb-20 pt-16 sm:px-6 sm:pt-24">
        {/* Background image + dark overlay */}
        {/*
          next/image thay cho CSS background-image: đây là phần tử LCP của
          trang chủ, mà ảnh nền trong style thì trình duyệt chỉ biết đến sau khi
          tải xong CSS, và không có bản nhỏ cho điện thoại. `priority` cho phép
          preload ngay, `sizes="100vw"` để máy 4G nhận ảnh vừa màn hình thay vì
          bản 1920px.
        */}
        <Image
          src="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1920&q=80"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/95 via-slate-900/85 to-emerald-950/85" />

        <div className="relative z-10 mx-auto max-w-4xl text-center">
          <p className="badge mb-4 bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20">{t("badge")}</p>
          <h1 className="text-3xl font-extrabold leading-tight text-white drop-shadow-sm sm:text-5xl">
            {t.rich("heroTitle", {
              em: (chunks) => <span className="text-emerald-400">{chunks}</span>,
            })}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-200 sm:text-lg">
            {t("heroSubtitle")}
          </p>
          <div className="mt-8">
            <QuickMatchForm />
          </div>
        </div>
      </section>

      {/* PT nổi bật */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{t("featuredHeading")}</h2>
            <p className="mt-1 text-sm text-slate-500">{t("featuredSubtitle")}</p>
          </div>
          <Link href="/pts" className="hidden text-sm font-semibold text-emerald-600 hover:text-emerald-700 sm:block">
            {t("viewAll")}
          </Link>
        </div>
        {featured.length > 0 ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((pt) => (
              <PTCard key={pt.id ?? pt.slug} pt={pt} />
            ))}
          </div>
        ) : (
          <div className="card mt-6 p-10 text-center text-slate-500">
            <p className="font-medium">{t("noPTTitle")}</p>
            <p className="mt-1 text-sm">
              {t("noPTBody")}{" "}
              <Link href="/pts" className="text-emerald-600 hover:underline">{t("noPTLink")}</Link>.
            </p>
          </div>
        )}
        <div className="mt-6 text-center sm:hidden">
          <Link href="/pts" className="btn-secondary">{t("viewAllMobile")}</Link>
        </div>
      </section>

      {/* Học viên đang tìm PT — khoe cầu để kéo cung.
          Đứng ngay sau "PT nổi bật", TRƯỚC "Cách hoạt động": ba thẻ hướng dẫn
          là bôi trơn chung chung, không đáng chiếm chỗ tốt hơn dữ liệu thật.

          Nhưng không đưa lên trên "PT nổi bật": đa số người vào trang chủ là học
          viên đến từ tìm kiếm, thứ họ cần thấy trước là PT có thật. Và nội dung
          block này mong manh — dưới MIN_ROWS là nó tự thành thẻ mời đăng, không
          nên để chỗ đắt nhất trang có thể rỗng. */}
      <HomeRequests />

      {/* Cách hoạt động */}
      <section className="bg-white py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="text-center text-2xl font-bold text-slate-900">{t("howHeading")}</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm text-slate-500">
            {t("howSubtitle")}
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <div key={step.key} className="card relative p-6">
                <span className="absolute right-5 top-5 text-4xl font-extrabold text-slate-100">{i + 1}</span>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  {step.icon}
                </div>
                <h3 className="mt-4 font-semibold text-slate-900">{t(`${step.key}Title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{t(`${step.key}Body`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA — dynamic based on auth state */}
      <HomeCTA />
    </div>
  );
}
