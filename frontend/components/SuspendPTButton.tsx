"use client";

import { useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";

/**
 * Đình chỉ / bỏ đình chỉ một hồ sơ PT, ngay tại chỗ báo cáo đi vào.
 *
 * Trang chính sách quyền riêng tư hứa với học viên: "Nếu bị làm phiền, hãy báo
 * cho chúng tôi để xử lý tài khoản PT đó." Nút này là chỗ lời hứa đó được thực
 * hiện. Nó nằm cạnh đánh giá/góp ý thay vì ở một trang quản lý người dùng riêng
 * vì báo cáo đến từ đây — bắt admin đi tìm hồ sơ ở nơi khác là thêm một bước để
 * quên.
 *
 * Bắt buộc nhập lý do: một hồ sơ biến mất khỏi kết quả tìm kiếm mà không ai ghi
 * lại vì sao sẽ tốn hàng giờ dò tìm vài tháng sau, và PT hỏi thì không ai trả
 * lời được. Backend cũng từ chối nếu thiếu.
 */
interface Props {
  slug: string;
  ptName: string;
  suspended: boolean;
  onChanged?: (suspended: boolean) => void;
}

export default function SuspendPTButton({ slug, ptName, suspended, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(next: boolean, why?: string) {
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/admin/pts/${encodeURIComponent(slug)}/suspension`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({ suspended: next, reason: why ?? null }),
      });
      setOpen(false);
      setReason("");
      onChanged?.(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không thực hiện được.");
    } finally {
      setBusy(false);
    }
  }

  if (suspended) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="badge bg-rose-50 text-rose-700">Hồ sơ đang bị đình chỉ</span>
        <button
          onClick={() => send(false)}
          disabled={busy}
          className="text-sm font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-50"
        >
          {busy ? "Đang bỏ..." : "Bỏ đình chỉ"}
        </button>
        {error && <span className="text-xs text-rose-600">{error}</span>}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm font-semibold text-rose-600 hover:text-rose-700"
      >
        Đình chỉ hồ sơ PT
      </button>
    );
  }

  return (
    <div className="w-full rounded-lg border border-rose-200 bg-rose-50 p-3">
      <p className="text-xs text-rose-900">
        Đình chỉ hồ sơ <strong>{ptName}</strong>: hồ sơ rời khỏi trang tìm kiếm,
        trang chủ và sitemap, link trực tiếp trả 404. Dữ liệu được giữ nguyên và
        PT vẫn đăng nhập được — dashboard của họ sẽ hiện lý do bên dưới.
      </p>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Lý do (PT sẽ đọc được)"
        maxLength={500}
        className="input mt-2 bg-white"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          onClick={() => send(true, reason.trim())}
          disabled={busy || reason.trim().length < 3}
          className="text-sm font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-40"
        >
          {busy ? "Đang đình chỉ..." : "Xác nhận đình chỉ"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setError("");
          }}
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          Huỷ
        </button>
        {error && <span className="text-xs text-rose-600">{error}</span>}
      </div>
    </div>
  );
}
