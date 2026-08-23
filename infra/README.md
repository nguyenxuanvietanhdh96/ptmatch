# PTMatch — Infrastructure (Terragrunt / GCP)

Toàn bộ hạ tầng GCP được quản lý bằng Terragrunt. App chạy trên 1 GCE instance
(docker compose), media trên GCS + Cloud CDN, DNS bằng Cloud DNS.

```
infra/
├── terragrunt.hcl            # Root: remote state GCS + provider google ~> 5.0
├── environments/
│   ├── dev/                  # ptmatch-dev  (e2-small,  dev.ptmatch.vn)
│   └── prod/                 # ptmatch-prod (e2-medium, ptmatch.vn)
│       └── {network,compute,storage,cdn,dns}/terragrunt.hcl
└── modules/{network,compute,storage,cdn,dns}/
```

Thứ tự dependency: `network` + `storage` → `compute` → (`cdn` ← storage) → `dns`.
Terragrunt tự resolve khi chạy `run-all`.

## Thứ tự deploy lần đầu

1. **Tạo GCP project + enable APIs** (làm cho từng project `ptmatch-dev`, `ptmatch-prod`):

   ```bash
   gcloud projects create ptmatch-dev && gcloud config set project ptmatch-dev
   gcloud services enable compute.googleapis.com storage.googleapis.com \
     dns.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com \
     iam.googleapis.com logging.googleapis.com monitoring.googleapis.com
   ```

2. **Tạo state bucket** (1 lần duy nhất):

   ```bash
   gsutil mb -p ptmatch-prod -l asia-southeast1 -b on gs://ptmatch-terraform-state
   gsutil versioning set on gs://ptmatch-terraform-state
   ```

3. **Tạo Artifact Registry repo** (mỗi project):

   ```bash
   gcloud artifacts repositories create ptmatch \
     --repository-format=docker --location=asia-southeast1
   ```

4. **Apply hạ tầng dev** (sửa `ssh_allowed_cidrs` trong `environments/dev/env.hcl` trước):

   ```bash
   cd infra/environments/dev
   terragrunt run-all plan
   terragrunt run-all apply
   ```

5. **Setup server**: SSH vào instance, copy/clone repo rồi chạy

   ```bash
   gcloud compute ssh ptmatch-dev --zone=asia-southeast1-b
   DOMAIN=dev.ptmatch.vn CERTBOT_EMAIL=you@example.com REPO_URL=<git-url> \
     sudo -E bash /opt/ptmatch/scripts/setup-server.sh
   ```

6. **DNS**: zone `ptmatch.vn` chỉ tạo ở prod (`create_dns_zone = true`).
   - Apply prod xong, lấy name servers: `cd environments/prod/dns && terragrunt output name_servers`
     rồi cập nhật tại registrar.
   - Record dev (`dev.ptmatch.vn`, `cdn-dev.ptmatch.vn`) thêm tay vào zone prod,
     trỏ về output `external_ip` (compute) và `cdn_ip` (cdn) của dev.
   - Managed SSL cert của CDN chỉ active sau khi DNS cdn domain trỏ đúng IP
     (có thể mất 15–60 phút).

7. **CI/CD**: tạo Cloud Build trigger (push lên `main`) dùng `cloudbuild.yaml` ở root.
   Cloud Build SA cần roles: `artifactregistry.writer`, `compute.instanceAdmin.v1`,
   `iap.tunnelResourceAccessor`, `iam.serviceAccountUser`.

## Lệnh thường dùng

```bash
# Plan/apply 1 module
cd infra/environments/dev/compute && terragrunt plan && terragrunt apply

# Plan/apply cả environment (đúng thứ tự dependency)
cd infra/environments/dev && terragrunt run-all apply

# Xem outputs
cd infra/environments/prod/compute && terragrunt output external_ip
cd infra/environments/prod/dns && terragrunt output name_servers

# Format / validate
terraform fmt -recursive infra/
terragrunt hclfmt

# Destroy (cẩn thận!)
cd infra/environments/dev && terragrunt run-all destroy
```

## Ghi chú

- Mọi resource hỗ trợ labels đều gắn `{project = "ptmatch", environment, managed_by = "terragrunt"}`.
- Media bucket `ptmatch-media-{env}`: public read (serve qua CDN), CORS cho
  signed-URL upload từ frontend, tự dọn multipart dở sau 7 ngày.
- Backups bucket `ptmatch-backups-{env}`: tự xoá sau 30 ngày; cron
  `scripts/backup-db.sh` chạy 2AM hằng ngày (cài bởi `setup-server.sh`).
- SSH thường ngày nên dùng IAP: `gcloud compute ssh <instance> --tunnel-through-iap`
  (firewall đã mở dải IAP 35.235.240.0/20).
