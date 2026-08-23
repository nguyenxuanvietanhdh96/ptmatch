/**
 * Public origin of the site, for absolute URLs in sitemap.xml / robots.txt.
 *
 * Read as a plain (non NEXT_PUBLIC_) variable on purpose: both callers are
 * server-only, and NEXT_PUBLIC_* values are inlined at build time, which would
 * mean rebuilding the image just to change the domain.
 */
export function siteUrl(): string {
  const raw = process.env.SITE_URL || "https://ptmatch.vn";
  return raw.replace(/\/+$/, "");
}

/**
 * Serialise dữ liệu thành chuỗi an toàn để nhúng vào <script type="application/ld+json">.
 *
 * JSON.stringify KHÔNG escape "</script>", nên nhúng thẳng kết quả của nó là lỗ
 * hổng XSS lưu trữ: JSON-LD của hồ sơ PT chứa bio/tên/tên phòng gym do chính PT
 * nhập, chỉ cần một chuỗi "</script><script>..." là chạy được JS trên trình
 * duyệt của mọi khách xem hồ sơ đó.
 *
 * Escape "<" thành < (hợp lệ trong JSON, parser đọc ra đúng ký tự gốc)
 * là đủ chặn mọi cách đóng thẻ script sớm. Escape thêm U+2028/U+2029 vì chúng
 * hợp lệ trong JSON nhưng là ký tự xuống dòng trong JavaScript.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
