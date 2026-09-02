#!/usr/bin/env bash
# =============================================================================
# setup-github-wif.sh — cho phép GitHub Actions deploy vào GCP mà KHÔNG cần
# khoá service account dài hạn. Chạy MỘT LẦN, idempotent.
#
#   GCP_PROJECT_ID=<id> bash scripts/setup-github-wif.sh
#
# Nguyên lý: runner của GitHub tự phát một OIDC token mô tả "tôi là workflow
# của repo X, nhánh Y". Workload Identity Federation đổi token đó lấy access
# token ngắn hạn của GCP. Không có bí mật nào nằm trong repo, không có gì phải
# xoay vòng định kỳ, và thu hồi thì làm tập trung ở GCP.
#
# Script KHÔNG tự đặt biến trên GitHub (cần quyền admin repo) — nó in ra ba giá
# trị để bạn dán vào Settings → Secrets and variables → Actions → Variables.
# =============================================================================
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-}"
REPO="${GITHUB_REPO:-nguyenxuanvietanhdh96/ptmatch}"
POOL="${WIF_POOL:-github}"
PROVIDER="${WIF_PROVIDER:-ptmatch}"
SA_NAME="${DEPLOY_SA_NAME:-ptmatch-deployer}"
INSTANCE="${GCE_INSTANCE:-ptmatch-prod}"
ZONE="${GCE_ZONE:-asia-southeast1-b}"
# Nhánh được phép deploy. Ràng buộc này nằm ở provider, nên một workflow chạy
# từ nhánh khác sẽ không đổi được token — kể cả khi ai đó sửa file workflow.
ALLOWED_REF="${ALLOWED_REF:-refs/heads/main}"

log() { echo "[wif] $*"; }

if [[ -z "${PROJECT_ID}" ]]; then
  echo "Thiếu GCP_PROJECT_ID. Dùng: GCP_PROJECT_ID=<id> bash $0" >&2
  exit 1
fi

PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

log "Project ${PROJECT_ID} (số ${PROJECT_NUMBER}), repo ${REPO}, nhánh ${ALLOWED_REF}"

# ---- 1. API cần thiết -------------------------------------------------------
log "Bật API..."
gcloud services enable \
  iamcredentials.googleapis.com sts.googleapis.com iap.googleapis.com \
  oslogin.googleapis.com compute.googleapis.com \
  --project="${PROJECT_ID}"

# ---- 2. Workload Identity Pool + Provider -----------------------------------
if ! gcloud iam workload-identity-pools describe "${POOL}" \
     --project="${PROJECT_ID}" --location=global >/dev/null 2>&1; then
  log "Tạo pool ${POOL}..."
  gcloud iam workload-identity-pools create "${POOL}" \
    --project="${PROJECT_ID}" --location=global \
    --display-name="GitHub Actions"
else
  log "Pool ${POOL} đã có."
fi

# attribute-condition là hàng rào thật sự: thiếu nó thì BẤT KỲ repo nào trên
# GitHub cũng đổi được token của project này.
CONDITION="assertion.repository=='${REPO}' && assertion.ref=='${ALLOWED_REF}'"
if ! gcloud iam workload-identity-pools providers describe "${PROVIDER}" \
     --project="${PROJECT_ID}" --location=global \
     --workload-identity-pool="${POOL}" >/dev/null 2>&1; then
  log "Tạo provider ${PROVIDER}..."
  gcloud iam workload-identity-pools providers create-oidc "${PROVIDER}" \
    --project="${PROJECT_ID}" --location=global \
    --workload-identity-pool="${POOL}" \
    --display-name="PTMatch" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition="${CONDITION}"
else
  log "Provider ${PROVIDER} đã có — cập nhật điều kiện..."
  gcloud iam workload-identity-pools providers update-oidc "${PROVIDER}" \
    --project="${PROJECT_ID}" --location=global \
    --workload-identity-pool="${POOL}" \
    --attribute-condition="${CONDITION}"
fi

# ---- 3. Service account cho deploy ------------------------------------------
if ! gcloud iam service-accounts describe "${SA_EMAIL}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  log "Tạo service account ${SA_EMAIL}..."
  gcloud iam service-accounts create "${SA_NAME}" \
    --project="${PROJECT_ID}" --display-name="PTMatch deployer (GitHub Actions)"
else
  log "Service account đã có."
fi

# Chỉ repo này mới được mượn danh SA. Ràng buộc theo attribute.repository, còn
# nhánh đã chặn ở provider bên trên.
log "Cho phép ${REPO} mượn danh ${SA_NAME}..."
gcloud iam service-accounts add-iam-policy-binding "${SA_EMAIL}" \
  --project="${PROJECT_ID}" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${REPO}" \
  --condition=None >/dev/null

# ---- 4. Quyền tối thiểu để chạy được deploy.sh ------------------------------
# - iap.tunnelResourceAccessor: mở đường hầm IAP (thay cho việc mở cổng 22).
# - compute.osAdminLogin: đăng nhập CÓ sudo — deploy.sh chạy `sudo`.
#   Dùng compute.osLogin (không sudo) là deploy sẽ chết ở dòng đầu.
# - compute.viewer: đọc thông tin instance để `gcloud compute ssh` định vị được.
for ROLE in roles/iap.tunnelResourceAccessor roles/compute.osAdminLogin roles/compute.viewer; do
  log "Cấp ${ROLE}..."
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${SA_EMAIL}" --role="${ROLE}" \
    --condition=None >/dev/null
done

# SSH vào một instance có service account gắn sẵn đòi quyền "act as" SA đó.
INSTANCE_SA="$(gcloud compute instances describe "${INSTANCE}" \
  --zone="${ZONE}" --project="${PROJECT_ID}" \
  --format='value(serviceAccounts[0].email)' 2>/dev/null || true)"
if [[ -n "${INSTANCE_SA}" ]]; then
  log "Cấp quyền act-as trên SA của instance (${INSTANCE_SA})..."
  gcloud iam service-accounts add-iam-policy-binding "${INSTANCE_SA}" \
    --project="${PROJECT_ID}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role=roles/iam.serviceAccountUser --condition=None >/dev/null
else
  log "Không đọc được SA của instance ${INSTANCE} — bỏ qua bước act-as."
fi

# ---- 5. Bật OS Login trên instance ------------------------------------------
# OS Login gắn quyền SSH vào IAM thay vì vào khoá trong metadata, nhờ đó thu hồi
# quyền của runner chỉ là gỡ một role. LƯU Ý: sau khi bật, khoá SSH đặt trong
# metadata sẽ không còn dùng được — người thật vẫn vào bình thường bằng
# `gcloud compute ssh` (đằng nào cổng 22 cũng đang đóng với Internet).
log "Bật OS Login trên ${INSTANCE}..."
gcloud compute instances add-metadata "${INSTANCE}" \
  --zone="${ZONE}" --project="${PROJECT_ID}" \
  --metadata enable-oslogin=TRUE >/dev/null

# ---- 6. In ra giá trị cần dán vào GitHub ------------------------------------
WIF_FULL="$(gcloud iam workload-identity-pools providers describe "${PROVIDER}" \
  --project="${PROJECT_ID}" --location=global \
  --workload-identity-pool="${POOL}" --format='value(name)')"

cat <<SUMMARY

============================================================================
Xong. Đặt 3 biến này ở GitHub:
  repo Settings → Secrets and variables → Actions → tab "Variables"

  GCP_PROJECT_ID    = ${PROJECT_ID}
  GCP_WIF_PROVIDER  = ${WIF_FULL}
  GCP_DEPLOY_SA     = ${SA_EMAIL}

Chúng KHÔNG phải bí mật (không dùng được nếu không có OIDC token của đúng
repo + nhánh), nên để ở Variables để nhìn thấy cấu hình đang trỏ đi đâu.

Còn một việc thủ công nữa: sau lần build đầu, hai package trên GHCR mặc định
ở chế độ private, GCE sẽ không pull được. Vào GitHub → Packages → từng
package → Package settings → Change visibility → Public.
============================================================================
SUMMARY
