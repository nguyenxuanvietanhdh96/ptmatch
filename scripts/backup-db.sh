#!/usr/bin/env bash
# =============================================================================
# backup-db.sh — pg_dump từ container db -> gzip -> lưu tại chỗ, và đẩy thêm
# lên GCS khi kịch bản triển khai dùng nó (DEPLOY_MODE=pull).
#
# Trước đây script này CHỈ biết đẩy lên GCS và LỖI CỨNG nếu thiếu gsutil/bucket.
# Đúng với kịch bản GCE (DEPLOY_MODE=pull, có Artifact Registry + bucket), SAI
# với kịch bản VPS/Oracle Free Tier (DEPLOY_MODE=build) — nơi không có gsutil và
# không có bucket, nên cron 2AM fail MỖI ĐÊM mà chỉ file log/syslog biết, không
# ai theo dõi cho tới lúc cần restore và phát hiện ra không có bản nào.
#
# Giờ dump luôn xuống đĩa server trước — đủ để restore sau một migration hỏng,
# và là thứ scripts/backup-to-local.sh kéo đi máy khác. Đẩy lên GCS chỉ là một
# chặng THÊM khi DEPLOY_MODE=pull.
#
# Chạy trên server. Cài cron daily 2AM (setup-server.sh đã tự cài):
#   0 2 * * * root /opt/ptmatch/scripts/backup-db.sh >> /var/log/ptmatch-backup.log 2>&1
# =============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/ptmatch}"
COMPOSE_FILE="docker-compose.prod.yml"
BACKUP_DIR="${BACKUP_DIR:-${APP_DIR}/backups/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
MIN_BYTES="${MIN_BACKUP_BYTES:-1024}"

log() { echo "[backup-db $(date '+%F %T')] $*"; }

cd "${APP_DIR}"

env_get() { grep -E "^${1}=" .env | tail -n1 | cut -d= -f2- | tr -d '[:space:]'; }

POSTGRES_USER="${POSTGRES_USER:-$(env_get POSTGRES_USER)}"
POSTGRES_DB="${POSTGRES_DB:-$(env_get POSTGRES_DB)}"
POSTGRES_DB="${POSTGRES_DB:-ptmatch}"
DEPLOY_MODE="${DEPLOY_MODE:-$(env_get DEPLOY_MODE)}"
DEPLOY_MODE="${DEPLOY_MODE:-build}"

mkdir -p "${BACKUP_DIR}"
# Dump chứa SĐT học viên và dữ liệu người dùng — không để world-readable.
chmod 700 "${BACKUP_DIR}"

STAMP="$(date +%F)"
LOCAL_FILE="${BACKUP_DIR}/${STAMP}.sql.gz"

# ---- 1. Dump + verify, luôn xuống đĩa server trước -------------------------
log "Dump database '${POSTGRES_DB}' từ container db vào ${LOCAL_FILE}..."
# PIPESTATUS: không có nó thì pg_dump chết giữa chừng vẫn cho ra file .gz hợp lệ
# (rỗng hoặc cụt) và `set -e` không bắt được, vì mã thoát của pipe là của gzip.
set +e
docker compose -f "${COMPOSE_FILE}" exec -T db \
  pg_dump -U "${POSTGRES_USER}" --no-owner --clean --if-exists "${POSTGRES_DB}" \
  | gzip > "${LOCAL_FILE}"
DUMP_STATUS=("${PIPESTATUS[@]}")
set -e

if [[ "${DUMP_STATUS[0]}" -ne 0 || "${DUMP_STATUS[1]}" -ne 0 ]]; then
  log "LỖI: pg_dump/gzip thất bại (mã thoát: ${DUMP_STATUS[*]}). Không giữ file hỏng."
  rm -f "${LOCAL_FILE}"
  exit 1
fi

# Kiểm tra tính toàn vẹn trước khi coi là xong. Một dump cụt vẫn "thành công"
# và nằm đó hàng tháng cho tới lúc restore mới biết là vô dụng.
if ! gzip -t "${LOCAL_FILE}" 2>/dev/null; then
  log "LỖI: file gzip hỏng."
  rm -f "${LOCAL_FILE}"
  exit 1
fi

BYTES="$(stat -c %s "${LOCAL_FILE}")"
# Sàn rất thấp, cố ý: chỉ bắt file gzip rỗng ruột, không phải kiểm nội dung.
# Đo thực tế: dump schema-only của DB rỗng nén lại chỉ 3.6KB.
if [[ "${BYTES}" -lt "${MIN_BYTES}" ]]; then
  log "LỖI: dump chỉ ${BYTES} bytes (< ${MIN_BYTES}) — gần như chắc chắn là dump rỗng/cụt."
  rm -f "${LOCAL_FILE}"
  exit 1
fi

if ! zcat "${LOCAL_FILE}" | grep -q "CREATE TABLE"; then
  log "LỖI: dump không chứa CREATE TABLE nào — nội dung không dùng để restore được."
  rm -f "${LOCAL_FILE}"
  exit 1
fi

SIZE="$(du -h "${LOCAL_FILE}" | cut -f1)"
log "Dump xong (${SIZE}, ${BYTES} bytes), đã verify tại ${LOCAL_FILE}."

# Dump nằm trên CÙNG đĩa với Postgres/media — giữ mãi không xoá là tự làm đầy
# đĩa của chính mình. 14 ngày là đủ cho "restore sau một migration hỏng phát
# hiện chậm"; bản sao ngoài server (offsite) là việc của backup-to-local.sh
# hoặc bước đẩy GCS bên dưới, không phải của thư mục này.
find "${BACKUP_DIR}" -name '*.sql.gz' -mtime "+${RETENTION_DAYS}" -delete

# ---- 2. Đẩy thêm lên GCS khi kịch bản triển khai dùng nó -------------------
# DEPLOY_MODE=pull ngụ ý GCE + Artifact Registry (xem scripts/setup-server.sh),
# và đó cũng là kịch bản có bucket GCS thật. DEPLOY_MODE=build (VPS/Oracle Free
# Tier) không có gì để đẩy tới — dump vừa xác nhận ở trên CHÍNH LÀ bản backup,
# không phải một nửa việc còn thiếu.
if [[ "${DEPLOY_MODE}" != "pull" ]]; then
  log "DEPLOY_MODE=${DEPLOY_MODE} — không đẩy GCS. Bản backup là ${LOCAL_FILE}."
  log "Kéo nó ra khỏi server bằng scripts/backup-to-local.sh (khuyến nghị chạy định kỳ)."
  exit 0
fi

if ! command -v gsutil >/dev/null 2>&1; then
  log "LỖI: DEPLOY_MODE=pull nhưng không có gsutil trên máy này."
  exit 1
fi

ENVIRONMENT="${ENVIRONMENT:-$(env_get ENVIRONMENT)}"
case "${ENVIRONMENT}" in
  production | prod) ENV_SUFFIX="prod" ;;
  development | dev) ENV_SUFFIX="dev" ;;
  *)
    log "LỖI: ENVIRONMENT='${ENVIRONMENT:-<trống>}' không hợp lệ (cần production hoặc development)."
    log "Sửa ENVIRONMENT trong ${APP_DIR}/.env, hoặc set BACKUP_BUCKET tường minh."
    exit 1
    ;;
esac

BACKUP_BUCKET="${BACKUP_BUCKET:-gs://ptmatch-backups-${ENV_SUFFIX}}"
REMOTE_PATH="${BACKUP_BUCKET}/postgres/${STAMP}.sql.gz"

if ! gsutil ls -b "${BACKUP_BUCKET}" >/dev/null 2>&1; then
  log "LỖI: không truy cập được bucket ${BACKUP_BUCKET} (không tồn tại hoặc thiếu quyền)."
  log "Dump vẫn còn nguyên ở ${LOCAL_FILE} — không mất bản backup của đêm nay."
  exit 1
fi

log "Đẩy lên ${REMOTE_PATH}..."
gsutil -q cp "${LOCAL_FILE}" "${REMOTE_PATH}"

# Xác nhận file thật sự nằm trên GCS với đúng kích thước.
REMOTE_BYTES="$(gsutil du "${REMOTE_PATH}" 2>/dev/null | awk '{print $1}')"
if [[ "${REMOTE_BYTES}" != "${BYTES}" ]]; then
  log "LỖI: kích thước trên GCS (${REMOTE_BYTES:-<không đọc được>}) khác file local (${BYTES})."
  log "Dump local ${LOCAL_FILE} vẫn còn — không mất bản backup của đêm nay."
  exit 1
fi

log "Backup hoàn tất: ${REMOTE_PATH} (${SIZE}, đã verify; bản local vẫn giữ ở ${LOCAL_FILE})."
