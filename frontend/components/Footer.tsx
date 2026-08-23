import Link from "next/link";
import { useTranslations } from "next-intl";
import { CONTACT_EMAIL } from "@/lib/contact";

export default function Footer() {
  const t = useTranslations("footer");
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-xs font-black text-white">PT</span>
            PT<span className="text-emerald-600">Match</span>
          </div>
          <p className="mt-3 text-sm text-slate-500">
            {t("tagline")}
          </p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{t("exploreHeading")}</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-500">
            <li><Link href="/pts" className="hover:text-emerald-600">{t("findPT")}</Link></li>
            <li><Link href="/requests/new" className="hover:text-emerald-600">{t("postRequest")}</Link></li>
            <li><Link href="/pts?specialty=weight_loss" className="hover:text-emerald-600">{t("weightLoss")}</Link></li>
            <li><Link href="/pts?specialty=muscle_gain" className="hover:text-emerald-600">{t("muscleGain")}</Link></li>
            <li><Link href="/pts?specialty=online_coaching" className="hover:text-emerald-600">{t("onlineCoaching")}</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{t("forPTHeading")}</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-500">
            <li><Link href="/for-trainers" className="hover:text-emerald-600">{t("whyJoin")}</Link></li>
            <li><Link href="/register?role=pt" className="hover:text-emerald-600">{t("createProfile")}</Link></li>
            <li><Link href="/login" className="hover:text-emerald-600">{t("login")}</Link></li>
            <li><Link href="/dashboard" className="hover:text-emerald-600">{t("manageLeads")}</Link></li>
          </ul>
        </div>
      </div>
      {/* Link pháp lý + địa chỉ liên hệ. Không chỉ là thủ tục: site thu số điện
          thoại của người thật và bắn sự kiện chuyển đổi về Facebook, nên đây là
          chỗ bên duyệt quảng cáo tìm đầu tiên khi xét trang đích. */}
      <div className="border-t border-slate-100 px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-400">
          <Link href="/privacy" className="hover:text-emerald-600">
            {t("privacy")}
          </Link>
          <Link href="/terms" className="hover:text-emerald-600">
            {t("terms")}
          </Link>
          <Link href="/feedback" className="hover:text-emerald-600">
            {t("feedback")}
          </Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-emerald-600">
            {CONTACT_EMAIL}
          </a>
        </div>
      </div>
      <div className="border-t border-slate-100 py-4 text-center text-xs text-slate-400">
        {/* Truyền năm dạng CHUỖI: ICU sẽ định dạng số theo locale, và ở vi-VN
            thì 2026 ra thành "2.026". */}
        {t("copyright", { year: String(new Date().getFullYear()) })}
      </div>
    </footer>
  );
}
