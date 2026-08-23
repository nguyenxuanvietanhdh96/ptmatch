output "network_name" {
  description = "VPC network name"
  value       = google_compute_network.vpc.name
}

output "network_self_link" {
  description = "VPC network self link"
  value       = google_compute_network.vpc.self_link
}

output "subnet_name" {
  description = "Subnet name"
  value       = google_compute_subnetwork.main.name
}

output "subnet_self_link" {
  description = "Subnet self link"
  value       = google_compute_subnetwork.main.self_link
}

output "web_tag" {
  description = "Network tag dùng cho firewall web/ssh"
  value       = local.web_tag
}
