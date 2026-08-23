# CDN — Cloud CDN trước media bucket, HTTPS với managed cert,
# HTTP tự redirect sang HTTPS.

locals {
  labels = merge(
    {
      project     = "ptmatch"
      environment = var.environment
      managed_by  = "terragrunt"
    },
    var.labels,
  )
}

# Global static IP cho load balancer / CDN
resource "google_compute_global_address" "cdn" {
  name = "ptmatch-${var.environment}-cdn-ip"
}

# Backend bucket trỏ media bucket, bật CDN, cache 30 ngày
resource "google_compute_backend_bucket" "media" {
  name        = "ptmatch-${var.environment}-media-backend"
  bucket_name = var.media_bucket_name
  enable_cdn  = true

  cdn_policy {
    cache_mode       = "CACHE_ALL_STATIC"
    default_ttl      = var.cache_ttl_seconds
    client_ttl       = var.cache_ttl_seconds
    max_ttl          = var.cache_ttl_seconds
    negative_caching = true
  }
}

resource "google_compute_url_map" "cdn" {
  name            = "ptmatch-${var.environment}-cdn-url-map"
  default_service = google_compute_backend_bucket.media.id
}

# Google-managed SSL cert cho cdn domain (cần DNS trỏ về IP này để provision)
resource "google_compute_managed_ssl_certificate" "cdn" {
  name = "ptmatch-${var.environment}-cdn-cert"

  managed {
    domains = [var.cdn_domain]
  }
}

resource "google_compute_target_https_proxy" "cdn" {
  name             = "ptmatch-${var.environment}-cdn-https-proxy"
  url_map          = google_compute_url_map.cdn.id
  ssl_certificates = [google_compute_managed_ssl_certificate.cdn.id]
}

resource "google_compute_global_forwarding_rule" "https" {
  name                  = "ptmatch-${var.environment}-cdn-https"
  target                = google_compute_target_https_proxy.cdn.id
  ip_address            = google_compute_global_address.cdn.address
  port_range            = "443"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  labels                = local.labels
}

# HTTP -> HTTPS redirect
resource "google_compute_url_map" "http_redirect" {
  name = "ptmatch-${var.environment}-cdn-http-redirect"

  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_target_http_proxy" "redirect" {
  name    = "ptmatch-${var.environment}-cdn-http-proxy"
  url_map = google_compute_url_map.http_redirect.id
}

resource "google_compute_global_forwarding_rule" "http" {
  name                  = "ptmatch-${var.environment}-cdn-http"
  target                = google_compute_target_http_proxy.redirect.id
  ip_address            = google_compute_global_address.cdn.address
  port_range            = "80"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  labels                = local.labels
}
