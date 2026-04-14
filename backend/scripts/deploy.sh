#!/bin/bash
set -euo pipefail

EC2_HOST="${EC2_HOST:?Set EC2_HOST (Elastic IP of your EC2 instance)}"
EC2_KEY="${EC2_KEY:?Set EC2_KEY (path to .pem key file)}"
EC2_USER="${EC2_USER:-ec2-user}"
IMAGE_NAME="youstream-api"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

echo "==> Building Docker image..."
docker build -t "$IMAGE_NAME:latest" "$BACKEND_DIR"

echo "==> Saving image..."
docker save "$IMAGE_NAME:latest" | gzip > /tmp/"$IMAGE_NAME".tar.gz

echo "==> Uploading to EC2 (~300MB, this may take a few minutes)..."
scp -i "$EC2_KEY" -o StrictHostKeyChecking=no \
  /tmp/"$IMAGE_NAME".tar.gz "$EC2_USER@$EC2_HOST:/tmp/"

echo "==> Deploying on EC2..."
ssh -i "$EC2_KEY" -o StrictHostKeyChecking=no "$EC2_USER@$EC2_HOST" << REMOTE
  docker load < /tmp/$IMAGE_NAME.tar.gz
  docker stop $IMAGE_NAME 2>/dev/null || true
  docker rm $IMAGE_NAME 2>/dev/null || true
  docker run -d \
    --name $IMAGE_NAME \
    --restart unless-stopped \
    -p 3000:3000 \
    -v /home/ec2-user/storage:/app/storage \
    --env-file /home/ec2-user/.env.production \
    $IMAGE_NAME:latest
  rm /tmp/$IMAGE_NAME.tar.gz
  echo ""
  echo "==> Deploy complete!"
  docker ps --filter name=$IMAGE_NAME --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
REMOTE

rm /tmp/"$IMAGE_NAME".tar.gz
echo "==> Done."
