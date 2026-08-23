import { PTCardSkeleton, repeat, Skeleton } from "@/components/Skeleton";
import { getTranslations } from "next-intl/server";

/**
 * Chỉ hiện khi VÀO trang từ nơi khác — lúc đó chưa có gì trên màn hình nên
 * skeleton cả trang là đúng.
 *
 * Đổi bộ lọc trong chính trang này KHÔNG chạy qua đây: page.tsx có Suspense
 * riêng cho vùng kết quả để bộ lọc đứng yên. Đó là chủ ý, không phải trùng lặp.
 */
export default async function LoadingPTs() {
  const t = await getTranslations("loading");
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6" role="status" aria-busy="true">
      <span className="sr-only">{t("ptSearch")}</span>
      <div className="mb-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-2 h-4 w-44" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Khớp với form bộ lọc: 7 nhóm nhãn + ô nhập, rồi hàng nút. */}
        <div className="card space-y-4 p-4">
          {repeat(7, () => (
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          ))}
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {repeat(6, () => (
            <PTCardSkeleton />
          ))}
        </div>
      </div>
    </div>
  );
}
