"use client";

import { useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";

/**
 * Ba mức xử lý một PT, đặt ngay tại chỗ báo cáo đi vào.
 *
 * Trang chính sách quyền riêng tư hứa với người dùng hai việc: xử lý PT làm
 * phiền học viên (mục 6), và xoá dữ liệu khi họ yêu cầu đóng tài khoản (mục 5).
 * Trước đây cả hai đều không có công cụ — cách duy nhất là UPDATE thẳng vào DB.
 *
 * Ba mức cố ý tách rời nhau:
 *
 *   đình chỉ  — ẩn hồ sơ khỏi chỗ công khai. PT vẫn đăng nhập, vẫn sửa được,
 *               vẫn xem lead cũ. Biện pháp tạm trong lúc xem xét.
 *   khoá      — cắt đăng nhập, cắt luôn phiên đang mở. Dữ liệu còn nguyên, mở
 *               khoá là dùng lại được.
 *   đóng      — khử danh tính, KHÔNG hoàn tác được.
 *
 * Không gộp thành một nút "xử lý": người bấm sẽ chọn mức mạnh nhất vì đó là mức
 * duy nhất, và "bỏ xử lý" sẽ vô tình tháo luôn một lệnh còn có lý do riêng.
 */
type Action = "suspend" | "ban" | "close";

interface Props {
  slug: string;
  ptName: string;
  suspended: boolean;
  banned: boolean;
  deleted: boolean;
  onChanged?: () => void;
}

export default function PTModerationActions({
  slug,
  ptName,
  suspended,
  banned,
  deleted,
  onChanged,
}: Props) {
  const [open, setOpen] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [confirmSlug, setConfirmSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function call(path: string, method: "PATCH" | "POST", body: unknown) {
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/admin/pts/${encodeURIComponent(slug)}${path}`, {
        method,
        auth: true,
        body: JSON.stringify(body),
      });
      setOpen(null);
      setReason("");
      setConfirmSlug("");
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không thực hiện được.");
    } finally {
      setBusy(false);
    }
  }

  // Tài khoản đã đóng là trạng thái cuối — không còn thao tác nào có nghĩa.
  if (deleted) {
    return <span className="badge bg-slate-100 text-slate-500">Tài khoản đã đóng</span>;
  }

  const errorNote = error ? <span className="text-xs text-rose-600">{error}</span> : null;

  if (open === "suspend" || open === "ban") {
    const isBan = open === "ban";
    return (
      <div className="w-full rounded-lg border border-rose-200 bg-rose-50 p-3">
        <p className="text-xs text-rose-900">
          {isBan ? (
            <>
              Khoá tài khoản của <strong>{ptName}</strong>: không đăng nhập được
              nữa và phiên đang mở bị cắt ngay. Hồ sơ vẫn giữ dữ liệu, mở khoá là
              dùng lại được.
            </>
          ) : (
            <>
              Đình chỉ hồ sơ <strong>{ptName}</strong>: hồ sơ rời khỏi trang tìm
              kiếm, trang chủ và sitemap, link trực tiếp trả 404, và không nhận
              lead mới. PT vẫn đăng nhập được — dashboard của họ sẽ hiện lý do.
            </>
          )}
        </p>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Lý do (người bị xử lý sẽ đọc được)"
          maxLength={500}
          className="input mt-2 bg-white"
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            onClick={() =>
              isBan
                ? call("/ban", "PATCH", { banned: true, reason: reason.trim() })
                : call("/suspension", "PATCH", { suspended: true, reason: reason.trim() })
            }
            disabled={busy || reason.trim().length < 3}
            className="text-sm font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-40"
          >
            {busy ? "Đang xử lý..." : isBan ? "Xác nhận khoá" : "Xác nhận đình chỉ"}
          </button>
          <button
            onClick={() => {
              setOpen(null);
              setError("");
            }}
            className="text-sm text-slate-500 hover:text-slate-900"
          >
            Huỷ
          </button>
          {errorNote}
        </div>
      </div>
    );
  }

  if (open === "close") {
    return (
      <div className="w-full rounded-lg border border-rose-300 bg-rose-50 p-3">
        <p className="text-xs text-rose-900">
          Đóng tài khoản của <strong>{ptName}</strong> — <strong>không hoàn tác
          được</strong>. Tên, email, ảnh, bio, liên hệ và hồ sơ bị khử; link cũ
          chết. Bản ghi lead được giữ lại vì chúng chứa số điện thoại của học
          viên — dữ liệu của người khác, cần cho việc đối chiếu khi có tranh chấp.
        </p>
        {/* Gõ lại slug: một thao tác không hoàn tác được thì xác nhận bằng một
            cú bấm là không đủ, nhất là khi nút nằm trong một danh sách dài. */}
        <input
          value={confirmSlug}
          onChange={(e) => setConfirmSlug(e.target.value)}
          placeholder={`Gõ "${slug}" để xác nhận`}
          className="input mt-2 bg-white"
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            onClick={() => call("/close", "POST", { confirm_slug: confirmSlug.trim() })}
            disabled={busy || confirmSlug.trim() !== slug}
            className="text-sm font-semibold text-rose-700 hover:text-rose-800 disabled:opacity-40"
          >
            {busy ? "Đang đóng..." : "Đóng tài khoản"}
          </button>
          <button
            onClick={() => {
              setOpen(null);
              setError("");
            }}
            className="text-sm text-slate-500 hover:text-slate-900"
          >
            Huỷ
          </button>
          {errorNote}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {suspended ? (
        <>
          <span className="badge bg-rose-50 text-rose-700">Hồ sơ bị đình chỉ</span>
          <button
            onClick={() => call("/suspension", "PATCH", { suspended: false, reason: null })}
            disabled={busy}
            className="text-sm font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-50"
          >
            Bỏ đình chỉ
          </button>
        </>
      ) : (
        <button
          onClick={() => setOpen("suspend")}
          className="text-sm font-semibold text-amber-600 hover:text-amber-700"
        >
          Đình chỉ hồ sơ
        </button>
      )}

      {banned ? (
        <>
          <span className="badge bg-rose-100 text-rose-800">Tài khoản bị khoá</span>
          <button
            onClick={() => call("/ban", "PATCH", { banned: false, reason: null })}
            disabled={busy}
            className="text-sm font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-50"
          >
            Mở khoá
          </button>
        </>
      ) : (
        <button
          onClick={() => setOpen("ban")}
          className="text-sm font-semibold text-rose-600 hover:text-rose-700"
        >
          Khoá tài khoản
        </button>
      )}

      <button
        onClick={() => setOpen("close")}
        className="text-sm text-slate-400 hover:text-rose-700"
      >
        Đóng tài khoản
      </button>
      {errorNote}
    </div>
  );
}
