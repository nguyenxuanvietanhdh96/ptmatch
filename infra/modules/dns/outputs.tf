output "zone_name" {
  description = "Tên managed zone (rỗng nếu không tạo)"
  value       = var.create_zone ? google_dns_managed_zone.main[0].name : ""
}

output "name_servers" {
  description = "Name servers của zone — cập nhật tại registrar (rỗng nếu không tạo)"
  value       = var.create_zone ? google_dns_managed_zone.main[0].name_servers : []
}
