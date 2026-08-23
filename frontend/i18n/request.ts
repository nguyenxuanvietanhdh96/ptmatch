import { getRequestConfig } from "next-intl/server";

import { resolveLocale } from "./config";

/**
 * next-intl gọi hàm này ở mỗi request phía server để biết dùng ngôn ngữ nào và
 * nạp bộ chuỗi tương ứng.
 *
 * `import()` động theo mã ngôn ngữ: khi có nhiều ngôn ngữ, mỗi request chỉ nạp
 * đúng file của nó chứ không gói tất cả vào một bundle.
 */
export default getRequestConfig(async () => {
  const locale = resolveLocale();
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    // Múi giờ cố định để định dạng ngày/giờ trên server và trên trình duyệt ra
    // cùng một kết quả — lệch nhau là hydration mismatch.
    timeZone: "Asia/Ho_Chi_Minh",
  };
});
