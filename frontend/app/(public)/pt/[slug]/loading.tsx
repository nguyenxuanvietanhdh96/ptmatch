import { repeat, Skeleton } from "@/components/Skeleton";
import { getTranslations } from "next-intl/server";

/**
 * Trang hồ sơ PT là đích đến của gần như mọi cú bấm từ trang tìm kiếm, và nó
 * dựng sẵn theo từng slug (revalidate 300) — nên lượt xem đầu tiên của mỗi PT
 * phải chờ backend thật.
 *
 * Trước đây khoảng chờ đó KHÔNG có phản hồi nào: bấm vào thẻ PT rồi màn hình
 * đứng nguyên ở trang cũ vài trăm ms, đủ lâu để người dùng bấm lần thứ hai.
 * Skeleton này giữ đúng bố cục hai cột và dải header trắng của trang thật, nên
 * khi nội dung về thì không có gì nhảy chỗ.
 */
export default async function LoadingProfile() {
  const t = await getTranslations("loading");
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{t("ptProfile")}</span>

      {/* Dải header trắng — cùng nền, cùng đường viền dưới với trang thật. */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <Skeleton className="h-24 w-24 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-3">
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-4 w-72" />
              <Skeleton className="h-4 w-48" />
              <div className="flex gap-1.5">
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-28 rounded-full" />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:flex-col">
              <Skeleton className="h-9 w-28 rounded-lg" />
              <Skeleton className="h-7 w-20 rounded-lg" />
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-10">
          {/* Giới thiệu */}
          <section>
            <Skeleton className="h-6 w-32" />
            <div className="mt-3 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </section>

          {/* Bảng giá — 4 thẻ, khớp PRICING_ROWS */}
          <section>
            <Skeleton className="h-6 w-28" />
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {repeat(4, () => (
                <div className="card p-4 text-center">
                  <Skeleton className="mx-auto h-4 w-20" />
                  <Skeleton className="mx-auto mt-2 h-5 w-24" />
                </div>
              ))}
            </div>
          </section>

          {/* Đánh giá */}
          <section>
            <Skeleton className="h-6 w-40" />
            <div className="mt-3 space-y-3">
              {repeat(2, () => (
                <div className="card p-5">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                  <Skeleton className="mt-3 h-4 w-full" />
                  <Skeleton className="mt-2 h-4 w-2/3" />
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Cột phải: form liên hệ, dính theo khi cuộn ở trang thật. */}
        <aside>
          <div className="card space-y-3 p-5">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-full" />
            {repeat(4, () => (
              <Skeleton className="h-10 w-full rounded-lg" />
            ))}
            <Skeleton className="h-11 w-full rounded-lg" />
          </div>
        </aside>
      </div>
    </div>
  );
}
