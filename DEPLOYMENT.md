# YouStream — AWS Deployment Guide

> **Status**: LIVE — Multi-service deployment on 2026-04-16

## Architecture

```
                          Internet
                             │
                    ┌────────┴────────┐
                    │                 │
           ┌───────▼────────┐  ┌─────▼──────────────────┐
           │  EC2 t3.small  │  │  CloudFront CDN         │
           │  13.200.190.1  │  │  d1xzgwjb57w3t7        │
           │                │  │  .cloudfront.net        │
           │  3 containers: │  │  *.m3u8 → 60s cache     │
           │  ┌───────────┐ │  │  *.ts   → 86400s cache  │
           │  │ API :3000 │ │  └─────┬──────────────────┘
           │  │ Express   │ │        │
           │  │ Auth/CRUD │ │  ┌─────▼──────────────────┐
           │  └─────┬─────┘ │  │  S3: youstream-streaming│
           │        │enqueue│  │  (private, OAC only)     │
           │  ┌─────▼─────┐ │  └─────────────────────────┘
           │  │  MongoDB  │ │
           │  │  Job Queue│ │
           │  └──┬─────┬──┘ │
           │     │     │    │
           │  ┌──▼──┐┌─▼──┐│
           │  │Torr-││Trans││
           │  │ent  ││code ││
           │  │Work-││Work-││
           │  │er   ││er   ││
           │  └─────┘└─────┘│
           └───────┬────────┘
                   │
          ┌────────▼───────────────┐
          │  MongoDB Atlas M0      │
          │  cluster0.dvigj1i      │
          │  .mongodb.net          │
          │  - content collection  │
          │  - jobs collection     │
          └────────────────────────┘

Upload Flow:
  Mobile App → API → enqueue job → Torrent Worker downloads →
  Transcoder Worker (FFmpeg HLS) → S3 upload → CloudFront URL in MongoDB

Key: API restart does NOT affect active downloads or transcoding.
     Workers auto-recover stale jobs on restart.
```

---

## Quick Reference

| Resource | Value |
|----------|-------|
| **API URL** | `http://13.200.190.1:3000` |
| **Health Check** | `http://13.200.190.1:3000/health` |
| **CDN URL** | `https://d1xzgwjb57w3t7.cloudfront.net` |
| **SSH** | `ssh -i ~/.ssh/youstream-key.pem ec2-user@13.200.190.1` |
| **Logs** | `docker compose -f docker-compose.prod.yml logs -f` (via SSH) |
| **AWS Profile** | `--profile youstream` |
| **AWS Region** | ap-south-1 (Mumbai) |
| **AWS Account** | 193116636728 (IAM user: admin) |

---

## AWS Account

- **Account ID**: 193116636728
- **IAM User**: admin
- **Region**: ap-south-1 (Mumbai)
- **AWS CLI Profile**: `youstream` (configured locally at `~/.aws/credentials`)
- **Access Key ID**: AKIASZ5VGAY4KPMDZZ7I

---

## MongoDB Atlas

- **Cluster**: cluster0.dvigj1i.mongodb.net
- **Tier**: M0 (free, 512MB storage)
- **Database**: `youstream`
- **User**: management_db_user
- **Password**: oNNPezCQ9PUKBAnn
- **Connection string**:
  ```
  mongodb+srv://management_db_user:oNNPezCQ9PUKBAnn@cluster0.dvigj1i.mongodb.net/youstream?appName=Cluster0
  ```
- **Network access**: 0.0.0.0/0 (allow from anywhere)

---

## S3 Buckets

### youstream-raw
- **Purpose**: Temporary storage for raw uploaded videos before/during transcoding
- **Region**: ap-south-1
- **Public access**: Blocked (all 4 block-public-access settings enabled)
- **Lifecycle rule**: `DeleteAfter24h` — auto-deletes all objects after 24 hours
- **Usage**: Raw video files are stored temporarily. After FFmpeg transcodes to HLS, the raw file is deleted locally. The 24h lifecycle is a safety net for cleanup.

### youstream-streaming
- **Purpose**: Permanent HLS output served by CloudFront
- **Region**: ap-south-1
- **Public access**: Blocked (only CloudFront can read via OAC)
- **Bucket policy**: Grants `s3:GetObject` to CloudFront distribution `EQ8XN6QA6UXO8` via service principal condition
- **Key structure**:
  ```
  {contentId}/
    master.m3u8                  ← master playlist (variant selector)
    480p/
      stream.m3u8                ← 480p playlist
      segment_000.ts             ← video segments
      segment_001.ts
      ...
    720p/
      stream.m3u8                ← 720p playlist
      segment_000.ts
      segment_001.ts
      ...
  ```
- **Note**: HLS manifests use relative paths — no URL rewriting needed. CloudFront resolves them correctly.

---

## CloudFront CDN

| Setting | Value |
|---------|-------|
| **Distribution ID** | EQ8XN6QA6UXO8 |
| **Domain** | https://d1xzgwjb57w3t7.cloudfront.net |
| **Origin** | youstream-streaming.s3.ap-south-1.amazonaws.com |
| **Origin Access Control (OAC)** | E2Q87O3TVT7CEJ (youstream-s3-oac) |
| **Price Class** | PriceClass_200 (NA, EU, Asia, Middle East, Africa) |
| **HTTP Version** | HTTP/2 and HTTP/3 |
| **Viewer Protocol** | Redirect HTTP to HTTPS |
| **Compression** | Enabled |

### Cache Behaviors

| Pattern | Cache Policy | TTL | Purpose |
|---------|-------------|-----|---------|
| `*.m3u8` | YouStream-HLS-Manifest-60s (`ef5d08ec-465c-43b6-86cd-7795345b86bb`) | 60s default, 300s max | HLS manifests — short cache so updates propagate quickly |
| `*` (default) | CachingOptimized (`658327ea-f89d-4fab-a63d-7e88639e58f6`) | 86400s (24h) | .ts segments — long cache since VOD segments never change |

### How Streaming Works (End-to-End)
1. Mobile app calls `GET /api/v1/streaming/:contentId/url` → EC2 API server
2. API reads `content.streaming.hlsUrl` from MongoDB (a full CloudFront URL)
3. API returns: `https://d1xzgwjb57w3t7.cloudfront.net/{contentId}/master.m3u8`
4. `react-native-video` fetches `master.m3u8` from CloudFront (edge-cached)
5. Player picks quality (480p/720p), fetches `stream.m3u8` via relative path from CloudFront
6. Player fetches `.ts` segments from CloudFront (24h edge cache)
7. On cache miss, CloudFront pulls from S3 via OAC (origin pull)

---

## EC2 Instance

| Setting | Value |
|---------|-------|
| **Instance ID** | i-0ac33f88b3aa04f21 |
| **Elastic IP** | 13.200.190.1 |
| **EIP Allocation ID** | eipalloc-029638d6954475aa2 |
| **Instance type** | t3.small (2 vCPU, 2GB RAM) |
| **AMI** | Amazon Linux 2023 (ami-0c95fa15b20f5400e, x86_64) |
| **EBS** | 30GB gp3 (root volume) |
| **VPC** | vpc-003083d772f66f17c (default) |
| **Security Group** | sg-0a5fe8346db4ed582 (youstream-sg) |
| **Key Pair** | youstream-key (`~/.ssh/youstream-key.pem`) |
| **Docker** | v25.0.14 |
| **Docker Compose** | v5.1.3 |
| **Containers** | api + torrent-worker + transcoder-worker (--restart unless-stopped) |

### Security Group Rules (Inbound)

| Port | Protocol | Source | Purpose |
|------|----------|--------|---------|
| 22 | TCP | 0.0.0.0/0 | SSH |
| 80 | TCP | 0.0.0.0/0 | HTTP (future: reverse proxy) |
| 443 | TCP | 0.0.0.0/0 | HTTPS (future: reverse proxy) |
| 3000 | TCP | 0.0.0.0/0 | API server (direct) |

### SSH Access
```bash
ssh -i ~/.ssh/youstream-key.pem ec2-user@13.200.190.1
```

### Files on EC2
```
/home/ec2-user/
├── .env.production              ← Production env vars (chmod 600)
├── docker-compose.prod.yml      ← Docker Compose for all 3 services
├── youstream/                   ← Git repo (used for docker build)
│   └── backend/
│       ├── Dockerfile.api       ← Slim API image (no FFmpeg)
│       ├── Dockerfile.worker    ← Worker image (with FFmpeg)
│       ├── apps/api/
│       ├── apps/torrent-worker/
│       ├── apps/transcoder-worker/
│       └── ...
└── storage/                     ← Shared Docker volume mount
    ├── uploads/                 ← Raw files during transcode
    ├── streams/                 ← HLS output during transcode
    └── torrents/                ← Torrent download temp files
```

### Docker Compose Services (3 containers)
```yaml
# docker-compose.prod.yml
services:
  api:                    # Express server — auth, CRUD, enqueue jobs
    image: youstream-api:latest
    ports: ["3000:3000"]

  torrent-worker:         # Downloads torrents, enqueues transcode jobs
    image: youstream-worker:latest
    command: ["node", "dist/apps/torrent-worker/torrent-worker/src/main.js"]

  transcoder-worker:      # FFmpeg HLS encoding, thumbnails, sprites
    image: youstream-worker:latest
    command: ["node", "dist/apps/transcoder-worker/transcoder-worker/src/main.js"]
```
All share: `/home/ec2-user/storage` volume, `.env.production`, MongoDB Atlas.

---

## Environment Variables

### STORAGE_MODE (key switch)
Controls the entire streaming pipeline:
- **`local`** (development) — FFmpeg outputs to local filesystem, Express serves HLS via `express.static`, stream URLs are `http://localhost:3000/streams/{id}/master.m3u8`
- **`s3`** (production) — FFmpeg outputs locally then uploads to S3, local files deleted, Express static disabled, stream URLs are `https://d1xzgwjb57w3t7.cloudfront.net/{id}/master.m3u8`

### Full Variable Reference

| Variable | Dev Default | Production Value | Description |
|----------|-------------|------------------|-------------|
| NODE_ENV | development | production | Environment mode |
| PORT | 3000 | 3000 | API server port |
| STORAGE_MODE | local | s3 | local = filesystem, s3 = S3+CloudFront |
| STORAGE_ROOT | (auto: ../storage) | /app/storage | Base path for uploads/ and streams/ |
| MONGO_URI | localhost:27017 | Atlas SRV string | MongoDB connection |
| JWT_SECRET | dev-secret | (unique per env) | Access token signing |
| JWT_REFRESH_SECRET | dev-secret | (unique per env) | Refresh token signing |
| JWT_ACCESS_EXPIRY_SECONDS | 3600 | 3600 | 1 hour |
| JWT_REFRESH_EXPIRY_SECONDS | 2592000 | 2592000 | 30 days |
| OTP_MODE | mock | mock | mock = always accepts 123456 |
| OTP_MOCK_CODE | 123456 | 123456 | Mock OTP code |
| OTP_EXPIRY_MINUTES | 5 | 5 | OTP validity window |
| AWS_REGION | ap-south-1 | ap-south-1 | AWS region |
| AWS_ACCESS_KEY_ID | (empty) | AKIASZ5VGAY4KPMDZZ7I | IAM credentials |
| AWS_SECRET_ACCESS_KEY | (empty) | (set in .env) | IAM credentials |
| AWS_S3_RAW_BUCKET | ott-raw | youstream-raw | Raw upload bucket |
| AWS_S3_STREAMING_BUCKET | ott-streaming | youstream-streaming | HLS output bucket |
| CLOUDFRONT_DOMAIN | cdn.yourdomain.com | https://d1xzgwjb57w3t7.cloudfront.net | CDN base URL |
| TORRENT_MAX_CONCURRENT | 3 | 3 | Max parallel torrent downloads |
| TORRENT_STALL_TIMEOUT_MS | 86400000 | 86400000 | 24 hours — how long to wait for stalled torrent |
| TRANSCODE_MAX_CONCURRENT | 1 | 1 | Max parallel FFmpeg transcodes (worker env var) |

---

## Deployment

### Quick Deploy (build on EC2 — recommended)

```bash
# SSH into EC2
ssh -i ~/.ssh/youstream-key.pem ec2-user@13.200.190.1

# Pull latest code
cd ~/youstream && git pull

# Build both images
cd backend
docker build -t youstream-api:latest -f Dockerfile.api .
docker build -t youstream-worker:latest -f Dockerfile.worker .

# Copy compose file and restart all services
cp docker-compose.prod.yml ~/docker-compose.prod.yml
cd ~
docker compose -f docker-compose.prod.yml up -d

# Verify
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail 10
```

### Deploy Script (builds locally, SCPs to EC2 — requires Docker Desktop)
```bash
cd backend
EC2_HOST=13.200.190.1 EC2_KEY=~/.ssh/youstream-key.pem bash scripts/deploy.sh
```
Builds API + Worker images locally, SCPs both tarballs + compose file to EC2, loads and runs.

### Deploy Only API (without affecting workers)
```bash
# Restart API only — active downloads and transcoding continue uninterrupted
ssh -i ~/.ssh/youstream-key.pem ec2-user@13.200.190.1
cd ~/youstream && git pull
cd backend && docker build -t youstream-api:latest -f Dockerfile.api .
cd ~ && docker compose -f docker-compose.prod.yml up -d api
```

### Deploy Only Workers (without affecting API)
```bash
ssh -i ~/.ssh/youstream-key.pem ec2-user@13.200.190.1
cd ~/youstream && git pull
cd backend && docker build -t youstream-worker:latest -f Dockerfile.worker .
cd ~ && docker compose -f docker-compose.prod.yml up -d torrent-worker transcoder-worker
```

### Docker Commands on EC2 (via SSH)
```bash
# View all running services
docker compose -f docker-compose.prod.yml ps

# View logs (all services, live)
docker compose -f docker-compose.prod.yml logs -f

# View logs for specific service
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f torrent-worker
docker compose -f docker-compose.prod.yml logs -f transcoder-worker

# Restart a single service (e.g. API only — workers unaffected)
docker compose -f docker-compose.prod.yml restart api

# Restart all services
docker compose -f docker-compose.prod.yml restart

# Stop everything
docker compose -f docker-compose.prod.yml down

# Rebuild and restart everything
docker compose -f docker-compose.prod.yml up -d --build

# Shell into a container (debugging)
docker compose -f docker-compose.prod.yml exec api sh
docker compose -f docker-compose.prod.yml exec torrent-worker sh

# Check disk usage
docker system df
```

### GitHub Actions (automatic on push to main)
1. Create ECR repository (one-time):
   ```bash
   aws ecr create-repository --repository-name youstream-api --region ap-south-1 --profile youstream
   aws ecr create-repository --repository-name youstream-worker --region ap-south-1 --profile youstream
   ```
2. Add GitHub Secrets to repo:
   - `AWS_ACCESS_KEY_ID` = AKIASZ5VGAY4KPMDZZ7I
   - `AWS_SECRET_ACCESS_KEY` = (the secret key)
   - `EC2_HOST` = 13.200.190.1
   - `EC2_SSH_KEY` = contents of `~/.ssh/youstream-key.pem`
3. Push to `main` branch with changes in `backend/` — workflow at `.github/workflows/deploy.yml` triggers automatically

---

## API Endpoints (Production)

**Base URL**: `http://13.200.190.1:3000`

### Public
```
GET  /health                              → {"status":"ok","timestamp":"..."}
```

### Auth (no token required)
```
POST /api/v1/auth/send-otp                → Send OTP to phone number
POST /api/v1/auth/verify-otp              → Verify OTP, returns JWT tokens
POST /api/v1/auth/refresh-token           → Refresh expired access token
GET  /api/v1/auth/qr-generate             → Generate QR code for TV pairing
```

### Content (requires Bearer token)
```
GET  /api/v1/content                      → List content (paginated)
GET  /api/v1/content/home/rows            → Home screen content rows
GET  /api/v1/content/:id                  → Single content details
GET  /api/v1/search?q=...                 → Search content
```

### Streaming (requires Bearer token)
```
GET  /api/v1/streaming/:contentId/url     → Get CloudFront HLS URL
POST /api/v1/streaming/progress           → Update watch progress
GET  /api/v1/streaming/progress/:pid/:cid → Get watch progress
```

### User (requires Bearer token)
```
GET  /api/v1/users/profile                → Get user profile
PUT  /api/v1/users/profile                → Update profile
POST /api/v1/users/devices                → Register device
GET  /api/v1/users/favorites              → Get favorites
POST /api/v1/users/favorites              → Add to favorites
GET  /api/v1/users/watch-history          → Get watch history
```

### Upload (requires Bearer token + admin role)
```
POST /api/v1/upload/video                 → Upload video file (max 500MB)
GET  /api/v1/upload/status/:contentId     → Check transcode status
```

---

## Dockerfiles

### Dockerfile.api (slim — no FFmpeg)
- Multi-stage build: `node:20-slim` builder + `node:20-slim` runtime
- Builds only the API via `npx nx build api`
- Entry point: `dist/apps/api/main.js`
- No FFmpeg — all transcoding/torrent logic runs in workers

### Dockerfile.worker (full — with FFmpeg)
- Multi-stage build: `node:20-slim` builder + `node:20-slim` + FFmpeg runtime
- Builds both workers via `npx nx build torrent-worker` + `npx nx build transcoder-worker`
- Entry point overridden by docker-compose `command` to select which worker to run
- Torrent worker: `dist/apps/torrent-worker/torrent-worker/src/main.js`
- Transcoder worker: `dist/apps/transcoder-worker/transcoder-worker/src/main.js`

**Note**: Workers include `../api/src/**/*.ts` in their build (for shared models/config/utils), so the output path includes the app name subdirectory.

---

## Cost Estimate (~personal project scale)

| Service | Configuration | Monthly Cost |
|---------|---------------|-------------|
| EC2 | t3.small on-demand | ~$15.00 |
| EBS | 30GB gp3 | ~$2.40 |
| S3 Storage | ~50GB HLS content | ~$1.15 |
| S3 Requests | PUT (uploads) + GET (origin pulls) | ~$0.50 |
| CloudFront | 100GB transfer (1TB free first year) | ~$0.00* |
| MongoDB Atlas | M0 free tier | $0.00 |
| Elastic IP | Attached to running instance | $0.00 |
| **Total** | | **~$19/mo** |

*CloudFront first 1TB/month is free for 12 months. After that: ~$8.50/mo for 100GB in ap-south-1.

### Cost Reduction Options
- **EC2 Spot Instance**: ~$6/mo (60% discount, acceptable for personal project)
- **EC2 t3.micro**: ~$7.50/mo (1 vCPU, 1GB RAM — tight for FFmpeg but works for small videos)
- **First-year free tier**: t3.micro is eligible — EC2 cost drops to $0

---

## Code Changes Summary

### New Files Created
| File | Purpose |
|------|---------|
| `backend/apps/api/src/utils/s3.ts` | S3 client, `uploadDirectoryToS3()`, `deleteLocalDirectory()` |
| `backend/.dockerignore` | Excludes node_modules, dist, .env, storage from Docker build |
| `backend/Dockerfile` | Multi-stage build: Nx build + Node.js runtime with FFmpeg |
| `backend/docker-compose.yml` | Local testing with API + MongoDB containers |
| `backend/scripts/deploy.sh` | SSH-based deploy script (build locally, SCP to EC2) |
| `.github/workflows/deploy.yml` | GitHub Actions CI/CD (ECR push + SSH deploy) |
| `DEPLOYMENT.md` | This file |

### Modified Files
| File | Change |
|------|--------|
| `backend/apps/api/src/config/index.ts` | Added `storageMode` ('local'/'s3') and `storageRoot` config fields |
| `backend/apps/api/src/app.ts` | Wrapped `express.static('/streams')` in `if (storageMode !== 's3')` — disabled in production |
| `backend/apps/api/src/controllers/upload.controller.ts` | After FFmpeg: uploads HLS to S3 via `uploadDirectoryToS3()`, cleans up local files, stores CloudFront URL in MongoDB |
| `backend/apps/api/src/controllers/streaming.controller.ts` | Updated comment; existing `hlsPath.startsWith('http')` check already handles CloudFront URLs |
| `backend/apps/api/src/routes/upload.routes.ts` | Multer destination uses `config.storageRoot` instead of hardcoded `__dirname` relative path |
| `backend/.env.example` | Added STORAGE_MODE, STORAGE_ROOT, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, updated bucket names |
| `backend/.env` | Updated with Atlas connection string + AWS credentials (gitignored) |
| `backend/package.json` | Added `@aws-sdk/client-s3` dependency |

---

## Troubleshooting

### Container keeps restarting
```bash
docker compose -f docker-compose.prod.yml logs api            # API logs
docker compose -f docker-compose.prod.yml logs torrent-worker  # Torrent logs
docker compose -f docker-compose.prod.yml logs transcoder-worker # Transcoder logs
```
Common causes:
- MongoDB Atlas IP not whitelisted → Add 0.0.0.0/0 in Atlas Network Access
- Wrong .env.production values → Check `/home/ec2-user/.env.production`
- Build path issue → Worker entry points include subdirectory (see Dockerfiles section)

### Can't connect to API from outside
- Check security group allows port 3000 inbound
- Check container is running: `docker compose -f docker-compose.prod.yml ps`
- Check Elastic IP is associated: `aws ec2 describe-addresses --profile youstream`

### Torrent download stuck / not starting
- Check torrent-worker is running: `docker compose -f docker-compose.prod.yml ps torrent-worker`
- Check worker logs: `docker compose -f docker-compose.prod.yml logs -f torrent-worker`
- Check jobs collection in MongoDB for pending/stale jobs
- Worker uses Change Streams (Atlas) — if it shows "polling mode", that's fine too

### Transcode not starting after download completes
- Torrent worker enqueues a transcode job on completion
- Check transcoder-worker logs: `docker compose -f docker-compose.prod.yml logs -f transcoder-worker`
- Check jobs collection for `type: 'transcode'` with `status: 'pending'`

### API restart — do downloads survive?
- Yes. Restart API without affecting workers:
  ```bash
  docker compose -f docker-compose.prod.yml restart api
  ```
- Workers are separate containers, unaffected by API restart
- No cleanup hack — API no longer marks downloads as error on boot

### Worker restart — does download resume?
- Torrent worker: stale jobs auto-recovered (heartbeat > 2 min). torrent-stream with `verify: true` skips already-downloaded pieces, so a 70% download resumes from ~70%.
- Transcoder worker: stale jobs re-queued. FFmpeg restarts from scratch (no partial HLS resume), but the input file persists on the shared volume.

### CloudFront returns 403
- Check S3 bucket policy grants access to the distribution
- Check OAC is attached to the CloudFront origin
- Verify file exists in S3: `aws s3 ls s3://youstream-streaming/{contentId}/ --profile youstream`

### Transcode works but stream doesn't play
- Check files uploaded to S3: `aws s3 ls s3://youstream-streaming/{contentId}/ --recursive --profile youstream`
- Check CloudFront serves it: `curl -I https://d1xzgwjb57w3t7.cloudfront.net/{contentId}/master.m3u8`
- Check content.streaming.hlsUrl in MongoDB has full CloudFront URL
