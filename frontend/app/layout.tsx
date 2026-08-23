import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import Analytics from "@/components/Analytics";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SiteChrome from "@/components/SiteChrome";
import { publicMessages, resolveLocale } from "@/i18n/config";
import { SERVED_PROVINCES } from "@/lib/constants";
import { jsonLdScript, siteUrl } from "@/lib/site";
import "./globals.css";

const beVietnam = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

// Không hứa "nhận học viên mới mỗi ngày": đây là mô tả dùng chung cho toàn site
// và cho mọi link chia sẻ, mà lượng học viên thì nằm ngoài tầm kiểm soát —
// cùng lý do đã gỡ lời hứa "liên hệ trong 24 giờ" khỏi trang chủ và LeadForm.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  const title = t("defaultTitle");
  const description = t("description");
  return {
    // metadataBase biến mọi đường dẫn tương đối trong openGraph/alternates thành
    // URL tuyệt đối. Thiếu nó, một avatar_url tương đối sẽ thành thẻ og:image hỏng
    // và link chia sẻ lên Facebook/Zalo hiện ô ảnh trắng.
    metadataBase: new URL(siteUrl()),
    title: { default: title, template: t("titleTemplate") },
    description,
    alternates: { canonical: "/" },
    // KHÔNG khai báo `icons` ở đây: Next đã tự chèn thẻ <link rel="icon"> cho
    // app/favicon.ico và app/icon.svg theo quy ước file. Khai báo thêm chỉ tạo
    // thẻ trùng trỏ về cùng một file.
    openGraph: {
      type: "website",
      siteName: "PTMatch",
      locale: "vi_VN",
      title,
      description,
      url: "/",
    },
  };
}

/**
 * Định nghĩa thực thể "PTMatch" cho máy đọc.
 *
 * Vì sao cần, ngoài SEO: khi PT nghe tên PTMatch trong group Facebook, việc đầu
 * tiên nhiều người làm là đi hỏi một engine sinh nội dung ("PTMatch có thu phí
 * không?"). Không có mô tả canonical nào để dẫn thì engine trả lời "không tìm
 * thấy thông tin" — với người đang cân nhắc đăng ký, câu đó đọc ra là "app lạ,
 * đáng ngờ". Tệ hơn là nó đoán bừa một mức hoa hồng, tức phủ định đúng lời hứa
 * bán hàng chính. Đây là phòng thủ thương hiệu, không phải kênh thu hút.
 *
 * `areaServed` là tuyên bố CÓ THẬT, lấy từ cùng một nguồn với ô chọn khu vực
 * (SERVED_PROVINCES) — không phải câu quảng cáo "toàn quốc".
 */
function organizationJsonLd(description: string) {
  const base = siteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "PTMatch",
    url: base,
    description,
    areaServed: SERVED_PROVINCES.map((name) => ({
      "@type": "AdministrativeArea",
      name,
      addressCountry: "VN",
    })),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = resolveLocale();
  const tMeta = await getTranslations("meta");
  // Chỉ gửi xuống trình duyệt phần client thật sự dùng — xem CLIENT_NAMESPACES.
  // Gửi cả catalog nghĩa là mỗi trang cõng thêm toàn văn chính sách bảo mật,
  // điều khoản và mọi chuỗi của dashboard.
  const messages = publicMessages(await getMessages());

  return (
    <html lang={locale} className={beVietnam.variable}>
      <body className="flex min-h-screen flex-col font-sans">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdScript(organizationJsonLd(tMeta("orgDescription"))),
          }}
        />
        <NextIntlClientProvider locale={locale} messages={messages}>
        {/* Khu /admin không dùng khung giao diện của site — xem SiteChrome. */}
        <SiteChrome>
          <Navbar />
        </SiteChrome>
        <main className="flex-1">{children}</main>
        <SiteChrome>
          <Footer />
        </SiteChrome>
        <Analytics />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
