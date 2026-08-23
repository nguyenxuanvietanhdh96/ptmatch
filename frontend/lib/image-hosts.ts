/**
 * Các host được phép đi qua bộ tối ưu ảnh của Next (/_next/image).
 *
 * Nguồn sự thật DUY NHẤT: next.config.ts dựng `remotePatterns` từ danh sách
 * này, và các component ảnh dùng `isOptimisableSrc` để biết trước host nào
 * dùng được. Tách làm hai chỗ là kiểu lỗi vừa xảy ra: cấu hình khoá host lại
 * mà component vẫn vô tư đưa URL vào <Image>, và next/image NÉM LỖI khi gặp
 * host chưa khai báo — đủ để 500 cả trang chỉ vì một cái avatar.
 *
 * Không mở `hostname: "**"`: khi đó /_next/image thành proxy tải và resize ảnh
 * miễn phí cho bất kỳ ai, tốn băng thông và CPU của mình.
 */
export const OPTIMISABLE_IMAGE_HOSTS = [
  // Ảnh người dùng tải lên (GCS + CDN).
  { protocol: "https", hostname: "cdn.ptmatch.vn" },
  { protocol: "https", hostname: "cdn-dev.ptmatch.vn" },
  { protocol: "https", hostname: "storage.googleapis.com" },
  // Ảnh minh hoạ dùng trong dữ liệu seed/demo.
  { protocol: "https", hostname: "images.unsplash.com" },
  { protocol: "https", hostname: "picsum.photos" },
  // Dev: media do backend phục vụ tại chỗ.
  { protocol: "http", hostname: "localhost" },
  { protocol: "http", hostname: "127.0.0.1" },
  { protocol: "http", hostname: "backend" },
] as const;

const HOSTNAMES: ReadonlySet<string> = new Set<string>(
  OPTIMISABLE_IMAGE_HOSTS.map((h) => h.hostname)
);

/**
 * `src` có dùng được với next/image hay không.
 *
 * Trả false cho URL không phân giải được, scheme lạ (kể cả "javascript:"), và
 * host chưa khai báo — phía gọi khi đó phải hạ cấp một cách êm ái thay vì để
 * next/image ném lỗi.
 */
export function isOptimisableSrc(src: string): boolean {
  // Đường dẫn tương đối luôn nằm trên origin của mình.
  if (src.startsWith("/")) return !src.startsWith("//");
  try {
    const url = new URL(src);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    return HOSTNAMES.has(url.hostname);
  } catch {
    return false;
  }
}

/** `src` có an toàn để render vào thẻ <img> thường hay không (chặn javascript:/data:). */
export function isSafeImageSrc(src: string): boolean {
  if (src.startsWith("/")) return !src.startsWith("//");
  try {
    const { protocol } = new URL(src);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}
