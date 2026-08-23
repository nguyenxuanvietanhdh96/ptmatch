# Storage — GCS buckets cho media (public, qua CDN) và backups (private).

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

# Media bucket — ảnh avatar, portfolio, review images.
# Upload qua signed URL (PUT từ browser), serve public qua Cloud CDN.
resource "google_storage_bucket" "media" {
  name          = "ptmatch-media-${var.environment}"
  location      = var.region
  storage_class = "STANDARD"
  force_destroy = var.force_destroy
  labels        = local.labels

  uniform_bucket_level_access = true

  cors {
    origin          = var.cors_origins
    method          = ["GET", "HEAD", "PUT", "OPTIONS"]
    response_header = ["Content-Type", "Content-MD5", "x-goog-resumable"]
    max_age_seconds = 3600
  }

  # Dọn multipart upload dở dang sau 7 ngày
  lifecycle_rule {
    action {
      type = "AbortIncompleteMultipartUpload"
    }

    condition {
      age = 7
    }
  }
}

# Media là public-read (ảnh profile/portfolio phục vụ qua CDN)
resource "google_storage_bucket_iam_member" "media_public_read" {
  bucket = google_storage_bucket.media.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

# Backups bucket — pg_dump hằng ngày, tự xoá sau 30 ngày
resource "google_storage_bucket" "backups" {
  name          = "ptmatch-backups-${var.environment}"
  location      = var.region
  storage_class = "STANDARD"
  force_destroy = var.force_destroy
  labels        = local.labels

  uniform_bucket_level_access = true

  lifecycle_rule {
    action {
      type = "Delete"
    }

    condition {
      age = var.backup_retention_days
    }
  }

  lifecycle_rule {
    action {
      type = "AbortIncompleteMultipartUpload"
    }

    condition {
      age = 7
    }
  }
}
