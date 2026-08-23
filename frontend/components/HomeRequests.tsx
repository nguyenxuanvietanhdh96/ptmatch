import Link from "next/link";
import TrackEvent from "@/components/TrackEvent";
import { apiFetch } from "@/lib/api";
import { specialtyLabel } from "@/lib/constants";
import { givenName, timeAgo } from "@/lib/format";
import type { Paginated, TraineeRequest } from "@/lib/types";
import { getTranslations } from "next-intl/server";

/**
 * Block "Học viên đang tìm PT" trên trang chủ — kiểu danh sách diễn đàn.
 *
 * Đối tượng chính của block này là PT, không phải học viên: một PT lạc vào
 * trang chủ mà thấy vài người có thật đang cần người ở quận của mình thì đó là
 * lý do đăng ký hồ sơ mạnh hơn mọi câu quảng cáo. Đây là cách khoe cầu để kéo
 * cung khi chợ còn mỏng.
 *
 * Bố cục cố tình dày (một dòng mỗi yêu cầu) chứ không dùng thẻ như /requests:
 * số dòng nhiều mới là thứ cần khoe, mà thẻ thì chỉ nhét được 2 cái vào cùng
 * khoảng màn hình.
 */

// Trang chủ được Google lập chỉ mục, khác /requests vốn noindex. Nên ở đây chỉ
// hiện tên riêng và mô tả cắt ngắn — ít lộ hơn hẳn bài họ tự đăng lên Facebook.
const SUMMARY_MAX = 90;

// Dưới ngưỡng này thì danh sách trông như trang chết, thà mời đăng còn hơn.
const MIN_ROWS = 3;
const MAX_ROWS = 6;

async function getOpenRequests(): Promise<{ items: TraineeRequest[]; total: number }> {
  try {
    const data = await apiFetch<Paginated<TraineeRequest>>(
      `/api/requests?page_size=${MAX_ROWS}`,
      // Cùng nhịp làm mới với trang chủ (app/(public)/page.tsx). Không chọn ISR
      // ở đây thì một lời gọi no-store sẽ kéo cả trang chủ về dựng động lại.
      { cache: "force-cache", next: { revalidate: 60 } }
    );
    return { items: data.items ?? [], total: data.total ?? 0 };
  } catch {
    return { items: [], total: 0 };
  }
}

// Chuỗi dự phòng truyền vào thay vì hardcode: summarize() là hàm thuần, không
// gọi hook được.
function summarize(request: TraineeRequest, FALLBACK_SUMMARY: string): string {
  const raw = request.note?.replace(/\s+/g, " ").trim();
  const text =
    raw ||
    (request.specialty ? specialtyLabel(request.specialty) : "") ||
    FALLBACK_SUMMARY;
  return text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX).trimEnd()}…` : text;
}

function InviteCard({ t }: { t: (k: string) => string }) {
  return (
    <div className="card p-8 text-center">
      <p className="font-semibold text-slate-900">{t("inviteTitle")}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
        {t("inviteBody")}
      </p>
      <Link href="/requests/new" className="btn-primary mt-4 inline-block">
        {t("invitePost")}
      </Link>
    </div>
  );
}

export default async function HomeRequests() {
  const t = await getTranslations("homeRequests");
  const { items, total } = await getOpenRequests();
  const enough = items.length >= MIN_ROWS;

  return (
    <section className="border-y border-slate-200 bg-white py-14">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{t("heading")}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {enough
                ? // Câu này nói với PT, nên phải nêu rõ ai hành động và được gì.
                  // Không hứa con số nào: không còn giới hạn số PT nhận, mà
                  // "tối đa N PT sẽ gọi cho bạn" thì đó là lời hứa không giữ.
                  t("subtitleWithRows", { total })
                : t("subtitleEmpty")}
            </p>
          </div>
          {enough && (
            <Link
              href="/requests"
              className="text-sm font-semibold text-emerald-600 hover:text-emerald-700"
            >
              {t("viewAll")}
            </Link>
          )}
        </div>

        {enough ? (
          <>
            <TrackEvent event="home_requests_view" props={{ count: String(items.length) }} />
            <ul className="mt-6 divide-y divide-slate-100 border-y border-slate-100">
              {items.map((request) => (
                <li key={request.id}>
                  <Link
                    href="/requests"
                    className="flex flex-col gap-1 py-3 transition hover:bg-slate-50 sm:flex-row sm:items-baseline sm:gap-4"
                  >
                    <span className="shrink-0 text-sm font-semibold text-emerald-700 sm:w-32">
                      {request.ward || request.city || t("areaUnknown")}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-600">
                      <span className="font-medium text-slate-900">
                        {givenName(request.trainee_name)}
                      </span>
                      {" — "}
                      {summarize(request, t("fallbackSummary"))}
                    </span>
                    {/* Chỉ mốc thời gian. Số PT đã lấy liên hệ từng hiện ở đây
                        (và trước đó là "còn N suất") nhưng cả hai đều là con số
                        người xem không làm gì được: nó không nói yêu cầu đã
                        xong hay chưa, vì bấm nút không phải là gọi điện. Mốc
                        thời gian một mình đã đủ chứng minh chợ đang sống. */}
                    <span className="shrink-0 text-xs text-slate-400">
                      {timeAgo(request.created_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="mt-6">
            <InviteCard t={t} />
          </div>
        )}

        {/* Hai nút cho hai đối tượng: học viên đăng nhu cầu, PT đăng ký để nhận. */}
        {enough && (
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/requests/new" className="btn-secondary">
              {t("ctaPost")}
            </Link>
            <Link href="/register" className="btn-primary">
              {t("ctaRegisterPT")}
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
