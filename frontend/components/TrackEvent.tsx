"use client";

import { useEffect, useRef } from "react";
import { track } from "@/lib/analytics";

type Props = Record<string, string | number | boolean | undefined>;

/**
 * Bắn một sự kiện khi trang render xong.
 *
 * Dùng cho trang server-rendered: đặt ở đây đáng tin cậy hơn gắn vào `onSubmit`
 * của form tìm kiếm, vì form GET điều hướng ngay và sự kiện thường không kịp gửi.
 * Nó cũng ghi nhận cả lượt truy cập đến thẳng từ link quảng cáo.
 */
export default function TrackEvent({ event, props }: { event: string; props?: Props }) {
  const sent = useRef("");
  const key = JSON.stringify({ event, props });

  useEffect(() => {
    if (sent.current === key) return;
    sent.current = key;
    track(event, props ?? {});
  }, [key, event, props]);

  return null;
}
