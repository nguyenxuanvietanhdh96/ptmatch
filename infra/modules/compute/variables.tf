variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "environment" {
  description = "Environment name (dev/prod)"
  type        = string
}

variable "region" {
  description = "GCP region (cho static external IP)"
  type        = string
}

variable "zone" {
  description = "GCP zone cho instance"
  type        = string
}

variable "machine_type" {
  description = "GCE machine type (dev: e2-small, prod: e2-medium)"
  type        = string
}

variable "subnet_self_link" {
  description = "Self link của subnet (từ module network)"
  type        = string
}

variable "web_tag" {
  description = "Network tag để match firewall rules (từ module network)"
  type        = string
}

variable "media_bucket" {
  description = "Tên GCS media bucket (từ module storage) để gán objectAdmin"
  type        = string
}

variable "boot_disk_size_gb" {
  description = "Boot disk size (GB)"
  type        = number
  default     = 30
}

variable "labels" {
  description = "Labels bổ sung"
  type        = map(string)
  default     = {}
}
