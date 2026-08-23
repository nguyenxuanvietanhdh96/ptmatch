/**
 * Skeleton dùng chung cho mọi trạng thái đang tải.
 *
 * Vì sao có file này thay vì mỗi trang tự viết một dòng "Đang tải...":
 *
 * 1. Một dòng chữ cao 20px rồi thay bằng danh sách cao 800px là một cú nhảy —
 *    trang giật, và nếu người dùng vừa kịp bấm vào đâu đó thì bấm trượt. Skeleton
 *    chiếm sẵn đúng chỗ mà nội dung thật sẽ chiếm.
 * 2. Nó cho biết SẼ hiện ra cái gì (danh sách thẻ? bảng? một hồ sơ?), nên khoảng
 *    chờ có cảm giác ngắn hơn dù thời gian thật y nguyên.
 *
 * Không dùng cho hành động do người dùng bấm (gửi form, lưu) — chỗ đó đổi chữ
 * trên nút là đúng hơn, vì bố cục không thay đổi.
 */
import { Fragment } from "react";
import { useTranslations } from "next-intl";

/** Khối xám nhấp nháy. `className` quyết định kích thước — luôn phải truyền. */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    // motion-reduce: có người thấy chóng mặt/khó tập trung với chuyển động lặp
    // vô hạn. Tôn trọng cờ hệ thống của họ, khối xám tĩnh vẫn làm đúng việc.
    <div
      aria-hidden
      className={`animate-pulse rounded bg-slate-200 motion-reduce:animate-none ${className}`}
    />
  );
}

/**
 * Bọc một vùng skeleton để trình đọc màn hình biết đang có gì diễn ra.
 *
 * Bản thân skeleton là `aria-hidden` — với người dùng trình đọc màn hình, thay
 * chữ "Đang tải..." bằng mấy ô xám mà không nói gì là bước lùi: họ mất luôn
 * thông tin. `role="status"` + chữ ẩn giữ lại phần thông báo đó.
 */
export function Loading({
  label,
  className = "",
  children,
}: {
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("loading");
  return (
    <div role="status" aria-busy="true" className={className}>
      {children}
      {/*
        Chữ ẩn đặt CUỐI, không đặt đầu — `className` ở đây thường là `space-y-*`
        hoặc `grid`, và `space-y` cộng margin cho mọi con kể từ con thứ hai. Để
        span lên đầu thì skeleton đầu tiên bị đẩy xuống một khoảng mà nội dung
        thật không có. Ở cuối thì margin rơi vào span, mà span là position
        absolute (sr-only) nên không ảnh hưởng gì tới bố cục.
      */}
      <span className="sr-only">{label ?? t("default")}</span>
    </div>
  );
}

/**
 * Làm mờ nội dung ĐANG CÓ trong lúc tải lứa mới (đổi bộ lọc, đổi trang).
 *
 * Khác Loading một cách cố ý: khi đã có dữ liệu trên màn hình, thay nó bằng
 * skeleton là làm mất chỗ người dùng đang đọc và tạo thêm một cú nhảy nữa. Giữ
 * nguyên, mờ đi, chặn bấm — vừa đủ để thấy "đang cập nhật".
 */
export function Refreshing({
  busy,
  className = "",
  children,
}: {
  busy: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      aria-busy={busy}
      className={`transition-opacity duration-200 ${
        busy ? "pointer-events-none opacity-50" : "opacity-100"
      } ${className}`}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------------- *
 * Skeleton theo từng khối giao diện có thật.
 *
 * Chiều cao ở đây được lấy khớp với component thật (PTCard, RequestCard...).
 * Lệch nhiều thì skeleton lại tự tạo ra cú nhảy mà nó sinh ra để tránh.
 * ------------------------------------------------------------------------- */

/** Khớp với PTCard: avatar 56px + tên + sao, hàng badge, chân thẻ có giá. */
export function PTCardSkeleton() {
  return (
    <div className="card flex flex-col gap-3 p-5">
      <div className="flex items-center gap-4">
        <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <div className="flex gap-1.5">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="mt-auto flex items-end justify-between gap-2 border-t border-slate-100 pt-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-5 w-20" />
      </div>
    </div>
  );
}

/** Khớp với RequestCard. */
export function RequestCardSkeleton() {
  return (
    <div className="card flex flex-col gap-3 p-5">
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-52" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
      <div className="mt-1 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>
    </div>
  );
}

/** Một dòng danh sách: avatar + hai dòng chữ + mốc thời gian bên phải. */
export function RowSkeleton({ avatar = true }: { avatar?: boolean }) {
  return (
    <div className="card flex items-center gap-4 p-4">
      {avatar && <Skeleton className="h-12 w-12 shrink-0 rounded-full" />}
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <Skeleton className="h-3 w-14 shrink-0" />
    </div>
  );
}

/** Thẻ số liệu (nhãn nhỏ + số lớn). */
export function StatCardSkeleton() {
  return (
    <div className="card p-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-2 h-7 w-16" />
    </div>
  );
}

/** Bảng: giữ nguyên header thật, chỉ phần thân là skeleton. */
export function TableRowsSkeleton({ rows = 5, cols = 3 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-slate-50 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="p-3">
              {/* Cột đầu là nhãn (dài), các cột sau là số (ngắn) — bảng thật
                  trông như vậy, nên skeleton cũng vậy. */}
              <Skeleton className={c === 0 ? "h-4 w-32" : "h-4 w-10"} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/**
 * Vỏ nội dung chung cho các khu vực phải kiểm tra đăng nhập trước khi dựng
 * (/account, /dashboard, /admin).
 *
 * Các layout đó trước đây hiện một vòng xoay giữa màn hình rồi mới bung ra cả
 * sidebar + nội dung — nghĩa là toàn bộ bố cục xuất hiện một lượt, sau một
 * khoảng trống. Sidebar không cần dữ liệu gì, nên nó dựng ngay được; chỉ vùng
 * nội dung là phải chờ, và đây là thứ điền vào chỗ đó.
 */
export function PageBodySkeleton({ rows = 3 }: { rows?: number }) {
  const t = useTranslations("loading");
  return (
    <Loading label={t("openingPage")}>
      <Skeleton className="h-7 w-52" />
      <Skeleton className="mt-2 h-4 w-72" />
      <div className="mt-6 space-y-3">
        {repeat(rows, () => (
          <RowSkeleton />
        ))}
      </div>
    </Loading>
  );
}

/**
 * Lặp một skeleton n lần.
 *
 * Nhận hàm dựng chứ không nhận sẵn phần tử, và KHÔNG bọc thêm thẻ div nào: bọc
 * thêm một lớp thì trong grid chính lớp đó thành ô lưới, còn thẻ bên trong mất
 * chiều cao căng đều — đúng kiểu lệch mà skeleton sinh ra để tránh.
 */
export function repeat(count: number, render: (i: number) => React.ReactNode) {
  return Array.from({ length: count }, (_, i) => (
    <Fragment key={i}>{render(i)}</Fragment>
  ));
}
