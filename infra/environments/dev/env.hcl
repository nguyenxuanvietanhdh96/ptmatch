# Environment-specific vars — DEV
locals {
  project_id  = "ptmatch-dev"
  environment = "dev"
  region      = "asia-southeast1"
  zone        = "asia-southeast1-b"

  machine_type = "e2-small"

  domain     = "dev.ptmatch.vn"
  cdn_domain = "cdn-dev.ptmatch.vn"

  cors_origins = [
    "https://dev.ptmatch.vn",
    "http://localhost:3000",
  ]

  # Rỗng = không mở cổng 22 ra Internet. SSH (kể cả deploy từ Cloud Build)
  # đi qua IAP; xem infra/modules/network/main.tf. Chỉ thêm CIDR văn phòng/VPN
  # cụ thể nếu thật sự cần SSH không qua IAP.
  ssh_allowed_cidrs = []

  # Zone ptmatch.vn chỉ tạo ở prod; record cho dev thêm tay vào zone prod
  create_dns_zone = false
  dns_zone_domain = "ptmatch.vn"
}
