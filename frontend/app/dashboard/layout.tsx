import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import DashboardShell from "@/components/DashboardShell";
import { authMessages, resolveLocale } from "@/i18n/config";

/**
 * Layout server chỉ làm một việc: cấp bộ chuỗi của khu vực sau đăng nhập.
 *
 * Provider ở gốc cố tình KHÔNG gửi những namespace này xuống trang công khai —
 * người xem trang chủ không cần chuỗi của dashboard. Provider lồng ở đây thay
 * thế context của gốc, nên `authMessages()` phải trả về cả phần dùng chung.
 *
 * Vỏ giao diện nằm ở components/DashboardShell.tsx vì nó là client component
 * (đọc trạng thái đăng nhập, `usePathname`).
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const locale = resolveLocale();
  const messages = authMessages(await getMessages());

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <DashboardShell>{children}</DashboardShell>
    </NextIntlClientProvider>
  );
}
