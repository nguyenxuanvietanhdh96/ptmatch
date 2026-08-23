variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "environment" {
  description = "Environment name (dev/prod)"
  type        = string
}

variable "region" {
  description = "GCP region cho buckets (regional)"
  type        = string
}

variable "zone" {
  description = "GCP zone (unused here, passed from root inputs)"
  type        = string
  default     = ""
}

variable "cors_origins" {
  description = "Origins được phép CORS (frontend upload qua signed URL)"
  type        = list(string)
}

variable "backup_retention_days" {
  description = "Số ngày giữ backup trước khi tự xoá"
  type        = number
  default     = 30
}

variable "force_destroy" {
  description = "Cho phép destroy bucket kể cả khi còn object (chỉ nên bật ở dev)"
  type        = bool
  default     = false
}

variable "labels" {
  description = "Labels bổ sung"
  type        = map(string)
  default     = {}
}
