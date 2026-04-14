# YouStream Backend

REST API server for the YouStream OTT streaming platform.

## Tech Stack

- **Runtime**: Node.js 20
- **Framework**: Express.js 4
- **Language**: TypeScript 5
- **Database**: MongoDB (Mongoose ODM)
- **Build Tool**: Nx monorepo
- **Auth**: JWT (access + refresh tokens), OTP-based login
- **Video Processing**: FFmpeg (HLS transcoding, adaptive bitrate)
- **Storage**: Local filesystem or AWS S3 + CloudFront CDN
- **Containerization**: Docker (multi-stage build)

## Project Structure

```
backend/
├── apps/api/src/
│   ├── main.ts                         # Entry point — boots Express, connects MongoDB
│   ├── app.ts                          # Express app setup (middleware, routes, static)
│   ├── config/index.ts                 # Centralized config from env vars
│   ├── database/connection.ts          # MongoDB connection
│   ├── middleware/
│   │   ├── auth.middleware.ts          # JWT verification, admin guard
│   │   └── error.middleware.ts         # Global error & 404 handler
│   ├── routes/
│   │   ├── index.ts                    # Route aggregator (/api/v1/*)
│   │   ├── auth.routes.ts
│   │   ├── user.routes.ts
│   │   ├── content.routes.ts
│   │   ├── search.routes.ts
│   │   ├── streaming.routes.ts
│   │   └── upload.routes.ts
│   ├── controllers/
│   │   ├── auth.controller.ts          # OTP, JWT, QR login
│   │   ├── user.controller.ts          # Profiles, favorites, watch history
│   │   ├── content.controller.ts       # CRUD, home rows, genres, categories
│   │   ├── search.controller.ts        # Full-text search, autocomplete
│   │   ├── streaming.controller.ts     # Stream URL resolution, progress tracking
│   │   ├── upload.controller.ts        # Video upload, FFmpeg HLS transcode
│   │   └── torrent.controller.ts       # Torrent download, remux, transcode
│   ├── models/
│   │   ├── user.model.ts
│   │   ├── profile.model.ts
│   │   ├── content.model.ts
│   │   ├── genre.model.ts
│   │   ├── category.model.ts
│   │   ├── watch-history.model.ts
│   │   ├── favorite.model.ts
│   │   ├── otp.model.ts
│   │   ├── qr-session.model.ts
│   │   └── device.model.ts
│   ├── utils/
│   │   ├── jwt.ts                      # Token generation & verification
│   │   ├── s3.ts                       # S3 upload, directory sync, cleanup
│   │   └── response.ts                 # Standardized JSON responses
│   ├── seeds/seed.ts                   # Sample data (genres, categories, content, admin user)
│   └── types/torrent-stream.d.ts
├── Dockerfile                          # Multi-stage: build (Nx/tsc) + runtime (Node + FFmpeg)
├── docker-compose.yml                  # Local dev with MongoDB container
├── scripts/deploy.sh                   # SSH-based deploy to EC2
├── nx.json
├── tsconfig.base.json
└── package.json
```

## Getting Started

### Prerequisites

- Node.js >= 20
- MongoDB (local or Atlas)
- FFmpeg (for transcoding)

### Install & Run

```bash
cd backend
npm install

# Start dev server (hot reload via tsx)
npm run serve

# Build for production
npm run build

# Seed sample data
npm run seed
```

### Environment Variables

Create a `.env` file in `/backend`:

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | development | Environment mode |
| `PORT` | 3000 | API server port |
| `STORAGE_MODE` | local | `local` = filesystem, `s3` = S3 + CloudFront |
| `STORAGE_ROOT` | ../storage | Base path for uploads/ and streams/ |
| `MONGO_URI` | mongodb://localhost:27017/youstream | MongoDB connection string |
| `JWT_SECRET` | youstream-dev-secret | Access token signing key |
| `JWT_REFRESH_SECRET` | youstream-dev-refresh-secret | Refresh token signing key |
| `JWT_ACCESS_EXPIRY_SECONDS` | 3600 | Access token TTL (1 hour) |
| `JWT_REFRESH_EXPIRY_SECONDS` | 2592000 | Refresh token TTL (30 days) |
| `OTP_MODE` | mock | `mock` = always accepts 123456 |
| `OTP_MOCK_CODE` | 123456 | Mock OTP code |
| `AWS_REGION` | ap-south-1 | AWS region |
| `AWS_S3_RAW_BUCKET` | ott-raw | Temporary raw upload bucket |
| `AWS_S3_STREAMING_BUCKET` | ott-streaming | HLS output bucket |
| `CLOUDFRONT_DOMAIN` | (empty) | CloudFront base URL |

## API Endpoints

### Auth (public)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/send-otp` | Send OTP to phone number |
| POST | `/api/v1/auth/verify-otp` | Verify OTP, returns JWT tokens |
| POST | `/api/v1/auth/refresh-token` | Refresh expired access token |
| GET | `/api/v1/auth/qr-generate` | Generate QR code for TV pairing |
| POST | `/api/v1/auth/qr-authorize` | Authorize QR session (mobile) |
| GET | `/api/v1/auth/qr-status/:sessionId` | Poll QR login status (TV) |
| GET | `/api/v1/auth/me` | Get current user (requires token) |

### Content (public read, admin write)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/content` | List content (paginated, filterable) |
| GET | `/api/v1/content/:id` | Single content details |
| GET | `/api/v1/content/home/rows` | Home screen rows (hero + categories) |
| POST | `/api/v1/content` | Create content (admin) |
| PUT | `/api/v1/content/:id` | Update content (admin) |
| DELETE | `/api/v1/content/:id` | Delete content (admin) |
| GET | `/api/v1/genres` | List all genres |
| GET | `/api/v1/categories` | List all categories |

### Search (public)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/search?q=...` | Full-text search with filters |
| GET | `/api/v1/search/autocomplete?q=...` | Autocomplete suggestions (max 5) |

### Streaming (requires token)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/streaming/:contentId/url` | Get HLS or raw stream URL |
| POST | `/api/v1/streaming/progress` | Save watch progress |
| GET | `/api/v1/streaming/progress/:profileId/:contentId` | Get watch progress |

### User (requires token)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/users/profiles` | Get user profiles |
| POST | `/api/v1/users/profiles` | Create profile (max 5) |
| PUT | `/api/v1/users/profiles/:profileId` | Update profile |
| DELETE | `/api/v1/users/profiles/:profileId` | Delete profile |
| GET | `/api/v1/users/favorites/:profileId` | Get favorites |
| POST | `/api/v1/users/favorites` | Add to favorites |
| DELETE | `/api/v1/users/favorites/:profileId/:contentId` | Remove from favorites |
| GET | `/api/v1/users/watch-history/:profileId` | Get watch history |
| GET | `/api/v1/users/continue-watching/:profileId` | Get continue watching list |

### Upload (requires token)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/upload/video` | Upload video (max 500MB), optional transcode |
| POST | `/api/v1/upload/torrent` | Upload .torrent file, start download |
| POST | `/api/v1/upload/torrent/:contentId/cancel` | Cancel active download |
| GET | `/api/v1/upload/status/:contentId` | Check transcode/download status |
| GET | `/api/v1/upload/activity` | Recent uploads & active downloads |

## Video Transcoding

When a video is uploaded with `transcode=true`, the backend:

1. Probes the video with FFprobe (dimensions, duration, orientation)
2. Selects quality tiers that don't upscale the source:
   - **480p**: 1500 kbps video, 192 kbps audio
   - **720p**: 4000 kbps video, 192 kbps audio
   - **1080p**: 8000 kbps video, 192 kbps audio
3. Runs FFmpeg with multi-variant HLS output (`-var_stream_map`)
4. Generates a `master.m3u8` with all available quality levels
5. Renames output directories from `0/1/2` to `480p/720p/1080p`
6. Uploads to S3 (production) or serves locally (development)
7. Falls back to single-quality transcode if multi-variant fails

Portrait videos are handled correctly (480x854, 720x1280, 1080x1920).

## Data Models

| Model | Key Fields | Purpose |
|-------|-----------|---------|
| User | phone, name, role, subscriptionStatus | User accounts |
| Profile | userId, name, avatar, isKids, ratingCeiling | Multi-profile (up to 5) |
| Content | title, type, streaming.hlsUrl, rawUrl, status | Movies & series |
| Genre | name, slug | Content genres |
| Category | name, slug, order | Home screen row categories |
| WatchHistory | profileId, contentId, progressSeconds, completed | Per-profile progress |
| Favorite | profileId, contentId | Per-profile favorites |
| OTP | phone, code, expiresAt | Phone verification (TTL indexed) |
| QRSession | sessionId, status, tokens | TV login flow |
| Device | userId, deviceId, deviceType | Device registry |

## Deployment

See [DEPLOYMENT.md](../DEPLOYMENT.md) for full AWS deployment guide (EC2, S3, CloudFront, Docker).

### Quick Deploy

```bash
# Option A: Build on EC2
tar czf /tmp/youstream-backend.tar.gz --exclude='backend/node_modules' --exclude='backend/dist' backend/
scp -i ~/.ssh/youstream-key.pem /tmp/youstream-backend.tar.gz ec2-user@13.200.190.1:/tmp/
# Then SSH in, extract, docker build, docker run

# Option B: Local script
EC2_HOST=13.200.190.1 EC2_KEY=~/.ssh/youstream-key.pem ./scripts/deploy.sh

# Option C: Push to main → GitHub Actions auto-deploys
```
