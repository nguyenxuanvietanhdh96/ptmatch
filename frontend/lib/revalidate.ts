import { getAccessToken } from "./auth";

/**
 * Nhờ frontend dựng lại các trang công khai của PT sau khi hồ sơ vừa đổi.
 *
 * Fire-and-forget có chủ ý: đây là việc làm cho nội dung mới hiện ra NGAY thay
 * vì chờ ISR hết hạn. Hỏng thì nội dung vẫn tự tươi sau 60/300 giây, nên không
 * có gì đáng để báo lỗi lên màn hình và chắn mất thông báo "Đã lưu" mà người
 * dùng đang cần thấy.
 *
 * Không đi qua apiFetch: đây là route handler của chính Next (xem
 * app/internal/revalidate/route.ts), không phải API backend — apiFetch sẽ ghép
 * sai base URL và kéo theo cả cơ chế refresh token không liên quan.
 */
export async function revalidatePublicPages(): Promise<void> {
  const token = getAccessToken();
  if (!token) return;
  try {
    await fetch("/internal/revalidate", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    /* mất mạng thì để ISR tự làm mới */
  }
}
