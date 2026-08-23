output "instance_name" {
  description = "Tên GCE instance"
  value       = google_compute_instance.app.name
}

output "instance_self_link" {
  description = "Self link của instance"
  value       = google_compute_instance.app.self_link
}

output "external_ip" {
  description = "Static external IP của instance"
  value       = google_compute_address.external.address
}

output "service_account_email" {
  description = "Email service account của instance"
  value       = google_service_account.instance.email
}
