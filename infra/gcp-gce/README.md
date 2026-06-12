# GCP GCE Deployment Setup

This Terraform setup creates a low-cost Google Compute Engine VM with a reserved static external IP address.

Run Terraform from this directory only:

```bash
cd /Users/ledongtran/Documents/TIPSBoard/infra/gcp-gce
```

The repo root intentionally does not contain Terraform resources.

It is intended to deploy everything except `website/`:

```text
server/      API server
extension/   extension app iframe/static app
Postgres     local Docker volume
Redis        local Docker volume
Caddy        HTTPS reverse proxy
```

It uses the official HashiCorp Google provider resources:

- `google_compute_instance`
- `google_compute_address`
- `google_compute_network`
- `google_compute_subnetwork`
- `google_compute_firewall`

## What It Creates

```text
GCE VM                  tips-app
Static external IP      tips-external-ip
VPC network             tips-network
Subnet                  tips-subnet
Firewall                80, 443, 22
Startup script          installs Docker + Docker Compose plugin
```

This is the cheapest practical GCP shape for this app because you can run:

```text
server/
extension/
Postgres
Redis
Caddy or Nginx
```

on one VM.

## 1. Authenticate

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
```

## 2. Configure Terraform Variables

```bash
cd /Users/ledongtran/Documents/TIPSBoard/infra/gcp-gce
cp terraform.tfvars.example terraform.tfvars
```

Edit:

```text
project_id
region
zone
ssh_public_key_path
ssh_source_ranges
```

For production, do not leave SSH open to the world. Replace:

```hcl
ssh_source_ranges = ["0.0.0.0/0"]
```

with your IP:

```hcl
ssh_source_ranges = ["YOUR_PUBLIC_IP/32"]
```

## 3. Deploy Infrastructure

```bash
terraform init
terraform apply
```

After apply, Terraform prints:

```text
external_ip
ssh_command
```

## 4. Point DNS

Create A records pointing to the Terraform `external_ip`:

```text
api.yourdomain.com  -> external_ip
app.yourdomain.com  -> external_ip
```

## 5. SSH Into The VM

```bash
ssh deploy@EXTERNAL_IP
```

Docker is installed by the VM startup script.

## 6. Deploy App Containers

You can either:

1. Build images locally and push them to Artifact Registry or Docker Hub.
2. SSH into the VM, clone this repo, and run Docker Compose from the VM.

For the cheapest/simple beta setup, clone and build on the VM:

```bash
cd /opt/tips
git clone https://github.com/YOUR_USER/TIPSBoard.git
cd TIPSBoard
```

The production Docker Compose file is already included here:

```text
infra/gcp-gce/docker-compose.yml
```

Create the production env file:

```bash
cp infra/gcp-gce/app.env.example infra/gcp-gce/app.env
nano infra/gcp-gce/app.env
```

Set these at minimum:

```text
APP_HOST=app.yourdomain.com
API_HOST=api.yourdomain.com
APP_URL=https://app.yourdomain.com
SERVER_URL=https://api.yourdomain.com
CORS_ORIGIN=https://app.yourdomain.com
COOKIE_DOMAIN=.yourdomain.com
DATABASE_PASSWORD=...
REDIS_PASSWORD=...
EXPRESS_SESSION_SECRET=...
SOCKETIO_PASSWORD=...
OAuth client ids/secrets
```

Start the stack:

```bash
docker compose --env-file infra/gcp-gce/app.env -f infra/gcp-gce/docker-compose.yml up -d --build
```

The server container runs Prisma migrations on startup.

Seed LeetCode questions once:

```bash
docker compose --env-file infra/gcp-gce/app.env -f infra/gcp-gce/docker-compose.yml exec server npm run prisma-seed
```

Check logs:

```bash
docker compose --env-file infra/gcp-gce/app.env -f infra/gcp-gce/docker-compose.yml logs -f
```

## 7. Rebuild After Code Changes

On the VM:

```bash
cd /opt/tips/TIPSBoard
git pull
docker compose --env-file infra/gcp-gce/app.env -f infra/gcp-gce/docker-compose.yml up -d --build
```

## 8. Chrome Extension

For Chrome Web Store upload, build locally or on the VM with production URLs:

```bash
cd extension
VITE_APP_URL=https://app.yourdomain.com \
VITE_SERVER_URL=https://api.yourdomain.com \
npm run build
```

Upload `extension/dist` to Chrome Web Store.
