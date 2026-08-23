variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "environment" {
  description = "Environment name (dev/prod)"
  type        = string
}

variable "region" {
  description = "GCP region for the subnet"
  type        = string
}

variable "zone" {
  description = "GCP zone (unused here, passed from root inputs)"
  type        = string
  default     = ""
}

variable "subnet_cidr" {
  description = "CIDR range for the main subnet"
  type        = string
  default     = "10.10.0.0/24"
}

variable "ssh_allowed_cidrs" {
  description = <<-EOT
    CIDR ranges được SSH trực tiếp vào cổng 22. Để rỗng (mặc định) là không tạo
    rule nào — SSH đi qua IAP (35.235.240.0/20), đủ cho cả deploy lẫn thao tác tay
    bằng `gcloud compute ssh --tunnel-through-iap`.
  EOT
  type        = list(string)
  default     = []

  validation {
    condition     = !contains(var.ssh_allowed_cidrs, "0.0.0.0/0")
    error_message = "Không mở SSH ra toàn Internet. Dùng IAP, hoặc điền CIDR văn phòng/VPN cụ thể."
  }
}
