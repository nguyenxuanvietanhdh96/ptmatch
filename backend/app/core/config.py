"""Application settings loaded from environment variables."""
from typing import List

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Placeholders shipped in the repo — usable in dev, never in production.
INSECURE_SECRET_KEYS = frozenset(
    {"dev-secret-change-me", "change-me-to-a-long-random-string"}
)
MIN_SECRET_KEY_LENGTH = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    database_url: str = "postgresql+asyncpg://ptmatch:ptmatch_secret@localhost:5432/ptmatch"
    redis_url: str = "redis://localhost:6379/0"

    secret_key: str = "dev-secret-change-me"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30

    environment: str = "development"
    cors_origins: str = "http://localhost:3000"

    # ----- Vùng phục vụ -----
    # Tỉnh/thành mà PTMatch đang hoạt động, phân tách bằng dấu phẩy. Tên phải
    # khớp danh mục hành chính (frontend/public/vn-locations/provinces.json).
    #
    # Giai đoạn kiểm chứng chỉ mở TP.HCM + Đồng Nai: chợ hai chiều sống bằng mật
    # độ, không bằng độ phủ. Sau sáp nhập 01/07/2025, hai tỉnh này đã bao trọn
    # Bình Dương, Bà Rịa - Vũng Tàu và Bình Phước — 263 phường/xã.
    #
    # ĐỂ RỖNG = bỏ giới hạn, chạy toàn quốc. Mở rộng vùng là đổi biến này rồi
    # `docker compose up -d backend`, không phải sửa code. Frontend có bản sao
    # danh sách này ở lib/constants.ts (biến NEXT_PUBLIC_* nhúng lúc build nên
    # không dùng chung một nguồn được) — đổi một bên thì phải đổi bên kia.
    served_provinces: str = "Thành phố Hồ Chí Minh,Tỉnh Đồng Nai"

    # Che SĐT của lead khi trả về cho PT (chuẩn bị cho mô hình mở khoá lead trả
    # phí). Để False trong giai đoạn kiểm chứng nhu cầu — bật lên khi PT còn
    # chưa liên hệ được ai thì không đo được lead có giá trị hay không.
    mask_lead_phone: bool = False

    # ----- Thông báo lead -----
    # Chuỗi kênh dự phòng, gửi theo thứ tự và dừng ở kênh đầu tiên thành công.
    # Kênh hợp lệ: log, email, zalo_oa, zns (xem app/services/channels).
    #
    # Mặc định chỉ "log": chưa cấu hình gì thì sự kiện vẫn nhìn thấy được trong
    # log thay vì biến mất. Production nên đặt kênh thật lên trước, ví dụ
    # NOTIFY_CHANNELS=zalo_oa,email,log
    notify_channels: str = "log"

    # Access token của Zalo Official Account, dùng cho cả zalo_oa lẫn zns.
    # LƯU Ý: token này có hạn và cần làm mới định kỳ.
    zalo_oa_access_token: str = ""
    # ID template ZNS đã được Zalo duyệt. Không có thì kênh zns tự tắt.
    zns_template_id: str = ""

    # Lead ở trạng thái 'new' quá số giờ này thì job nhắc lại sẽ nhắc PT.
    lead_reminder_after_hours: int = 12

    # Notifications (lead alerts). Email is skipped when smtp_host is empty.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "PTMatch <no-reply@ptmatch.vn>"
    # STARTTLS (cổng 587 phổ biến — Brevo bắt buộc dùng cổng này với TLS này).
    smtp_use_tls: bool = True
    # TLS ngay từ lúc kết nối (cổng 465 — phổ biến ở một số nhà cung cấp VN).
    # Khác STARTTLS: không nâng cấp giữa phiên, kết nối là TLS từ đầu. Bật cờ
    # này thì smtp_use_tls bị bỏ qua — hai kiểu TLS không dùng cùng lúc được.
    smtp_use_ssl: bool = False
    frontend_base_url: str = "http://localhost:3000"

    # OAuth — leave empty to disable a provider
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/auth/google/callback"

    facebook_client_id: str = ""
    facebook_client_secret: str = ""
    facebook_redirect_uri: str = "http://localhost:8000/api/auth/facebook/callback"

    zalo_app_id: str = ""
    zalo_app_secret: str = ""
    zalo_redirect_uri: str = "http://localhost:8000/api/auth/zalo/callback"

    # Provider ĐÃ cấu hình nhưng CHƯA mở cho công chúng, phân tách bởi dấu phẩy.
    #
    # "Có client id" và "người lạ đăng nhập được" là hai chuyện khác nhau: một
    # app Facebook chưa qua App Review vẫn nhận credential và vẫn chuyển hướng
    # bình thường, nhưng chỉ tài khoản Admin/Developer/Tester đi qua được — người
    # dùng thật bấm vào là gặp màn hình từ chối của Facebook. Không có ô này thì
    # không cách nào vừa test được provider vừa giấu nó khỏi người dùng.
    #
    # Chỉ ảnh hưởng tới danh sách trả về cho giao diện; endpoint /login của
    # provider vẫn hoạt động để còn test bằng URL trực tiếp.
    oauth_hidden_providers: str = ""

    # Storage: "local" (dev) | "gcs" (production)
    storage_backend: str = "local"
    local_media_dir: str = "./media"
    gcp_project_id: str = ""
    gcs_bucket_name: str = ""
    cdn_base_url: str = ""

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def notify_channel_list(self) -> List[str]:
        return [c.strip() for c in self.notify_channels.split(",") if c.strip()]

    @property
    def served_province_list(self) -> List[str]:
        """Danh sách rỗng = không giới hạn vùng (xem ghi chú ở served_provinces)."""
        return [p.strip() for p in self.served_provinces.split(",") if p.strip()]

    @model_validator(mode="after")
    def _reject_insecure_production_secret(self) -> "Settings":
        """Refuse to boot production with a guessable JWT signing key.

        Anyone holding the key can mint tokens for any account, so failing at
        startup is far better than serving traffic with forgeable sessions.
        """
        if self.environment != "production":
            return self
        if (
            self.secret_key in INSECURE_SECRET_KEYS
            or len(self.secret_key) < MIN_SECRET_KEY_LENGTH
        ):
            raise ValueError(
                "SECRET_KEY phải là chuỗi ngẫu nhiên tối thiểu %d ký tự khi "
                "ENVIRONMENT=production (gợi ý: openssl rand -hex 32)"
                % MIN_SECRET_KEY_LENGTH
            )
        return self

    @model_validator(mode="after")
    def _reject_broken_storage_config(self) -> "Settings":
        """Từ chối khởi động khi cấu hình lưu ảnh chắc chắn sẽ vỡ.

        Vì sao chặn ở đây thay vì để nó tự lỗi: cấu hình storage sai KHÔNG làm
        backend chết lúc boot — nó chạy bình thường rồi vỡ đúng lúc một PT đang
        tải ảnh hồ sơ lên, với thông báo DefaultCredentialsError mà không ai
        hiểu. Sai cấu hình phải nổ lúc deploy, không phải lúc có người dùng.

        Cùng nguyên tắc đang áp cho SECRET_KEY ở validator bên trên.
        """
        backend = self.storage_backend.strip().lower()

        if backend not in ("local", "gcs"):
            raise ValueError(
                "STORAGE_BACKEND chỉ nhận 'local' hoặc 'gcs' (nhận được: %r)" % self.storage_backend
            )

        # gcs mà không có bucket thì mọi lần upload đều thất bại — đúng ở mọi
        # môi trường, không riêng production.
        if backend == "gcs" and not self.gcs_bucket_name.strip():
            raise ValueError(
                "STORAGE_BACKEND=gcs nhưng GCS_BUCKET_NAME trống. "
                "Điền tên bucket (terraform tạo sẵn: ptmatch-media-<env>), "
                "hoặc đặt STORAGE_BACKEND=local để lưu trên đĩa."
            )

        # KHÔNG chặn STORAGE_BACKEND=local ở production.
        #
        # Từng chặn, vì lúc đó docker-compose.prod.yml không mount volume nào cho
        # /app/media nên ảnh sẽ bay theo mỗi lần deploy. Volume `media_data` giờ
        # được mount vô điều kiện, nên `local` là lựa chọn hợp lệ — và là lựa
        # chọn chính khi tự host một server không dùng GCS.
        #
        # Cái còn lại đáng chặn là gcs thiếu bucket, ở trên.

        return self

    @model_validator(mode="after")
    def _reject_log_only_notify_channels_in_production(self) -> "Settings":
        """Từ chối khởi động production nếu kênh báo lead chỉ có 'log'.

        `log` không gửi gì cho ai — nó chỉ ghi log để sự kiện nhìn thấy được
        thay vì biến mất. Nhưng `LogChannel` trả `ok=True`
        (services/channels/log.py), nên `notify_new_lead` coi như đã gửi,
        `notification_deliveries` ghi `status='sent'`, và `lead_reminders` tiêu
        luôn `reminder_sent_at` — mọi thứ trông khoẻ trong khi không PT nào
        nhận được lead. Đây là cấu hình mặc định trong `.env.example`
        (dùng được cho dev), nhưng launch với nó ở production là im lặng vô
        hiệu hoá đúng tính năng sản phẩm hứa hẹn: PT liên hệ nhanh với lead.
        Cùng nguyên tắc "sai cấu hình phải nổ lúc deploy" như hai guard trên.
        """
        if self.environment != "production":
            return self
        real_channels = [c for c in self.notify_channel_list if c != "log"]
        if not real_channels:
            raise ValueError(
                "NOTIFY_CHANNELS chỉ có 'log' (hoặc rỗng) khi ENVIRONMENT=production "
                "— không PT nào thực sự nhận được thông báo lead. Thêm ít nhất một "
                "kênh thật trước 'log', ví dụ NOTIFY_CHANNELS=email,log (và điền "
                "SMTP_HOST/SMTP_USER/SMTP_PASSWORD)."
            )
        return self


settings = Settings()
