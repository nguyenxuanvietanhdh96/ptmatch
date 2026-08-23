/* eslint-disable @next/next/no-img-element */
import Image from "next/image";
import { isOptimisableSrc, isSafeImageSrc } from "@/lib/image-hosts";

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
}

export default function Avatar({ src, name, size = 48, className = "" }: AvatarProps) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  const shared = `rounded-full object-cover bg-slate-100 ${className}`;

  if (src && isOptimisableSrc(src)) {
    return (
      // next/image: avatar xuất hiện trên mọi thẻ PT ở trang tìm kiếm, nên phục
      // vụ đúng kích thước hiển thị thay vì ảnh gốc vài MB là khoản tiết kiệm
      // băng thông lớn nhất của toàn site.
      <Image
        src={src}
        alt={name}
        width={size}
        height={size}
        // KHÔNG truyền `sizes`: avatar có kích thước cố định. Có `sizes`, Next
        // coi đây là ảnh responsive và liệt kê đủ 16 độ rộng (tới 3840px) vào
        // srcset, đồng thời đặt src dự phòng thành bản 3840px. Bỏ nó đi thì Next
        // sinh đúng hai ứng viên 1x/2x — HTML gọn hơn và bản dự phòng hợp lý.
        className={shared}
        style={{ width: size, height: size }}
      />
    );
  }

  if (src && isSafeImageSrc(src)) {
    // Host chưa khai báo trong lib/image-hosts.ts: dùng <img> thường.
    //
    // KHÔNG đưa vào <Image> — next/image NÉM LỖI với host chưa cấu hình, và lỗi
    // đó xảy ra lúc render nên nó hạ cả trang xuống 500 chỉ vì một cái avatar.
    // Ảnh vẫn hiện, chỉ là không được tối ưu; đó là cái giá đúng để trả.
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className={shared}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-700 ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-label={name}
    >
      {initial}
    </div>
  );
}
