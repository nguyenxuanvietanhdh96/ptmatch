#!/usr/bin/env bash
# =============================================================================
# deploy.sh — chạy trên GCE instance để deploy phiên bản mới. Idempotent.
#
# Nguồn image do DEPLOY_MODE quyết định (đặt trong .env, mặc định `pull`):
#
#   DEPLOY_MODE=pull   — lấy image từ registry. Có CI đẩy ảnh lên thì dùng cái này.
#       CI/CD:     IMAGE_TAG=<short_sha> bash scripts/deploy.sh
#       Thủ công:  bash scripts/deploy.sh   (dùng BACKEND_IMAGE/FRONTEND_IMAGE trong .env)
#
#   DEPLOY_MODE=build  — build ngay trên server từ code trong APP_DIR.
#       Dùng cho kịch bản MỘT SERVER không có registry (VPS, Oracle Free Tier).
#       Cần ~2GB RAM trống lúc build Next.js; máy 2GB nên bật swap.
# =============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/ptmatch}"
COMPOSE_FILE="docker-compose.prod.yml"
IMAGE_TAG="${IMAGE_TAG:-}"
AR_REGION="${AR_REGION:-asia-southeast1}"
AR_REPO="${AR_REPO:-ptmatch}"

log() { echo "[deploy $(date '+%F %T')] $*"; }

cd "${APP_DIR}"

if [[ ! -f .env ]]; then
  echo "Thiếu ${APP_DIR}/.env — chạy scripts/setup-server.sh trước." >&2
  exit 1
fi

# ---- Backup trước khi áp migration mới -------------------------------------
# entrypoint.sh chạy `alembic upgrade head` NGAY LÚC container backend mới lên
# (không phải một bước tách riêng ta có thể chặn trước). Backup cron gần nhất
# có thể cách tới ~22h; một migration hỏng ở giữa đó thì điểm phục hồi mới nhất
# lại là TRƯỚC lúc deploy này. Dump ngay ở đây đảm bảo luôn có bản backup mới
# hơn bản deploy đang chạy, mà không cần đợi cron.
SKIP_PRE_DEPLOY_BACKUP="${SKIP_PRE_DEPLOY_BACKUP:-0}"
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
fi

if [[ -n "${IMAGE_TAG}" ]]; then
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

# DEPLOY_MODE quyết định image ở đâu ra. KHÔNG bao giờ để Compose tự chọn.
#
#   pull  (mặc định) — lấy image đã build sẵn từ registry (Artifact Registry,
#                      GHCR...). Dùng khi có CI build ảnh.
#   build            — build ngay trên server từ code trong ${APP_DIR}. Dùng khi
#                      chỉ có một server và không có registry (VPS/Oracle).
#
# Vì sao phải tường minh: docker-compose.prod.yml khai báo cả `image:` lẫn
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
    # docker-compose.prod.yml KHÔNG che được giai đoạn này. Trên máy 2GB không
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

# Health check: deploy chỉ được coi là xong khi API thực sự trả lời. Không có
# bước này thì một migration hỏng hay image lỗi vẫn báo "Deploy xong".
log "Chờ backend healthy..."
HEALTH_OK=0
for _ in $(seq 1 30); do
  # Gọi từ trong container nginx: kiểm tra luôn cả việc nginx phân giải được
  # tên `backend` sau khi restart, chứ không chỉ kiểm tra backend còn sống.
  if docker compose -f "${COMPOSE_FILE}" exec -T nginx \
      wget -q -O /dev/null http://backend:8000/api/health 2>/dev/null; then
    HEALTH_OK=1
    break
  fi
  sleep 2
done

if [[ "${HEALTH_OK}" -ne 1 ]]; then
  log "LỖI: backend không trả lời /api/health sau 60s. Log 50 dòng cuối:"
  docker compose -f "${COMPOSE_FILE}" logs --tail=50 backend >&2 || true
  log "Stack vẫn đang chạy — kiểm tra log rồi rollback bằng:"
  log "  IMAGE_TAG=<tag_cũ> GCP_PROJECT_ID=${GCP_PROJECT_ID:-<project>} bash scripts/deploy.sh"
  exit 1
fi
log "Backend healthy."

log "Dọn image cũ..."
docker image prune -f >/dev/null

log "Trạng thái:"
docker compose -f "${COMPOSE_FILE}" ps

log "Deploy xong."
