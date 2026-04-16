#!/bin/bash
set -euo pipefail

EC2_HOST="${EC2_HOST:?Set EC2_HOST (Elastic IP of your EC2 instance)}"
EC2_KEY="${EC2_KEY:?Set EC2_KEY (path to .pem key file)}"
EC2_USER="${EC2_USER:-ec2-user}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

echo "==> Building API image..."
docker build -t youstream-api:latest -f "$BACKEND_DIR/Dockerfile.api" "$BACKEND_DIR"

echo "==> Building Worker image..."
docker build -t youstream-worker:latest -f "$BACKEND_DIR/Dockerfile.worker" "$BACKEND_DIR"

echo "==> Saving images..."
docker save youstream-api:latest | gzip > /tmp/youstream-api.tar.gz
docker save youstream-worker:latest | gzip > /tmp/youstream-worker.tar.gz

echo "==> Uploading to EC2..."
scp -i "$EC2_KEY" -o StrictHostKeyChecking=no \
  /tmp/youstream-api.tar.gz \
  /tmp/youstream-worker.tar.gz \
  "$BACKEND_DIR/docker-compose.prod.yml" \
  "$EC2_USER@$EC2_HOST:/tmp/"

echo "==> Deploying on EC2..."
ssh -i "$EC2_KEY" -o StrictHostKeyChecking=no "$EC2_USER@$EC2_HOST" << 'REMOTE'
  echo "Loading images..."
  docker load < /tmp/youstream-api.tar.gz
  docker load < /tmp/youstream-worker.tar.gz

  # Install docker-compose plugin if not present
  if ! docker compose version &>/dev/null; then
    echo "Installing Docker Compose plugin..."
    sudo mkdir -p /usr/local/lib/docker/cli-plugins
    sudo curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
      -o /usr/local/lib/docker/cli-plugins/docker-compose
    sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  fi

  # Move compose file to home dir
  cp /tmp/docker-compose.prod.yml ~/docker-compose.prod.yml

  # Stop old single-container setup if running
  docker stop youstream-api 2>/dev/null || true
  docker rm youstream-api 2>/dev/null || true

  # Start all services via docker-compose
  cd ~
  docker compose -f docker-compose.prod.yml up -d

  # Cleanup
  rm -f /tmp/youstream-api.tar.gz /tmp/youstream-worker.tar.gz /tmp/docker-compose.prod.yml

  echo ""
  echo "==> Deploy complete!"
  docker compose -f docker-compose.prod.yml ps
REMOTE

rm -f /tmp/youstream-api.tar.gz /tmp/youstream-worker.tar.gz
echo "==> Done."
