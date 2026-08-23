# Compute — GCE instance chạy toàn bộ app stack qua docker compose.

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

# Service account cho instance
resource "google_service_account" "instance" {
  account_id   = "ptmatch-${var.environment}-gce"
  display_name = "PTMatch ${var.environment} GCE instance"
}

# Quyền đọc/ghi object trên media bucket (signed URLs, upload, delete)
resource "google_storage_bucket_iam_member" "media_object_admin" {
  bucket = var.media_bucket
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.instance.email}"
}

# Quyền tự ký V4 signed URL.
#
# Backend sinh signed URL để trình duyệt upload thẳng lên GCS
# (app/services/storage.py::presign_gcs). Trên GCE không có file khoá riêng, nên
# thư viện phải gọi IAM signBlob API — và việc đó cần
# roles/iam.serviceAccountTokenCreator TRÊN CHÍNH service account này, chứ không
# phải quyền trên bucket.
#
# Thiếu role này thì storage.objectAdmin ở trên vẫn không đủ: mọi lần PT tải ảnh
# đều thất bại, và lỗi nhìn như vấn đề credentials chứ không phải thiếu quyền.
resource "google_service_account_iam_member" "instance_token_creator" {
  service_account_id = google_service_account.instance.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.instance.email}"
}

# Quyền pull image từ Artifact Registry + ghi logs/metrics
resource "google_project_iam_member" "instance_roles" {
  for_each = toset([
    "roles/artifactregistry.reader",
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.instance.email}"
}

# Static external IP (reserved) — DNS trỏ vào IP này
resource "google_compute_address" "external" {
  name         = "ptmatch-${var.environment}-ip"
  region       = var.region
  address_type = "EXTERNAL"
  network_tier = "PREMIUM"
  labels       = local.labels
}

data "google_compute_image" "ubuntu" {
  family  = "ubuntu-2404-lts-amd64"
  project = "ubuntu-os-cloud"
}

resource "google_compute_instance" "app" {
  name         = "ptmatch-${var.environment}"
  machine_type = var.machine_type
  zone         = var.zone

  tags   = [var.web_tag]
  labels = local.labels

  boot_disk {
    initialize_params {
      image  = data.google_compute_image.ubuntu.self_link
      size   = var.boot_disk_size_gb
      type   = "pd-balanced"
      labels = local.labels
    }
  }

  network_interface {
    subnetwork = var.subnet_self_link

    access_config {
      nat_ip       = google_compute_address.external.address
      network_tier = "PREMIUM"
    }
  }

  service_account {
    email  = google_service_account.instance.email
    scopes = ["cloud-platform"]
  }

  # Cài Docker + compose plugin + gcloud CLI lần boot đầu
  metadata_startup_script = file("${path.module}/startup.sh")

  allow_stopping_for_update = true
}
