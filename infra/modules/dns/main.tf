# DNS — Cloud DNS managed zone ptmatch.vn (chỉ tạo ở prod qua var.create_zone).
# Dev: records (dev.ptmatch.vn, cdn-dev.ptmatch.vn) thêm tay vào zone prod.

locals {
  labels = merge(
    {
      project     = "ptmatch"
      environment = var.environment
      managed_by  = "terragrunt"
    },
    var.labels,
  )

  zone_count = var.create_zone ? 1 : 0
  dns_name   = "${var.domain}."
}

resource "google_dns_managed_zone" "main" {
  count = local.zone_count

  name        = replace(var.domain, ".", "-")
  dns_name    = local.dns_name
  description = "PTMatch ${var.environment} zone — managed by Terragrunt"
  labels      = local.labels
}

# Root domain -> GCE instance
resource "google_dns_record_set" "root_a" {
  count = local.zone_count

  managed_zone = google_dns_managed_zone.main[0].name
  name         = local.dns_name
  type         = "A"
  ttl          = var.record_ttl
  rrdatas      = [var.gce_ip]
}

# www -> GCE instance
resource "google_dns_record_set" "www_a" {
  count = local.zone_count

  managed_zone = google_dns_managed_zone.main[0].name
  name         = "www.${local.dns_name}"
  type         = "A"
  ttl          = var.record_ttl
  rrdatas      = [var.gce_ip]
}

# cdn -> CDN global IP
resource "google_dns_record_set" "cdn_a" {
  count = local.zone_count

  managed_zone = google_dns_managed_zone.main[0].name
  name         = "${var.cdn_subdomain}.${local.dns_name}"
  type         = "A"
  ttl          = var.record_ttl
  rrdatas      = [var.cdn_ip]
}
