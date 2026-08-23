variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "environment" {
  description = "Environment name (dev/prod)"
  type        = string
}

variable "region" {
  description = "GCP region (unused — DNS là global, passed from root inputs)"
  type        = string
  default     = ""
}

variable "zone" {
  description = "GCP zone (unused here, passed from root inputs)"
  type        = string
  default     = ""
}

variable "create_zone" {
  description = "Có tạo managed zone + records hay không (chỉ bật ở prod)"
  type        = bool
  default     = false
}

variable "domain" {
  description = "Root domain của zone (vd: ptmatch.vn)"
  type        = string
}

variable "cdn_subdomain" {
  description = "Subdomain cho CDN (record = {cdn_subdomain}.{domain})"
  type        = string
  default     = "cdn"
}

variable "gce_ip" {
  description = "Static external IP của GCE instance (từ module compute)"
  type        = string
}

variable "cdn_ip" {
  description = "Global IP của CDN (từ module cdn)"
  type        = string
}

variable "record_ttl" {
  description = "TTL cho DNS records (giây)"
  type        = number
  default     = 300
}

variable "labels" {
  description = "Labels bổ sung"
  type        = map(string)
  default     = {}
}
