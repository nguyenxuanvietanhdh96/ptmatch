# Network — VPC custom, subnet asia-southeast1, firewall rules.
# Lưu ý: VPC/subnet/firewall không hỗ trợ labels trên GCP.

locals {
  web_tag = "ptmatch-${var.environment}-web"
}

resource "google_compute_network" "vpc" {
  name                    = "ptmatch-${var.environment}-vpc"
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"
}

resource "google_compute_subnetwork" "main" {
  name                     = "ptmatch-${var.environment}-subnet"
  ip_cidr_range            = var.subnet_cidr
  region                   = var.region
  network                  = google_compute_network.vpc.id
  private_ip_google_access = true
}

# Allow HTTP/HTTPS từ Internet tới instance có tag web
resource "google_compute_firewall" "allow_http_https" {
  name    = "ptmatch-${var.environment}-allow-http-https"
  network = google_compute_network.vpc.name

  direction     = "INGRESS"
  priority      = 1000
  source_ranges = ["0.0.0.0/0"]
  target_tags   = [local.web_tag]

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }
}

# Allow SSH trực tiếp từ các CIDR được phép.
#
# Rule này KHÔNG được tạo khi ssh_allowed_cidrs rỗng — và rỗng là mặc định nên
# dùng. Truy cập SSH thường lệ (kể cả deploy từ Cloud Build) đi qua IAP ở rule
# bên dưới, nên mở thêm cổng 22 ra Internet chỉ thêm bề mặt tấn công vào đúng
# cái máy đang chứa DB và service account có quyền ghi GCS.
#
# Chỉ điền CIDR thật (IP văn phòng/VPN) khi cần SSH mà không qua IAP.
resource "google_compute_firewall" "allow_ssh" {
  count = length(var.ssh_allowed_cidrs) > 0 ? 1 : 0

  name    = "ptmatch-${var.environment}-allow-ssh"
  network = google_compute_network.vpc.name

  direction     = "INGRESS"
  priority      = 1000
  source_ranges = var.ssh_allowed_cidrs
  target_tags   = [local.web_tag]

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}

# Allow SSH qua Identity-Aware Proxy (Cloud Build deploy dùng --tunnel-through-iap)
resource "google_compute_firewall" "allow_iap_ssh" {
  name    = "ptmatch-${var.environment}-allow-iap-ssh"
  network = google_compute_network.vpc.name

  direction     = "INGRESS"
  priority      = 1000
  source_ranges = ["35.235.240.0/20"]
  target_tags   = [local.web_tag]

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}

# Allow traffic nội bộ trong subnet
resource "google_compute_firewall" "allow_internal" {
  name    = "ptmatch-${var.environment}-allow-internal"
  network = google_compute_network.vpc.name

  direction     = "INGRESS"
  priority      = 1000
  source_ranges = [var.subnet_cidr]

  allow {
    protocol = "tcp"
  }

  allow {
    protocol = "udp"
  }

  allow {
    protocol = "icmp"
  }
}

# Deny mặc định mọi ingress còn lại (explicit, ưu tiên thấp nhất có thể đặt)
resource "google_compute_firewall" "deny_all_ingress" {
  name    = "ptmatch-${var.environment}-deny-all-ingress"
  network = google_compute_network.vpc.name

  direction     = "INGRESS"
  priority      = 65534
  source_ranges = ["0.0.0.0/0"]

  deny {
    protocol = "all"
  }
}
