output "media_bucket_name" {
  description = "Tên media bucket"
  value       = google_storage_bucket.media.name
}

output "media_bucket_url" {
  description = "gs:// URL của media bucket"
  value       = google_storage_bucket.media.url
}

output "backups_bucket_name" {
  description = "Tên backups bucket"
  value       = google_storage_bucket.backups.name
}

output "backups_bucket_url" {
  description = "gs:// URL của backups bucket"
  value       = google_storage_bucket.backups.url
}
