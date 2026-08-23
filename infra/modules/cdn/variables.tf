variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "environment" {
  description = "Environment name (dev/prod)"
  type        = string
}

variable "region" {
  description = "GCP region (unused — CDN là global, passed from root inputs)"
  type        = string
  default     = ""
}

variable "zone" {
  description = "GCP zone (unused here, passed from root inputs)"
  type        = string
  default     = ""
}

variable "media_bucket_name" {
  description = "Tên GCS media bucket (từ module storage)"
  type        = string
}

variable "cdn_domain" {
  description = "Domain phục vụ CDN (vd: cdn.ptmatch.vn)"
  type        = string
}

variable "cache_ttl_seconds" {
  description = "TTL cache cho media (mặc định 30 ngày)"
  type        = number
  default     = 2592000
}

variable "labels" {
  description = "Labels bổ sung"
  type        = map(string)
  default     = {}
}
