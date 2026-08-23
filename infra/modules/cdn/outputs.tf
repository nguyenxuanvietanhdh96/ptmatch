output "cdn_ip" {
  description = "Global static IP của CDN (trỏ A record cdn domain vào đây)"
  value       = google_compute_global_address.cdn.address
}

output "cdn_domain" {
  description = "Domain phục vụ CDN"
  value       = var.cdn_domain
}

output "ssl_certificate_name" {
  description = "Tên managed SSL certificate"
  value       = google_compute_managed_ssl_certificate.cdn.name
}

output "backend_bucket_name" {
  description = "Tên backend bucket"
  value       = google_compute_backend_bucket.media.name
}
