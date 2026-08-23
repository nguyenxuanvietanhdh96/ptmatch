/**
 * "Nguyễn Thị Bích Ngân" -> "Ngân".
 *
 * Tên chính trong tiếng Việt nằm ở cuối, ngược với tiếng Anh. Dùng cho những
 * chỗ hiển thị công khai và được Google lập chỉ mục — trang chủ chẳng hạn —
 * để người đăng yêu cầu không bị tra ngược ra danh tính đầy đủ.
 */
export function givenName(fullName?: string | null): string {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

/** 500000 -> "500.000đ" */
export function formatVND(value?: number | null): string {
  if (value === null || value === undefined || isNaN(value)) return "—";
  return `${Math.round(value).toLocaleString("vi-VN").replace(/,/g, ".")}đ`;
}

export function formatDate(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Thời gian phản hồi trung bình -> câu chữ dễ đọc.
 * Làm tròn thô có chủ ý: "khoảng 3 giờ" đáng tin hơn "3,4 giờ".
 */
export function formatResponseTime(hours?: number | null): string {
  if (hours === null || hours === undefined || isNaN(hours) || hours < 0) return "";
  if (hours < 1) return "dưới 1 giờ";
  if (hours < 24) return `khoảng ${Math.round(hours)} giờ`;
  const days = Math.round(hours / 24);
  return days === 1 ? "khoảng 1 ngày" : `khoảng ${days} ngày`;
}

/**
 * "Hoạt động gần đây" — chỉ trả chuỗi khi mốc đủ mới để còn là tín hiệu tích
 * cực. PT vắng mặt nhiều tháng thì im lặng còn hơn là bêu ra.
 */
export function formatLastActive(value?: string | null, maxDays = 30): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  const diffDays = (Date.now() - d.getTime()) / 86400000;
  if (diffDays > maxDays) return "";
  if (diffDays < 1) return "Hoạt động hôm nay";
  if (diffDays < 2) return "Hoạt động hôm qua";
  return `Hoạt động ${Math.floor(diffDays)} ngày trước`;
}

/** Thời gian tương đối đơn giản: "5 phút trước", "2 giờ trước", "3 ngày trước" */
export function timeAgo(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Vừa xong";
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  return formatDate(value);
}
