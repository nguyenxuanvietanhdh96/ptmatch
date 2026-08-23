import type { MetadataRoute } from "next";
import { apiFetch } from "@/lib/api";
import { siteUrl } from "@/lib/site";

export const revalidate = 3600;

interface SitemapEntry {
  slug: string;
  updated_at: string;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/pts`, changeFrequency: "daily", priority: 0.9 },
    // Trang đích cho PT — đây là link dán vào bài post trong group Facebook,
    // và cũng là trang đáng lập chỉ mục cho các truy vấn kiểu "đăng ký làm PT".
    { url: `${base}/for-trainers`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/feedback`, changeFrequency: "monthly", priority: 0.3 },
    // Trang pháp lý: ưu tiên thấp nhưng phải lập chỉ mục được — bên duyệt quảng
    // cáo và người dùng đều tìm chúng qua công cụ tìm kiếm.
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];

  let profiles: SitemapEntry[] = [];
  try {
    profiles = await apiFetch<SitemapEntry[]>("/api/pts/sitemap", {
      cache: "force-cache",
      next: { revalidate: 3600 },
    });
  } catch {
    // Thà trả sitemap chỉ có trang tĩnh còn hơn trả lỗi 500 cho crawler.
  }

  return [
    ...staticRoutes,
    ...profiles.map((profile) => ({
      url: `${base}/pt/${profile.slug}`,
      lastModified: new Date(profile.updated_at),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
