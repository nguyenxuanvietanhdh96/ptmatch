import { useId } from "react";
import { useTranslations } from "next-intl";

interface RatingStarsProps {
  rating?: number | null;
  count?: number | null;
  size?: "sm" | "md";
  showValue?: boolean;
}

function Star({ filled, half, size }: { filled: boolean; half?: boolean; size: "sm" | "md" }) {
  const cls = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  // id phải duy nhất trong cả tài liệu: một trang tìm kiếm có 12 thẻ PT, mà id
  // trùng nhau trong SVG là HTML không hợp lệ và trình duyệt chỉ dùng định nghĩa
  // đầu tiên nó gặp.
  const gradientId = useId();
  return (
    <svg viewBox="0 0 20 20" className={`${cls} ${filled || half ? "text-amber-400" : "text-slate-300"}`} fill="currentColor" aria-hidden="true">
      {half ? (
        <>
          <defs>
            <linearGradient id={gradientId}>
              <stop offset="50%" stopColor="currentColor" />
              <stop offset="50%" stopColor="#cbd5e1" />
            </linearGradient>
          </defs>
          <path
            fill={`url(#${gradientId})`}
            d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118L2.077 10.1c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
          />
        </>
      ) : (
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118L2.077 10.1c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      )}
    </svg>
  );
}

export default function RatingStars({ rating, count, size = "sm", showValue = true }: RatingStarsProps) {
  const t = useTranslations("rating");
  const value = rating ?? 0;
  return (
    <div className="flex items-center gap-1">
      <div className="flex">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} size={size} filled={value >= i - 0.25} half={value >= i - 0.75 && value < i - 0.25} />
        ))}
      </div>
      {showValue && (
        <span className="text-sm text-slate-500">
          {value > 0 ? value.toFixed(1) : t("none")}
          {count !== undefined && count !== null && count > 0 ? ` (${count})` : ""}
        </span>
      )}
    </div>
  );
}
