#!/usr/bin/env bash
# =============================================================================
# backup-to-local.sh — kéo backup từ server về MÁY CÁ NHÂN.
#
# CHẠY TRÊN MÁY BẠN, không phải trên server.
#
# Usage:
#   PTMATCH_SSH=ubuntu@123.45.67.89 bash scripts/backup-to-local.sh
#
# Vì sao chiều KÉO chứ không ĐẨY:
#   1. Máy cá nhân nằm sau NAT, server không kết nối vào được.
#   2. Quan trọng hơn: server KHÔNG giữ credential nào tới chỗ backup. Nếu server
#      bị chiếm, kẻ tấn công không xoá được bản backup của bạn. Với backup đẩy lên
#      object storage thì credential nằm trên server, nên chúng xoá được cả bản sao.
#
# ĐIỂM YẾU phải biết: script chỉ chạy khi máy bạn bật. Tắt máy một tuần là không
# có backup một tuần. Ở giai đoạn kiểm chứng thì chấp nhận được (DB còn rất nhỏ,
# chưa có người dùng thật), nhưng khi có dữ liệu thật thì cần thêm một lớp tự
# động không phụ thuộc máy cá nhân.
#
# ---------------------------------------------------------------------------
# Hẹn giờ trên Windows + WSL2
#
# KHÔNG dùng crontab trong WSL2: WSL2 không chạy cron theo mặc định, bạn sẽ đặt
# crontab rồi thấy nó im lặng không chạy và không có gì báo lỗi.
#
# Dùng Task Scheduler của Windows (chạy được cả khi chưa mở terminal WSL):
#   1. Task Scheduler -> Create Task
#   2. Triggers: Daily, giờ nào máy thường đang bật
#   3. Actions -> Start a program:
#        Program:   wsl.exe
#        Arguments: -d Ubuntu -- bash -lc "PTMATCH_SSH=ubuntu@IP bash /var/www/html/ptmatch/scripts/backup-to-local.sh"
#   4. Settings -> tích "Run task as soon as possible after a scheduled start is
#      missed" — để lần tắt máy không làm mất hẳn một ngày backup
# =============================================================================
set -euo pipefail

SSH_TARGET="${PTMATCH_SSH:-}"
REMOTE_DIR="${PTMATCH_REMOTE_DIR:-/var/www/html/ptmatch}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/ptmatch-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
COMPOSE_FILE="docker-compose.yml"

# Sàn kích thước, CỐ Ý đặt rất thấp.
#
# Ngưỡng này chỉ để bắt file gzip hợp lệ nhưng rỗng ruột (pg_dump thoát 0 mà
# không ghi gì, hoặc đĩa đầy giữa lúc ghi). Nó KHÔNG phải phép kiểm nội dung —
# việc đó do phép kiểm CREATE TABLE bên dưới làm.
#
# Đo thực tế: dump schema-only của DB rỗng hoàn toàn nén lại chỉ 3.6KB. Đặt
# ngưỡng 10KB như bản đầu sẽ báo lỗi oan trên một DB mới hợp lệ.
MIN_DUMP_BYTES="${MIN_DUMP_BYTES:-1024}"

log() { echo "[backup-to-local $(date '+%F %T')] $*"; }
die() { echo "[backup-to-local] LỖI: $*" >&2; exit 1; }

[[ -n "${SSH_TARGET}" ]] || die "Chưa đặt PTMATCH_SSH (ví dụ: ubuntu@123.45.67.89)"

STAMP="$(date +%F)"
DB_DIR="${BACKUP_DIR}/db"
ENV_DIR="${BACKUP_DIR}/env"
MEDIA_DIR="${BACKUP_DIR}/media"
mkdir -p "${DB_DIR}" "${ENV_DIR}" "${MEDIA_DIR}"
# Chứa .env (mật khẩu DB, SECRET_KEY) và SĐT học viên trong dump — không để ai
# khác trên máy đọc được, và đừng đặt BACKUP_DIR trong thư mục đồng bộ cloud.
chmod 700 "${BACKUP_DIR}" "${DB_DIR}" "${ENV_DIR}"

remote() { ssh -o BatchMode=yes -o ConnectTimeout=15 "${SSH_TARGET}" "$@"; }

log "Kiểm tra kết nối tới ${SSH_TARGET}..."
remote "test -f ${REMOTE_DIR}/${COMPOSE_FILE}" \
  || die "Không thấy ${REMOTE_DIR}/${COMPOSE_FILE} (sai host, sai PTMATCH_REMOTE_DIR, hoặc SSH key chưa cài?)"

# ---- 1. Dump database ------------------------------------------------------
# Đọc user/db từ .env trên server, không đoán.
PG_USER="$(remote "grep -E '^POSTGRES_USER=' ${REMOTE_DIR}/.env | tail -n1 | cut -d= -f2- | tr -d '[:space:]'")"
PG_DB="$(remote "grep -E '^POSTGRES_DB=' ${REMOTE_DIR}/.env | tail -n1 | cut -d= -f2- | tr -d '[:space:]'")"
PG_DB="${PG_DB:-ptmatch}"
[[ -n "${PG_USER}" ]] || die "Không đọc được POSTGRES_USER từ ${REMOTE_DIR}/.env"

DUMP_FILE="${DB_DIR}/ptmatch-${STAMP}.sql.gz"
log "Dump database '${PG_DB}' (nén phía server rồi truyền về)..."
# gzip NGAY trên server: giảm băng thông, và pipe qua ssh nên dump không bao giờ
# nằm trên đĩa server dưới dạng thô.
set +e
remote "cd ${REMOTE_DIR} && docker compose -f ${COMPOSE_FILE} exec -T db \
  pg_dump -U '${PG_USER}' --no-owner --clean --if-exists '${PG_DB}' | gzip -9" > "${DUMP_FILE}"
PIPE_STATUS=("${PIPESTATUS[@]}")
set -e
[[ "${PIPE_STATUS[0]}" -eq 0 ]] || { rm -f "${DUMP_FILE}"; die "pg_dump qua ssh thất bại (mã ${PIPE_STATUS[0]})"; }

# ---- 2. Verify dump -------------------------------------------------------
# Backup không kiểm tra thì chỉ là một file: dump cụt vẫn "thành công" và nằm đó
# hàng tháng cho tới lúc restore mới biết là vô dụng.
gzip -t "${DUMP_FILE}" 2>/dev/null || { rm -f "${DUMP_FILE}"; die "file gzip hỏng"; }

BYTES="$(stat -c %s "${DUMP_FILE}")"
[[ "${BYTES}" -ge "${MIN_DUMP_BYTES}" ]] \
  || { rm -f "${DUMP_FILE}"; die "dump chỉ ${BYTES} bytes (< ${MIN_DUMP_BYTES}) — gần như chắc chắn rỗng/cụt"; }

zcat "${DUMP_FILE}" | grep -q "CREATE TABLE" \
  || { rm -f "${DUMP_FILE}"; die "dump không chứa CREATE TABLE nào — không restore được"; }

log "Dump OK: $(du -h "${DUMP_FILE}" | cut -f1) (${BYTES} bytes), đã verify."

# ---- 3. Media -------------------------------------------------------------
# docker-compose.yml mount ./media bằng bind mount nên có đường dẫn thật
# trên host để rsync. KHÔNG dùng --delete: file bị xoá trên server (do lỗi hoặc
# do phá hoại) không được kéo theo bản sao ở đây — đó là lý do có backup.
if remote "test -d ${REMOTE_DIR}/media"; then
  log "Đồng bộ ảnh (rsync incremental, không xoá file phía local)..."
  rsync -az --info=stats2 "${SSH_TARGET}:${REMOTE_DIR}/media/" "${MEDIA_DIR}/" 2>&1 | tail -3 || \
    log "CẢNH BÁO: rsync media thất bại — dump DB vẫn đã lấy được."
else
  log "Server không có ${REMOTE_DIR}/media (đang dùng GCS?) — bỏ qua phần ảnh."
fi

# ---- 4. .env --------------------------------------------------------------
# Không có .env thì không restore được: mật khẩu DB và SECRET_KEY nằm trong đó.
log "Lấy .env..."
remote "cat ${REMOTE_DIR}/.env" > "${ENV_DIR}/env-${STAMP}" && chmod 600 "${ENV_DIR}/env-${STAMP}"

# ---- 5. Retention ---------------------------------------------------------
# Snapshot theo NGÀY, không ghi đè một file duy nhất: nếu DB lỗi thì bản ghi đè
# sẽ chôn luôn bản tốt cuối cùng.
log "Xoá bản cũ hơn ${RETENTION_DAYS} ngày..."
find "${DB_DIR}" -name 'ptmatch-*.sql.gz' -mtime "+${RETENTION_DAYS}" -delete
find "${ENV_DIR}" -name 'env-*' -mtime "+${RETENTION_DAYS}" -delete

log "Hoàn tất. Thư mục: ${BACKUP_DIR}"
log "  dump DB : $(find "${DB_DIR}" -name '*.sql.gz' | wc -l) bản"
log "  ảnh     : $(find "${MEDIA_DIR}" -type f 2>/dev/null | wc -l) file"
log ""
log "Thử restore (NÊN làm một lần để biết quy trình chạy được):"
log "  createdb ptmatch_restore_test"
log "  zcat ${DUMP_FILE} | psql ptmatch_restore_test"
