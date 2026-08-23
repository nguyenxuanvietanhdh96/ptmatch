"use client";

import { useEffect } from "react";
import { apiBase } from "@/lib/api";
import { EVENTS, track } from "@/lib/analytics";

/**
 * Counts one profile view from the browser.
 *
 * The profile page is served with ISR, so the view cannot be counted during
 * SSR — the HTML is reused. Counting here also means a view is a real visitor
 * rather than a crawler fetch, and once per browser session rather than per
 * reload.
 */
export default function ProfileViewBeacon({ slug }: { slug: string }) {
  useEffect(() => {
    track(EVENTS.viewProfile, { pt_slug: slug });

    const key = `pt_viewed:${slug}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* private mode: đếm view vẫn chạy, chỉ là không chống lặp được */
    }
    fetch(`${apiBase()}/api/pts/${encodeURIComponent(slug)}/view`, {
      method: "POST",
      keepalive: true,
    }).catch(() => {
      /* view counting is best-effort */
    });
  }, [slug]);

  return null;
}
