#!/usr/bin/env bash
# =============================================================================
# deploy.sh — chạy trên GCE instance để deploy phiên bản mới. Idempotent.
#
# Nguồn image do DEPLOY_MODE quyết định (đặt trong .env, mặc định `pull`):
#
#   DEPLOY_MODE=pull   — lấy image từ registry. Có CI đẩy ảnh lên thì dùng cái này.
#       CI/CD:     BACKEND_IMAGE=<ref> FRONTEND_IMAGE=<ref> bash scripts/deploy.sh
#       Cũ (AR):   IMAGE_TAG=<short_sha> bash scripts/deploy.sh
#       Thủ công:  bash scripts/deploy.sh   (dùng BACKEND_IMAGE/FRONTEND_IMAGE trong .env)
#
#   DEPLOY_MODE=build  — build ngay trên server từ code trong APP_DIR.
#       Dùng cho kịch bản MỘT SERVER không có registry (VPS, Oracle Free Tier).
#       Cần ~2GB RAM trống lúc build Next.js; máy 2GB nên bật swap.
#
# Bản mới không healthy thì script TỰ ĐƯA SITE VỀ ảnh đang chạy trước đó rồi
# thoát khác 0 (deploy thất bại, site vẫn sống). Đặt AUTO_ROLLBACK=0 để giữ
# nguyên trạng thái hỏng mà mổ xẻ — chỉ nên dùng khi đang gỡ lỗi tại chỗ.
# =============================================================================
set -euo pipefail

# APP_DIR suy từ vị trí của chính script này (scripts/ nằm ngay dưới thư mục
# repo), nên deploy chạy đúng dù code đặt ở /opt/ptmatch hay chỗ khác — không
# còn đường dẫn cứng nào phải nhớ sửa. Env vẫn ghi đè được nếu cần.
APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
# Tường minh `-f docker-compose.yml` chứ không để Compose tự nạp: khi có `-f`,
# Compose KHÔNG merge docker-compose.override.yml. Nhờ vậy một file override dev
# bỏ quên trên server cũng không lọt được vào production.
COMPOSE_FILE="docker-compose.yml"
# nginx mang `profiles: ["prod"]` trong base nên chỉ lên khi profile này bật.
export COMPOSE_PROFILES=prod
IMAGE_TAG="${IMAGE_TAG:-}"
AR_REGION="${AR_REGION:-asia-southeast1}"
AR_REPO="${AR_REPO:-ptmatch}"

log() { echo "[deploy $(date '+%F %T')] $*"; }

cd "${APP_DIR}"

if [[ ! -f .env ]]; then
  echo "Thiếu ${APP_DIR}/.env — chạy scripts/setup-server.sh trước." >&2
  exit 1
fi

# Chặn deploy khi .env còn placeholder (mật khẩu DB dev, SECRET_KEY mẫu,
# SITE_URL localhost). Xem lý do file này tồn tại ở đầu lib-require-env.sh.
source "${APP_DIR}/scripts/lib-require-env.sh"
if [[ "${SKIP_ENV_CHECK:-0}" != "1" ]]; then
  require_prod_env || exit 1
fi

# ---- Backup trước khi áp migration mới -------------------------------------
# entrypoint.sh chạy `alembic upgrade head` NGAY LÚC container backend mới lên
# (không phải một bước tách riêng ta có thể chặn trước). Backup cron gần nhất
# có thể cách tới ~22h; một migration hỏng ở giữa đó thì điểm phục hồi mới nhất
# lại là TRƯỚC lúc deploy này. Dump ngay ở đây đảm bảo luôn có bản backup mới
# hơn bản deploy đang chạy, mà không cần đợi cron.
SKIP_PRE_DEPLOY_BACKUP="${SKIP_PRE_DEPLOY_BACKUP:-0}"
PRE_DEPLOY_BACKUP=""
if [[ "${SKIP_PRE_DEPLOY_BACKUP}" == "1" ]]; then
  log "SKIP_PRE_DEPLOY_BACKUP=1 — bỏ qua backup trước deploy."
elif [[ -z "$(docker compose -f "${COMPOSE_FILE}" ps -q db 2>/dev/null)" ]]; then
  log "Container db chưa chạy (lần deploy đầu?) — bỏ qua backup trước deploy."
else
  log "Backup DB trước khi deploy..."
  if ! bash "${APP_DIR}/scripts/backup-db.sh"; then
    echo "[deploy] LỖI: backup trước deploy thất bại — dừng lại, KHÔNG áp migration" >&2
    echo "mới mà thiếu điểm phục hồi mới. Chạy lại với SKIP_PRE_DEPLOY_BACKUP=1 nếu" >&2
    echo "chấp nhận rủi ro này (ví dụ: đã biết trước vì sao backup đang lỗi)." >&2
    exit 1
  fi
  # File mới nhất trong thư mục backup chính là bản vừa dump. Thông báo rollback
  # cần trỏ được vào MỘT file cụ thể — lúc đó người đọc đang xử lý sự cố, không
  # phải lúc để họ đi tìm.
  PRE_DEPLOY_BACKUP="$(ls -1t "${APP_DIR}/backups/postgres/"*.sql.gz 2>/dev/null | head -n1 || true)"
fi

if [[ -n "${BACKEND_IMAGE:-}" || -n "${FRONTEND_IMAGE:-}" ]]; then
  # Caller đưa thẳng image reference đầy đủ (CI dùng registry nào là việc của
  # CI: GHCR, Docker Hub, Artifact Registry...). Không suy diễn đường dẫn ở đây
  # thì deploy.sh không bị buộc vào một nhà cung cấp registry nào.
  export BACKEND_IMAGE FRONTEND_IMAGE
  log "Deploy theo image chỉ định sẵn:"
  log "  BACKEND_IMAGE=${BACKEND_IMAGE:-<không đặt, dùng mặc định trong compose>}"
  log "  FRONTEND_IMAGE=${FRONTEND_IMAGE:-<không đặt, dùng mặc định trong compose>}"
elif [[ -n "${IMAGE_TAG}" ]]; then
  # Đường cũ: chỉ có tag, tự ghép đường dẫn Artifact Registry. Giữ lại để lệnh
  # gõ tay và tài liệu cũ không gãy.
  # Lấy GCP_PROJECT_ID từ env hoặc .env
  GCP_PROJECT_ID="${GCP_PROJECT_ID:-$(grep -E '^GCP_PROJECT_ID=' .env | tail -n1 | cut -d= -f2- | tr -d '[:space:]')}"
  if [[ -z "${GCP_PROJECT_ID}" ]]; then
    echo "Không xác định được GCP_PROJECT_ID (env hoặc .env)." >&2
    exit 1
  fi

  export BACKEND_IMAGE="${AR_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${AR_REPO}/backend:${IMAGE_TAG}"
  export FRONTEND_IMAGE="${AR_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${AR_REPO}/frontend:${IMAGE_TAG}"
  log "Deploy theo IMAGE_TAG=${IMAGE_TAG}"
  log "  BACKEND_IMAGE=${BACKEND_IMAGE}"
  log "  FRONTEND_IMAGE=${FRONTEND_IMAGE}"
else
  if [[ -d .git ]]; then
    log "Không có IMAGE_TAG — git pull để cập nhật code/config..."
    git pull --ff-only
  else
    log "Không có IMAGE_TAG và không phải git repo — dùng image trong .env."
  fi
fi

# ---- Ghi lại ảnh đang chạy, để rollback được nếu bản mới không healthy ------
# Lưu IMAGE ID (sha256), KHÔNG lưu tag: ở DEPLOY_MODE=build cả bản cũ lẫn bản
# mới đều mang tag `ptmatch-*:latest`, nên rollback theo tag sẽ dựng lại đúng
# bản vừa hỏng. ID trỏ chính xác một ảnh nên dùng được cho cả hai chế độ.
#
# Phải chạy TRƯỚC `up -d` — sau đó thì container cũ không còn để hỏi nữa.
running_image_id() {
  local service="$1" cid
  cid="$(docker compose -f "${COMPOSE_FILE}" ps -q "${service}" 2>/dev/null | head -n1)"
  if [[ -z "${cid}" ]]; then
    return 0
  fi
  docker inspect --format '{{.Image}}' "${cid}" 2>/dev/null || true
}

PREV_BACKEND_IMAGE_ID="$(running_image_id backend)"
PREV_FRONTEND_IMAGE_ID="$(running_image_id frontend)"
if [[ -n "${PREV_BACKEND_IMAGE_ID}" || -n "${PREV_FRONTEND_IMAGE_ID}" ]]; then
  log "Phiên bản đang chạy (mốc rollback): backend=${PREV_BACKEND_IMAGE_ID:0:19} frontend=${PREV_FRONTEND_IMAGE_ID:0:19}"
else
  log "Chưa có service nào đang chạy — deploy này KHÔNG có mốc để rollback."
fi

# DEPLOY_MODE quyết định image ở đâu ra. KHÔNG bao giờ để Compose tự chọn.
#
#   pull  (mặc định) — lấy image đã build sẵn từ registry (Artifact Registry,
#                      GHCR...). Dùng khi có CI build ảnh.
#   build            — build ngay trên server từ code trong ${APP_DIR}. Dùng khi
#                      chỉ có một server và không có registry (VPS/Oracle).
#
# Vì sao phải tường minh: docker-compose.yml khai báo cả `image:` lẫn
# `build:`. Nếu để Compose tự xử, `pull` sẽ âm thầm bỏ qua service buildable rồi
# `up` build lại từ code cũ trên server — deploy báo thành công trong khi chạy
# code cũ. `--no-build` ở chế độ pull là thứ chặn đúng việc đó.
DEPLOY_MODE="${DEPLOY_MODE:-$(grep -E '^DEPLOY_MODE=' .env 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d '[:space:]')}"
DEPLOY_MODE="${DEPLOY_MODE:-pull}"

case "${DEPLOY_MODE}" in
  pull)
    log "DEPLOY_MODE=pull — lấy image từ registry..."
    docker compose -f "${COMPOSE_FILE}" pull
    log "Khởi động/cập nhật services (KHÔNG build)..."
    docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans --no-build
    ;;
  build)
    if [[ -n "${IMAGE_TAG}" ]]; then
      echo "DEPLOY_MODE=build không dùng chung với IMAGE_TAG (tag chỉ có nghĩa với registry)." >&2
      exit 1
    fi
    # `next build` chạy NGAY TRONG bước `docker compose build` dưới đây, không
    # phải trong container đã lên — mem_limit đặt cho service frontend trong
    # docker-compose.yml KHÔNG che được giai đoạn này. Trên máy 2GB không
    # có swap, OOM killer có thể hạ Postgres (đang chạy song song) giữa lúc
    # build, và service bị hạ không nhất thiết là frontend.
    if ! swapon --show 2>/dev/null | grep -q .; then
      log "CẢNH BÁO: không thấy swap nào đang bật. 'next build' (DEPLOY_MODE=build)"
      log "có thể cần tới ~2GB RAM; trên máy ít RAM, OOM killer có thể hạ Postgres"
      log "giữa lúc build. Bật swap trước khi deploy thật nếu máy có ít RAM."
    fi

    # --pull để base image (python:3.12-slim, node:22-alpine...) được cập nhật,
    # không dùng bản cũ nằm sẵn trên máy.
    log "DEPLOY_MODE=build — build trên server..."
    docker compose -f "${COMPOSE_FILE}" build --pull
    log "Khởi động/cập nhật services..."
    docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans
    ;;
  *)
    echo "DEPLOY_MODE không hợp lệ: '${DEPLOY_MODE}' (chỉ nhận 'pull' hoặc 'build')." >&2
    exit 1
    ;;
esac

# nginx phân giải tên `backend`/`frontend` một lần lúc load config và nhớ luôn
# IP đó. `up -d` vừa tạo container mới với IP mới, nên không reload thì nginx
# tiếp tục proxy vào IP đã chết -> 502 toàn site cho tới khi có người restart tay.
log "Reload nginx (container backend/frontend vừa đổi IP)..."
docker compose -f "${COMPOSE_FILE}" restart nginx

# Health check: deploy chỉ được coi là xong khi service thực sự trả lời. Không
# có bước này thì một migration hỏng hay image lỗi vẫn báo "Deploy xong".
#
# Gọi từ TRONG container nginx: kiểm tra luôn cả việc nginx phân giải được tên
# service sau khi restart, chứ không chỉ kiểm tra service còn sống — đúng cái
# lỗi mà lệnh `restart nginx` ở trên tồn tại để tránh.
wait_healthy() {
  local service="$1" url="$2"
  log "Chờ ${service} healthy..."
  for _ in $(seq 1 30); do
    if docker compose -f "${COMPOSE_FILE}" exec -T nginx \
        wget -q -O /dev/null "${url}" 2>/dev/null; then
      log "${service} healthy."
      return 0
    fi
    sleep 2
  done

  log "LỖI: ${service} không trả lời ${url} sau 60s. Log 50 dòng cuối:"
  docker compose -f "${COMPOSE_FILE}" logs --tail=50 "${service}" >&2 || true
  return 1
}

# Kiểm cả hai service. Frontend trước đây KHÔNG được kiểm: một image frontend
# hỏng, một route handler lỗi lúc khởi động hay `standalone` thiếu file vẫn báo
# "Deploy xong" trong khi cả site trả 502 — chỉ người dùng mới phát hiện. Dùng
# đúng đường dẫn healthcheck của compose (`/`) nên hai chỗ không thể lệch nhau.
deploy_healthy() {
  wait_healthy backend http://backend:8000/api/health || return 1
  wait_healthy frontend http://frontend:3000/ || return 1
  return 0
}

manual_rollback_hint() {
  log "Rollback thủ công:"
  log "  IMAGE_TAG=<tag_cũ> GCP_PROJECT_ID=${GCP_PROJECT_ID:-<project>} bash scripts/deploy.sh"
}

# Đưa backend/frontend về đúng ảnh đang chạy trước deploy này.
#
# KHÔNG chạm tới DB. Nếu bản mới đã áp migration thì entrypoint đã chạy
# `alembic upgrade head` từ lúc container mới lên, và không có lệnh nào ở đây
# hạ schema xuống được — đó là lý do khối cảnh báo dưới trỏ tới bản dump
# trước deploy thay vì hứa đã phục hồi trọn vẹn.
rollback() {
  if [[ -z "${PREV_BACKEND_IMAGE_ID}" && -z "${PREV_FRONTEND_IMAGE_ID}" ]]; then
    log "Không có mốc rollback (deploy đầu tiên?) — giữ nguyên stack."
    return 1
  fi

  log "ROLLBACK: đưa service về ảnh trước deploy..."
  if [[ -n "${PREV_BACKEND_IMAGE_ID}" ]]; then
    export BACKEND_IMAGE="${PREV_BACKEND_IMAGE_ID}"
  else
    log "  (backend không chạy trước deploy — giữ ảnh hiện tại)"
  fi
  if [[ -n "${PREV_FRONTEND_IMAGE_ID}" ]]; then
    export FRONTEND_IMAGE="${PREV_FRONTEND_IMAGE_ID}"
  else
    log "  (frontend không chạy trước deploy — giữ ảnh hiện tại)"
  fi

  # --no-build cả ở DEPLOY_MODE=build: rollback dựng lại ảnh CŨ theo ID, build
  # lại từ code trên server chỉ cho ra đúng bản vừa hỏng.
  if ! docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans --no-build; then
    log "ROLLBACK: lệnh 'up -d' thất bại."
    return 1
  fi
  docker compose -f "${COMPOSE_FILE}" restart nginx
  deploy_healthy || return 1
  return 0
}

AUTO_ROLLBACK="${AUTO_ROLLBACK:-1}"

if deploy_healthy; then
  log "Backend + frontend healthy."
elif [[ "${AUTO_ROLLBACK}" != "1" ]]; then
  log "Deploy KHÔNG healthy. AUTO_ROLLBACK=${AUTO_ROLLBACK} — giữ nguyên stack để mổ xẻ."
  manual_rollback_hint
  exit 1
elif rollback; then
  log "ROLLBACK XONG — site đã trở lại phiên bản trước. Deploy này THẤT BẠI."
  log "LƯU Ý: rollback chỉ đổi ảnh, KHÔNG hạ schema DB. Nếu bản vừa hỏng đã áp"
  log "migration, code cũ có thể không khớp schema mới. Bản dump trước deploy:"
  log "  ${PRE_DEPLOY_BACKUP:-<không có: backup bị bỏ qua>}"
  exit 1
else
  log "ROLLBACK THẤT BẠI — site đang ở trạng thái hỏng, cần can thiệp tay NGAY."
  manual_rollback_hint
  exit 1
fi

log "Dọn image cũ..."
docker image prune -f >/dev/null

log "Trạng thái:"
docker compose -f "${COMPOSE_FILE}" ps

log "Deploy xong."
