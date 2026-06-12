output "external_ip" {
  description = "Reserved static external IP attached to the GCE VM."
  value       = google_compute_address.app.address
}

output "ssh_command" {
  description = "SSH command for the VM."
  value       = "ssh ${var.ssh_username}@${google_compute_address.app.address}"
}

output "vm_name" {
  value = google_compute_instance.app.name
}
