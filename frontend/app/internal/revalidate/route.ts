/**
 * Xoá cache ISR cho những trang công khai vừa đổi nội dung vì PT sửa hồ sơ.
 *
 * Trang hồ sơ công khai dựng sẵn 300 giây và trang chủ 60 giây (xem
 * app/(public)/pt/[slug]/page.tsx và app/(public)/page.tsx). Không có endpoint
 * này thì PT lưu xong, bấm "Xem trang của tôi" và thấy nội dung cũ — kết luận
 * hợp lý nhất của họ là hệ thống lỗi, chứ không phải "đang có cache".
 *
 * KHÔNG nằm dưới /api: nginx đẩy toàn bộ /api xuống backend (nginx/conf.d),
 * nên một route handler ở /api/revalidate sẽ không bao giờ chạy trên
 * production. Rewrite /api trong next.config chỉ là lưới đỡ cho dev.
 */

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { ApiError, apiFetch } from "@/lib/api";
import type { PTProfile } from "@/lib/types";

/**
 * Trang chung (trang chủ, sitemap) chỉ dựng lại nhiều nhất một lần mỗi khoảng
 * này. Chúng là tài sản chung của cả site, nên một PT bấm Lưu liên tục sẽ kéo
 * theo một lượt gọi backend mỗi lần — nhân lên cho mọi PT thì đó là cái vòi để
 * bất kỳ tài khoản hợp lệ nào cũng dội tải xuống backend.
 *
 * Trang cá nhân KHÔNG bị hoãn: người dùng đang đứng chờ đúng trang đó. Còn
 * danh sách 6 PT nổi bật chậm vài chục giây thì không ai nhận ra, mà ISR 60
 * giây của chính trang chủ cũng đã tự làm mới.
 */
const SHARED_REVALIDATE_COOLDOWN_MS = 30_000;
let sharedRevalidatedAt = 0;

/**
 * Dựng lại các trang công khai của PT đang gọi.
 *
 * Slug lấy từ backend, KHÔNG lấy từ body: nếu tin client thì bất kỳ ai có một
 * token hợp lệ cũng xoá được cache trang của người khác. Token đi kèm request
 * vừa để xác thực vừa để xác định đúng những trang được phép xoá.
 *
 * @param request - Cần header `Authorization: Bearer <access token của PT>`.
 * @returns Danh sách đường dẫn đã được đánh dấu dựng lại.
 */
export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ revalidated: [] }, { status: 401 });
  }

  let profile: PTProfile;
  try {
    profile = await apiFetch<PTProfile>("/api/pts/me", {
      headers: { Authorization: authorization },
    });
  } catch (err) {
    // 401/403 của backend chuyển tiếp nguyên trạng; backend chết thì 502.
    const status = err instanceof ApiError && err.status > 0 ? err.status : 502;
    return NextResponse.json({ revalidated: [] }, { status });
  }

  // Hồ sơ không có slug là chuyện không nên xảy ra, nhưng nếu xảy ra thì
  // revalidatePath("/pt/undefined") sẽ ghi một đường dẫn rác vào cache.
  if (!profile.slug) {
    return NextResponse.json({ revalidated: [] });
  }

  const paths = [`/pt/${profile.slug}`];
  // Trang chủ và sitemap chỉ liệt kê hồ sơ đủ điều kiện (backend
  // app/services/listing.py), nên hồ sơ còn thiếu ảnh/giá/khu vực có dựng lại
  // hai trang đó cũng không thay đổi gì — chỉ tốn thêm lượt gọi backend.
  // Sitemap nằm trong đây để hồ sơ vừa đủ điều kiện được Google phát hiện sớm
  // thay vì đợi hết 1 giờ.
  const now = Date.now();
  if (
    (profile.missing_listing ?? []).length === 0 &&
    now - sharedRevalidatedAt > SHARED_REVALIDATE_COOLDOWN_MS
  ) {
    sharedRevalidatedAt = now;
    paths.push("/", "/sitemap.xml");
  }
  for (const path of paths) {
    revalidatePath(path);
  }

  return NextResponse.json({ revalidated: paths });
}
