"""Các guard từ chối khởi động khi cấu hình chắc chắn sẽ vỡ.

Nguyên tắc chung của cả file: **sai cấu hình phải nổ lúc deploy, không phải lúc
có người dùng thật.** Một backend khởi động bình thường rồi vỡ đúng lúc PT tải
ảnh hồ sơ lên là kiểu hỏng tệ nhất — người dùng thấy lỗi vô nghĩa, còn người vận
hành không biết mình đã cấu hình sai từ lúc nào.

Vì thế các guard này được kiểm thử: chúng là hợp đồng, không phải tiện ích.
"""
import pytest
from pydantic import ValidationError

from app.core.config import Settings

# secret_key hợp lệ cho mọi trường hợp thử — để guard đang test không bị guard
# secret_key chặn trước.
VALID_SECRET = "x" * 40


def build(**overrides) -> Settings:
    return Settings(secret_key=VALID_SECRET, **overrides)


class TestSecretKeyGuard:
    def test_production_rejects_placeholder_secret(self):
        with pytest.raises(ValidationError, match="SECRET_KEY"):
            Settings(environment="production", secret_key="dev-secret-change-me")

    def test_production_rejects_short_secret(self):
        with pytest.raises(ValidationError, match="SECRET_KEY"):
            Settings(environment="production", secret_key="ngan-qua")

    def test_development_tolerates_weak_secret(self):
        """Dev phải chạy được ngay sau khi clone, không cần sinh khoá."""
        assert Settings(environment="development", secret_key="dev-secret-change-me")


class TestStorageGuard:
    def test_gcs_without_bucket_is_rejected_in_any_environment(self):
        """Không riêng production: gcs thiếu bucket thì mọi lần upload đều thất bại."""
        for env in ("development", "production"):
            with pytest.raises(ValidationError, match="GCS_BUCKET_NAME"):
                build(environment=env, storage_backend="gcs", gcs_bucket_name="")

    def test_gcs_with_bucket_is_accepted(self):
        settings = build(storage_backend="gcs", gcs_bucket_name="ptmatch-media-prod")
        assert settings.gcs_bucket_name == "ptmatch-media-prod"

    def test_bucket_of_only_whitespace_counts_as_empty(self):
        """'   ' trong .env là lỗi gõ, không phải tên bucket."""
        with pytest.raises(ValidationError, match="GCS_BUCKET_NAME"):
            build(storage_backend="gcs", gcs_bucket_name="   ")

    def test_local_storage_is_allowed_in_production(self):
        """Từng bị chặn, và việc bỏ chặn là có chủ ý.

        Lý do chặn cũ: docker-compose.prod.yml không mount volume cho
        /app/media nên ảnh bay theo mỗi lần deploy. Volume `media_data` giờ được
        mount vô điều kiện, nên `local` là lựa chọn hợp lệ — và là lựa chọn chính
        khi tự host một server không dùng GCS.
        """
        settings = build(
            environment="production", storage_backend="local", notify_channels="email,log"
        )
        assert settings.storage_backend == "local"

    def test_local_storage_is_the_normal_case_in_development(self):
        assert build(environment="development", storage_backend="local")

    def test_unknown_storage_backend_is_rejected(self):
        """Gõ sai tên backend phải chặn ngay, không âm thầm rơi về nhánh local."""
        with pytest.raises(ValidationError, match="STORAGE_BACKEND"):
            build(storage_backend="s3")


class TestNotifyChannelsGuard:
    def test_production_rejects_log_only_default(self):
        """'log' ghi có vẻ 'sent' mà không PT nào thực sự nhận được lead."""
        with pytest.raises(ValidationError, match="NOTIFY_CHANNELS"):
            build(environment="production", notify_channels="log")

    def test_production_rejects_empty_notify_channels(self):
        with pytest.raises(ValidationError, match="NOTIFY_CHANNELS"):
            build(environment="production", notify_channels="")

    def test_production_accepts_a_real_channel_ahead_of_log(self):
        settings = build(environment="production", notify_channels="email,log")
        assert settings.notify_channel_list == ["email", "log"]

    def test_development_tolerates_log_only(self):
        """Dev phải chạy được ngay sau khi clone, không cần cấu hình SMTP."""
        assert build(environment="development", notify_channels="log")
