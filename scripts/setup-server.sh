#!/usr/bin/env bash
# =============================================================================
# setup-server.sh — chạy MỘT LẦN trên GCE instance sau khi terragrunt apply.
#
# Usage (trên server, với sudo):
#   DOMAIN=ptmatch.vn CERTBOT_EMAIL=admin@ptmatch.vn REPO_URL=<git-url> \
#     sudo -E bash scripts/setup-server.sh
#
# Làm các việc:
#   1. Cài Docker + compose plugin (nếu startup script chưa cài)
#   2. Tạo APP_DIR, clone repo (hoặc nhắc copy code thủ công)
#   3. cp .env.example .env, sinh secrets, đặt kịch bản triển khai
#   4. Xin chứng chỉ Let's Encrypt qua certbot (webroot) cho domain
#   5. Cài cron tự renew cert + reload nginx
# =============================================================================
set -euo pipefail

# APP_DIR: ưu tiên env; nếu không có thì suy từ vị trí script — nhưng CHỈ khi
# thư mục cha thật sự là một bản checkout (có docker-compose.yml). Script
# này còn được chạy đứng một mình để bootstrap máy trắng (lúc đó nó tự clone),
# trường hợp đó vẫn rơi về /opt/ptmatch như cũ.
_repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -z "${APP_DIR:-}" && -f "${_repo_root}/docker-compose.yml" ]]; then
  APP_DIR="${_repo_root}"
fi
APP_DIR="${APP_DIR:-/opt/ptmatch}"
# nginx mang `profiles: ["prod"]` trong docker-compose.yml — không bật profile
# này thì `up` bỏ qua nó và cổng 80/443 không có ai phục vụ.
export COMPOSE_PROFILES=prod
DOMAIN="${DOMAIN:-ptmatch.vn}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
REPO_URL="${REPO_URL:-}"

# Kịch bản triển khai. Mặc định là "một server tự chứa" vì đó là đường không cần
# thêm dịch vụ nào: ảnh lưu trên đĩa, image build ngay tại chỗ.
#   STORAGE_BACKEND=local  + DEPLOY_MODE=build  -> VPS / Oracle Free Tier
#   STORAGE_BACKEND=gcs    + DEPLOY_MODE=pull   -> GCE + GCS + Artifact Registry
STORAGE_BACKEND="${STORAGE_BACKEND:-local}"
DEPLOY_MODE="${DEPLOY_MODE:-build}"

log() { echo "[setup-server] $*"; }

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Script này cần chạy bằng root (sudo -E bash scripts/setup-server.sh)" >&2
  exit 1
fi

# --- 1. Docker + compose plugin --------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  log "Cài Docker Engine + compose plugin..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${VERSION_CODENAME}") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
else
  log "Docker đã có: $(docker --version)"
fi

if ! docker compose version >/dev/null 2>&1; then
  log "Cài docker compose plugin..."
  apt-get update -y && apt-get install -y docker-compose-plugin
fi

# Docker auth tới Artifact Registry (cần gcloud — startup script đã cài)
if command -v gcloud >/dev/null 2>&1; then
  gcloud auth configure-docker asia-southeast1-docker.pkg.dev --quiet || true
fi

# --- 2. App directory + source code ----------------------------------------
mkdir -p "${APP_DIR}"

if [[ ! -d "${APP_DIR}/.git" && ! -f "${APP_DIR}/docker-compose.yml" ]]; then
  if [[ -n "${REPO_URL}" ]]; then
    log "Clone repo ${REPO_URL} vào ${APP_DIR}..."
    git clone "${REPO_URL}" "${APP_DIR}"
  else
    log "CHÚ Ý: REPO_URL chưa set và ${APP_DIR} chưa có code."
    log "Hãy clone repo hoặc copy code vào ${APP_DIR} rồi chạy lại script."
    exit 1
  fi
else
  log "Code đã có sẵn trong ${APP_DIR}."
fi

cd "${APP_DIR}"

# --- 3. .env -----------------------------------------------------------------
# Secrets được SINH TẠI ĐÂY thay vì để lại placeholder kèm lời nhắc: đây là
# server production, và "operator quên sửa .env" là cách kinh điển để chạy thật
# bằng mật khẩu DB và khoá ký JWT ai cũng đọc được trong repo.
if [[ ! -f .env ]]; then
  cp .env.example .env

  # sed -i với | làm delimiter: giá trị hex không chứa | nên an toàn.
  sed -i "s|^SECRET_KEY=.*|SECRET_KEY=$(openssl rand -hex 32)|" .env
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" .env
  # ENVIRONMENT quyết định bucket backup trong scripts/backup-db.sh, không chỉ
  # là nhãn hiển thị — sai giá trị ở đây là backup hằng đêm fail âm thầm.
  sed -i "s|^ENVIRONMENT=.*|ENVIRONMENT=production|" .env
  sed -i "s|^CORS_ORIGINS=.*|CORS_ORIGINS=https://${DOMAIN},https://www.${DOMAIN}|" .env
  sed -i "s|^SITE_URL=.*|SITE_URL=https://${DOMAIN}|" .env
  sed -i "s|^FRONTEND_BASE_URL=.*|FRONTEND_BASE_URL=https://${DOMAIN}|" .env
  sed -i "s|^STORAGE_BACKEND=.*|STORAGE_BACKEND=${STORAGE_BACKEND}|" .env
  sed -i "s|^DEPLOY_MODE=.*|DEPLOY_MODE=${DEPLOY_MODE}|" .env

  chmod 600 .env

  log "Đã tạo ${APP_DIR}/.env từ .env.example và sinh sẵn SECRET_KEY,"
  log "POSTGRES_PASSWORD ngẫu nhiên; ENVIRONMENT=production; domain=${DOMAIN}."
  log "Kịch bản: STORAGE_BACKEND=${STORAGE_BACKEND}, DEPLOY_MODE=${DEPLOY_MODE}."
  if [[ "${STORAGE_BACKEND}" == "gcs" ]]; then
    log ">>> CÒN PHẢI ĐIỀN: GCP_PROJECT_ID, GCS_BUCKET_NAME, CDN_BASE_URL."
    log ">>> Backend sẽ TỪ CHỐI khởi động nếu GCS_BUCKET_NAME còn trống."
  fi
  log ">>> BẮT BUỘC trước khi backend chạy được: NOTIFY_CHANNELS còn để mặc"
  log ">>> định 'log' (không gửi cho ai) — backend TỪ CHỐI khởi động ở"
  log ">>> production với kênh này. Điền SMTP_HOST/SMTP_USER/SMTP_PASSWORD và"
  log ">>> đổi NOTIFY_CHANNELS=email,log (xem .env.example)."
  log ">>> Tuỳ chọn: OAuth (GOOGLE_*/FACEBOOK_*/ZALO_*)."
  log ">>> KHÔNG cần điền NEXT_PUBLIC_API_URL: trình duyệt gọi /api cùng origin,"
  log ">>> và biến NEXT_PUBLIC_* được nhúng vào bundle lúc build image."
else
  log ".env đã tồn tại — giữ nguyên (không ghi đè secrets đang dùng)."
fi

# --- 3b. Thư mục media (bind mount) -----------------------------------------
# docker-compose.yml mount ./media vào /app/media bằng bind mount, và
# container chạy user appuser uid 1000 (backend/Dockerfile). Không chown thì
# backend không ghi được và mọi lượt upload thất bại với lỗi permission — mà
# lỗi đó chỉ lộ ra khi có người thật bấm tải ảnh lên.
mkdir -p "${APP_DIR}/media"
chown -R 1000:1000 "${APP_DIR}/media"
log "Đã tạo ${APP_DIR}/media (uid 1000, cho bind mount)."

# Kiểm .env trước khi tạo container nào: placeholder lọt tới production nghĩa là
# mật khẩu DB ai cũng biết, hoặc sitemap trỏ localhost.
source "${APP_DIR}/scripts/lib-require-env.sh"
if [[ "${SKIP_ENV_CHECK:-0}" != "1" ]]; then
  require_prod_env || exit 1
fi

# --- 4. Let's Encrypt cert qua certbot (webroot) -----------------------------
mkdir -p "${APP_DIR}/certbot/www" "${APP_DIR}/certbot/conf"

if [[ ! -d "${APP_DIR}/certbot/conf/live/${DOMAIN}" ]]; then
  log "Xin chứng chỉ Let's Encrypt cho ${DOMAIN}..."
  log "Lưu ý: DNS của ${DOMAIN} phải trỏ về IP server này, và nginx phải đang"
  log "serve /.well-known/acme-challenge/ từ ${APP_DIR}/certbot/www."

  # nginx phân giải tên upstream LÚC NẠP CONFIG, không phải lúc có request. Ở
  # bước này backend/frontend chưa chạy (--no-deps bên dưới, và image có thể
  # chưa build), nên conf thật làm nginx thoát ngay:
  #     [emerg] host not found in upstream "backend" in .../ptmatch.conf:111
  # rồi crash-loop dưới `restart: unless-stopped` — cổng 80, đúng nơi certbot
  # cần tới để xác nhận HTTP-01, không bao giờ lên. Triệu chứng nhìn thấy là
  # certbot báo "Connection refused", rất dễ đổ nhầm cho firewall.
  #
  # Cách chữa: cho nginx một conf CHỈ có block 80 phục vụ ACME challenge —
  # không upstream nào để phân giải, và không có block 443 nên cũng không cần
  # cert. (Trước đây chỗ này dựng một cert tự ký để nginx khởi động được; cách
  # đó vá sai chỗ, vì thứ chặn nginx là upstream chứ không phải cert.)
  REAL_CONF="${APP_DIR}/nginx/conf.d/ptmatch.conf"
  PARKED_CONF="${APP_DIR}/nginx/ptmatch.conf.parked"
  BOOTSTRAP_CONF="${APP_DIR}/nginx/conf.d/00-bootstrap.conf"

  restore_conf() {
    [[ -f "${PARKED_CONF}" ]] && mv -f "${PARKED_CONF}" "${REAL_CONF}"
    rm -f "${BOOTSTRAP_CONF}"
    return 0
  }
  # Trả conf thật về chỗ cũ kể cả khi script thoát giữa chừng. Thiếu trap này,
  # một lần certbot fail là conf thật nằm lại ngoài conf.d và nginx phục vụ mãi
  # bằng bootstrap — mọi đường dẫn trả 503, mà nhìn log thì thấy nginx "khoẻ".
  trap restore_conf EXIT

  log "Tạm thay nginx conf bằng bản bootstrap (chỉ cổng 80, không upstream)..."
  mv -f "${REAL_CONF}" "${PARKED_CONF}"
  cat > "${BOOTSTRAP_CONF}" <<'NGINXCONF'
# TẠM THỜI — setup-server.sh tạo file này chỉ để xin cert lần đầu và xoá ngay
# sau đó. Không upstream, không block 443: nginx khởi động được cả khi backend
# và frontend còn chưa tồn tại.
server {
    listen 80;
    listen [::]:80;
    server_name _;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location = /.well-known/health {
        access_log off;
        add_header Content-Type text/plain;
        return 200 "ok\n";
    }

    location / {
        return 503 "PTMatch dang cai dat.\n";
    }
}
NGINXCONF

  # --no-deps: chỉ dựng nginx, không kéo theo backend/frontend — image của
  # chúng có thể chưa pull/build xong lúc này.
  #
  # --force-recreate: BẮT BUỘC cho lần chạy LẠI. Nếu lượt trước fail, container
  # nginx còn đó và đang crash-loop dưới `restart: unless-stopped`. Compose thấy
  # container đã ở trạng thái mong muốn (cấu hình compose không đổi — chỉ nội
  # dung file bind-mount đổi) nên `up -d` là no-op: nó in "Started" trong 0.0s
  # và tiến trình nginx bên trong vẫn lặp lại việc nạp CONF CŨ. Cổng 80 không
  # bao giờ lên, certbot lại báo "Connection refused", và mỗi lượt như vậy ăn
  # một phần định mức 5 lần validate thất bại/giờ của Let's Encrypt.
  docker compose -f docker-compose.yml up -d --no-deps --force-recreate nginx

  # Chờ nginx thật sự nghe cổng 80 trước khi gọi certbot. Không có bước này thì
  # một nginx chết vì lý do khác (vd không bind được [::]:80) vẫn dẫn tới một
  # lượt certbot bị đốt vô ích.
  log "Chờ nginx trả lời trên cổng 80..."
  for _ in $(seq 1 15); do
    if curl -fsS -o /dev/null "http://localhost/.well-known/health" 2>/dev/null; then
      log "nginx đã sẵn sàng."
      break
    fi
    sleep 2
  done
  if ! curl -fsS -o /dev/null "http://localhost/.well-known/health" 2>/dev/null; then
    echo "[setup-server] LỖI: nginx không trả lời http://localhost/.well-known/health." >&2
    echo "KHÔNG gọi certbot (mỗi lần thất bại ăn định mức 5/giờ của Let's Encrypt)." >&2
    echo "Xem nguyên nhân: docker compose logs nginx --tail 30" >&2
    exit 1
  fi

  EMAIL_ARGS=(--register-unsafely-without-email)
  if [[ -n "${CERTBOT_EMAIL}" ]]; then
    EMAIL_ARGS=(--email "${CERTBOT_EMAIL}")
  fi

  docker run --rm \
    -v "${APP_DIR}/certbot/www:/var/www/certbot" \
    -v "${APP_DIR}/certbot/conf:/etc/letsencrypt" \
    certbot/certbot certonly \
    --webroot --webroot-path /var/www/certbot \
    -d "${DOMAIN}" -d "www.${DOMAIN}" \
    "${EMAIL_ARGS[@]}" \
    --agree-tos --non-interactive

  restore_conf
  trap - EXIT

  log "Đã có cert thật — khởi động full stack rồi nạp lại nginx..."
  # Thứ tự quan trọng: backend/frontend phải TỒN TẠI trước, vì nginx chỉ phân
  # giải upstream lúc nạp config. Restart (không phải reload) để nó đọc lại
  # conf thật vừa trả về chỗ cũ.
  docker compose -f docker-compose.yml up -d
  docker compose -f docker-compose.yml restart nginx
else
  log "Cert cho ${DOMAIN} đã tồn tại — bỏ qua certbot."
fi

# --- 5. Cron: renew cert + daily DB backup -----------------------------------
# Cả hai job đều bọc trong `... 2>&1 | logger -t <tag>`: ngoài file log còn đẩy
# vào syslog, nơi Ops Agent chuyển tiếp lên Cloud Logging — đó là chỗ duy nhất
# có thể đặt alert. Ghi mỗi vào file .log trên đĩa nghĩa là backup hỏng nhiều
# tháng cũng không ai biết cho tới lúc cần restore.
# Đặt luôn timezone hệ thống — không chỉ dựa vào CRON_TZ bên dưới — vì log
# server/container mang timestamp hệ thống, và nếu cron package nào đó trên
# máy không hiểu CRON_TZ thì đây là lưới đỡ thứ hai. `|| true`: image không có
# systemd (hiếm) thì bỏ qua, không chặn phần còn lại của script.
timedatectl set-timezone Asia/Ho_Chi_Minh 2>/dev/null || true

CRON_FILE=/etc/cron.d/ptmatch
cat > "${CRON_FILE}" <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
# Khung giờ dưới đây (7-21, 2AM, 3:17/15:17) được viết theo giờ Việt Nam. Không
# có dòng này, cron đọc theo timezone hệ thống — mặc định UTC trên hầu hết
# image GCE/Ubuntu — và job nhắc lead sẽ chạy lúc 2-4h sáng VN thay vì 7h-21h,
# đúng thứ mà comment bên dưới nói là phải tránh.
CRON_TZ=Asia/Ho_Chi_Minh
# nginx mang \`profiles: ["prod"]\` trong docker-compose.yml. Cron chạy với môi
# trường trống (không đọc .env, không đọc profile shell), nên thiếu dòng này thì
# \`docker compose exec nginx\` trong job renew cert không thấy service — và lỗi
# đó chỉ lộ ra sau ~90 ngày, đúng lúc cert hết hạn.
COMPOSE_PROFILES=prod

# Renew Let's Encrypt cert (2 lần/ngày theo khuyến nghị certbot) + reload nginx.
# Bọc trong bash -c để redirect áp cho CẢ chuỗi lệnh: viết thẳng thì
# ">> log 2>&1" chỉ dính vào lệnh cuối và lỗi certbot renew rơi vào cron mail
# (thường là /dev/null) — cert hết hạn chỉ lộ ra khi site đã gãy.
17 3,15 * * * root bash -c 'docker run --rm -v ${APP_DIR}/certbot/www:/var/www/certbot -v ${APP_DIR}/certbot/conf:/etc/letsencrypt certbot/certbot renew --webroot --webroot-path /var/www/certbot --quiet && cd ${APP_DIR} && docker compose -f docker-compose.yml exec -T nginx nginx -s reload' 2>&1 | tee -a /var/log/ptmatch-certbot.log | logger -t ptmatch-certbot

# Backup PostgreSQL hằng ngày lúc 2AM
0 2 * * * root ${APP_DIR}/scripts/backup-db.sh 2>&1 | tee -a /var/log/ptmatch-backup.log | logger -t ptmatch-backup

# Nhắc PT về lead còn chưa xử lý — mỗi giờ, trong khung 7h-21h.
# Không chạy ban đêm: thông báo lúc 3h sáng chỉ làm PT tắt thông báo, mất luôn
# cả kênh báo lead mới. Job tự bỏ qua lead đã nhắc nên chạy dày là vô hại.
0 7-21 * * * root cd ${APP_DIR} && docker compose -f docker-compose.yml exec -T backend python -m app.jobs.lead_reminders 2>&1 | logger -t ptmatch-reminders
EOF
chmod 0644 "${CRON_FILE}"
log "Đã cài cron renew cert + backup DB tại ${CRON_FILE}."

log "Hoàn tất. Các bước tiếp theo:"
log "  1. Kiểm tra/điền ${APP_DIR}/.env"
log "  2. bash ${APP_DIR}/scripts/deploy.sh để pull images + khởi động stack"
