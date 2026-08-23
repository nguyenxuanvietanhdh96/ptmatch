"""Storage backends for media upload: GCS signed URLs or local dev storage."""
import os
import re
import threading
import uuid
from datetime import timedelta
from typing import Dict

from app.core.config import settings

# Whitelist tường minh, KHÔNG dùng prefix match (từng là "image/"/"video/" —
# thoả cả "image/svg+xml", mà SVG chạy được <script>). Đuôi file lấy từ bảng
# này, không bao giờ lấy từ tên file client gửi lên: file phục vụ same-origin
# qua StaticFiles ở STORAGE_BACKEND=local, Content-Type nó trả về suy từ đuôi
# — client tự đặt đuôi .html/.svg là tự chọn luôn Content-Type khi phục vụ lại,
# bất kể header PUT khai là gì.
CONTENT_TYPE_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10MB

# Safe object key: path segments of [a-zA-Z0-9._-], no leading dot per segment.
KEY_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]*(?:/[a-zA-Z0-9][a-zA-Z0-9._-]*)*$")


def is_allowed_content_type(content_type: str) -> bool:
    return content_type.lower().strip() in CONTENT_TYPE_EXTENSIONS


def is_safe_key(key: str) -> bool:
    return bool(KEY_RE.match(key)) and ".." not in key and len(key) <= 300


def extension_matches_content_type(key: str, content_type: str) -> bool:
    """True if `key`'s extension is exactly the one that content type maps to.

    Content-type is validated separately (`is_allowed_content_type`); this
    stops a caller from declaring an allowed type but writing under a
    different extension (e.g. `.html`) that a static file server would later
    serve with its own, attacker-chosen Content-Type.
    """
    expected = CONTENT_TYPE_EXTENSIONS.get(content_type.lower().strip())
    return expected is not None and key.endswith(expected)


def build_object_key(user_id: str, content_type: str) -> str:
    ext = CONTENT_TYPE_EXTENSIONS[content_type.lower().strip()]
    return "uploads/%s/%s%s" % (user_id, uuid.uuid4().hex, ext)


def key_belongs_to(key: str, user_id: str) -> bool:
    """True if `key` sits in the caller's own upload prefix.

    Keys are unguessable (a uuid4 hex), but this stops an authenticated user
    from writing into — or overwriting — another user's prefix.
    """
    return key.startswith("uploads/%s/" % user_id)


_gcs_client = None
_gcs_client_lock = threading.Lock()


def _get_gcs_client():
    """Client GCS dùng chung cho cả tiến trình.

    Dựng client tốn một vòng phân giải credentials (đọc metadata server trên
    GCE), nên tạo mới mỗi request là trả cái giá đó cho mọi lần upload. Lock để
    hai request đầu tiên chạy song song không tạo ra hai client.
    """
    global _gcs_client
    if _gcs_client is None:
        with _gcs_client_lock:
            if _gcs_client is None:
                from google.cloud import storage  # lazy: dev local không cần

                _gcs_client = storage.Client(project=settings.gcp_project_id or None)
    return _gcs_client


# GCS bỏ qua MAX_UPLOAD_BYTES của local storage vì client PUT thẳng lên GCS,
# không qua route nào của ta để đếm byte — thiếu header này thì presign V4
# chỉ giới hạn được content-type, không giới hạn được dung lượng.
_GCS_LENGTH_RANGE_HEADER = "x-goog-content-length-range"
_GCS_LENGTH_RANGE_VALUE = "0,%d" % MAX_UPLOAD_BYTES


def presign_gcs(key: str, content_type: str) -> Dict[str, str]:
    """Generate a V4 signed PUT URL on GCS (15 minutes).

    ĐỒNG BỘ và có chặn: ký V4 bằng credentials mặc định trên GCE phải gọi IAM
    signBlob qua mạng. Gọi thẳng từ route async sẽ đứng cả event loop, nên
    route phải bọc qua run_in_threadpool (xem app/api/upload.py).
    """
    client = _get_gcs_client()
    bucket = client.bucket(settings.gcs_bucket_name)
    blob = bucket.blob(key)
    upload_url = blob.generate_signed_url(
        version="v4",
        expiration=timedelta(minutes=15),
        method="PUT",
        content_type=content_type,
        headers={_GCS_LENGTH_RANGE_HEADER: _GCS_LENGTH_RANGE_VALUE},
    )
    if settings.cdn_base_url:
        public_url = "%s/%s" % (settings.cdn_base_url.rstrip("/"), key)
    else:
        public_url = "https://storage.googleapis.com/%s/%s" % (
            settings.gcs_bucket_name,
            key,
        )
    return {
        "upload_url": upload_url,
        "public_url": public_url,
        # Phải có mặt trong request PUT thật, đúng giá trị đã ký ở trên —
        # thiếu hoặc sai thì GCS từ chối cả những lượt tải hợp lệ.
        _GCS_LENGTH_RANGE_HEADER: _GCS_LENGTH_RANGE_VALUE,
    }


def local_media_path(key: str) -> str:
    """Absolute filesystem path for a validated local media key."""
    root = os.path.abspath(settings.local_media_dir)
    path = os.path.abspath(os.path.join(root, key))
    if not path.startswith(root + os.sep):
        raise ValueError("Path traversal detected")
    return path
