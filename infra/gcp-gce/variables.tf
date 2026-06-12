variable "project_id" {
  description = "GCP project id."
  type        = string
}

variable "region" {
  description = "GCP region for the external IP and subnet."
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "GCP zone for the VM."
  type        = string
  default     = "us-central1-a"
}

variable "name_prefix" {
  description = "Prefix for created resources."
  type        = string
  default     = "tips"
}

variable "machine_type" {
  description = "GCE machine type. e2-small is a low-cost starting point."
  type        = string
  default     = "e2-small"
}

variable "boot_disk_size_gb" {
  description = "Boot disk size in GB."
  type        = number
  default     = 30
}

variable "ssh_source_ranges" {
  description = "CIDR ranges allowed to SSH into the VM. Replace 0.0.0.0/0 with your IP for production."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "ssh_username" {
  description = "Linux username for the injected SSH public key."
  type        = string
  default     = "deploy"
}

variable "ssh_public_key_path" {
  description = "Path to an SSH public key to install on the VM."
  type        = string
  default     = "~/.ssh/id_rsa.pub"
}
