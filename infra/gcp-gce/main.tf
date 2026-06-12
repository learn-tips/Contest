locals {
  app_tag = "${var.name_prefix}-app"
}

resource "google_project_service" "compute" {
  service            = "compute.googleapis.com"
  disable_on_destroy = false
}

resource "google_compute_network" "main" {
  name                    = "${var.name_prefix}-network"
  auto_create_subnetworks = false

  depends_on = [google_project_service.compute]
}

resource "google_compute_subnetwork" "main" {
  name          = "${var.name_prefix}-subnet"
  ip_cidr_range = "10.10.0.0/24"
  region        = var.region
  network       = google_compute_network.main.id
}

resource "google_compute_address" "app" {
  name   = "${var.name_prefix}-external-ip"
  region = var.region

  depends_on = [google_project_service.compute]
}

resource "google_compute_firewall" "allow_http_https" {
  name    = "${var.name_prefix}-allow-http-https"
  network = google_compute_network.main.name

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = [local.app_tag]
}

resource "google_compute_firewall" "allow_ssh" {
  name    = "${var.name_prefix}-allow-ssh"
  network = google_compute_network.main.name

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = var.ssh_source_ranges
  target_tags   = [local.app_tag]
}

resource "google_service_account" "vm" {
  account_id   = "${var.name_prefix}-vm"
  display_name = "${var.name_prefix} VM service account"
}

resource "google_compute_instance" "app" {
  name         = "${var.name_prefix}-app"
  machine_type = var.machine_type
  zone         = var.zone
  tags         = [local.app_tag]

  allow_stopping_for_update = true

  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2204-lts"
      size  = var.boot_disk_size_gb
      type  = "pd-balanced"
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.main.id

    access_config {
      nat_ip = google_compute_address.app.address
    }
  }

  metadata = {
    ssh-keys = "${var.ssh_username}:${file(var.ssh_public_key_path)}"
  }

  metadata_startup_script = file("${path.module}/startup.sh")

  service_account {
    email  = google_service_account.vm.email
    scopes = ["cloud-platform"]
  }

  depends_on = [
    google_compute_firewall.allow_http_https,
    google_compute_firewall.allow_ssh,
  ]
}
