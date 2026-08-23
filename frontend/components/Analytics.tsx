"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Script from "next/script";
import { Suspense, useEffect, useRef } from "react";
import { FB_PIXEL_ID, GA_ID, GTM_ID, PLAUSIBLE_DOMAIN } from "@/lib/analytics";

/**
 * Bắn PageView của Facebook Pixel cho mỗi lần điều hướng phía client.
 *
 * Đoạn khởi tạo pixel chỉ chạy `fbq('track','PageView')` đúng một lần lúc tải
 * trang. App Router điều hướng không tải lại trang, nên mọi bước sau đó —
 * trang chủ vào /pts, /pts vào hồ sơ PT — đều không được đếm. Với chiến dịch
 * quảng cáo Facebook, đó là đếm hụt lượt xem trên chính những trang mà tiền
 * quảng cáo dẫn tới, và số liệu tối ưu hoá bị lệch theo.
 *
 * GA4 tự xử lý việc này qua "enhanced measurement", fbq thì không.
 */
function FacebookPixelPageViews() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Bỏ qua lần chạy đầu: script khởi tạo đã bắn PageView cho trang đó rồi.
  const initialLoad = useRef(true);

  useEffect(() => {
    if (initialLoad.current) {
      initialLoad.current = false;
      return;
    }
    const fbq = (window as unknown as { fbq?: (...args: unknown[]) => void }).fbq;
    fbq?.("track", "PageView");
  }, [pathname, searchParams]);

  return null;
}

/**
 * Nạp script đo lường cho nhà cung cấp nào đã cấu hình.
 *
 * Bắt buộc là client component: Next chỉ nhúng NEXT_PUBLIC_* vào bundle trình
 * duyệt lúc build. Nếu để đây là server component, giá trị sẽ được đọc từ
 * process.env lúc chạy — khi đó frontend/.env.production không có tác dụng và
 * server production phải tự có sẵn biến môi trường.
 *
 * Không đặt biến môi trường thì không có script nào được nạp — dev và preview
 * do đó không làm bẩn số liệu production.
 *
 * Đặt NEXT_PUBLIC_GTM_ID để chuyển sang quản lý thẻ bằng GTM; khi đó GA4 trực
 * tiếp tự tắt (xem lib/analytics.ts) nên không bị đếm hai lần.
 */
export default function Analytics() {
  return (
    <>
      {GTM_ID && (
        <Script id="gtm" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`}
        </Script>
      )}

      {/* Nhánh dự phòng khi trình duyệt tắt JavaScript — GTM chuẩn có phần này. */}
      {GTM_ID && (
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
            title="Google Tag Manager"
          />
        </noscript>
      )}

      {GA_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="afterInteractive"
          />
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
          </Script>
        </>
      )}

      {PLAUSIBLE_DOMAIN && (
        <>
          <Script
            defer
            data-domain={PLAUSIBLE_DOMAIN}
            src="https://plausible.io/js/script.js"
            strategy="afterInteractive"
          />
          {/* Hàng đợi để sự kiện tuỳ chỉnh bắn trước khi script tải xong không bị mất. */}
          <Script id="plausible-init" strategy="afterInteractive">
            {`window.plausible = window.plausible || function() { (window.plausible.q = window.plausible.q || []).push(arguments) }`}
          </Script>
        </>
      )}

      {FB_PIXEL_ID && (
        <Script id="fb-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${FB_PIXEL_ID}');
fbq('track', 'PageView');`}
        </Script>
      )}

      {/* useSearchParams cần Suspense, nếu không cả trang bị đẩy sang dựng động. */}
      {FB_PIXEL_ID && (
        <Suspense fallback={null}>
          <FacebookPixelPageViews />
        </Suspense>
      )}
    </>
  );
}
