# Environment-specific vars — PROD
locals {
  project_id  = "ptmatch-prod"
  environment = "prod"
  region      = "asia-southeast1"
  zone        = "asia-southeast1-b"

  machine_type = "e2-medium"

  domain     = "ptmatch.vn"
  cdn_domain = "cdn.ptmatch.vn"

  cors_origins = [
    "https://ptmatch.vn",
    "https://www.ptmatch.vn",
  ]

  # Rỗng = không mở cổng 22 ra Internet. SSH (kể cả deploy từ Cloud Build)
  # đi qua IAP; xem infra/modules/network/main.tf. Chỉ thêm CIDR văn phòng/VPN
  # cụ thể nếu thật sự cần SSH không qua IAP.
  ssh_allowed_cidrs = []

  # Managed zone ptmatch.vn được tạo ở prod
  create_dns_zone = true
  dns_zone_domain = "ptmatch.vn"
}
