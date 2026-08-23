import { formatLastActive, formatResponseTime } from "@/lib/format";
import type { PTActivity } from "@/lib/types";
import { useTranslations } from "next-intl";

/**
 * Ba tín hiệu trả lời nỗi lo lớn nhất của học viên trước khi để lại số điện
 * thoại: "PT này còn hoạt động không, có trả lời không, đã dạy ai chưa?".
 *
 * Chỉ hiện chỉ số nào có dữ liệu thật — hồ sơ mới sẽ không hiện gì, thay vì
 * hiện số 0 làm mất niềm tin.
 */
export default function ActivitySignals({ activity }: { activity?: PTActivity | null }) {
  const t = useTranslations("activity");
  if (!activity) return null;

  const lastActive = formatLastActive(activity.last_active_at);
  const responseTime = formatResponseTime(activity.response_hours);
  const students = activity.students_coached ?? 0;

  const signals: { key: string; icon: React.ReactNode; text: string }[] = [];

  if (lastActive) {
    signals.push({
      key: "active",
      text: lastActive,
      icon: <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />,
    });
  }
  if (responseTime) {
    signals.push({
      key: "response",
      text: t("respondsIn", { time: responseTime }),
      icon: (
        <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m5-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    });
  }
  if (students > 0) {
    signals.push({
      key: "students",
      text: t("students", { count: students }),
      icon: (
        <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72M18 18.72V14.5m0 4.22a9.06 9.06 0 01-6 0m0 0a9.06 9.06 0 01-6 0m6 0V14.5m-6 4.22a9.094 9.094 0 01-3.741-.479 3 3 0 014.682-2.72M6 18.72V14.5m6-3.22a3 3 0 100-6 3 3 0 000 6z" />
        </svg>
      ),
    });
  }

  if (signals.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {signals.map((signal) => (
        <span
          key={signal.key}
          className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
        >
          {signal.icon}
          {signal.text}
        </span>
      ))}
    </div>
  );
}
