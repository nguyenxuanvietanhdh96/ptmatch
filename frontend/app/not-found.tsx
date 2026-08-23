import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-6xl font-extrabold text-emerald-600">404</p>
      <h1 className="mt-4 text-2xl font-bold text-slate-900">{t("heading")}</h1>
      <p className="mt-2 max-w-md text-slate-500">
        {t("body")}
      </p>
      <div className="mt-6 flex gap-3">
        <Link href="/" className="btn-secondary">{t("home")}</Link>
        <Link href="/pts" className="btn-primary">{t("findPT")}</Link>
      </div>
    </div>
  );
}
