/**
 * Thông tin liên hệ của nền tảng, dùng chung cho trang pháp lý và footer.
 *
 * Gom một chỗ vì cùng một địa chỉ xuất hiện ở chính sách bảo mật, điều khoản,
 * trang liên hệ và footer — sửa rải rác thì chắc chắn có chỗ còn địa chỉ cũ,
 * mà đây lại đúng là thứ bên duyệt quảng cáo và người dùng dùng để tìm mình.
 *
 * Đọc từ NEXT_PUBLIC_* để đổi được mà không phải sửa code, nhưng lưu ý các biến
 * này nhúng lúc build: đổi giá trị thì phải build lại image frontend.
 *
 * ⚠️ Giá trị mặc định dưới đây là địa chỉ dự kiến trên chính domain của site.
 * Phải bảo đảm hộp thư này CÓ THẬT và có người đọc trước khi chạy quảng cáo —
 * một trang chính sách trỏ tới hộp thư không tồn tại còn tệ hơn không có trang.
 */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "lienhe@ptmatch.vn";
export const CONTACT_ZALO = process.env.NEXT_PUBLIC_CONTACT_ZALO || "";

/** Ngày cập nhật gần nhất của các trang pháp lý, hiện ở đầu trang. */
export const LEGAL_UPDATED_AT = "19/08/2026";
