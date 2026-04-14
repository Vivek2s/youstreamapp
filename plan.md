# YouStream - Development Plan & Change Log

## Recent Changes (April 2026)

### 1. Higher Bitrate Transcoding for Better Quality

**Files changed**: `backend/apps/api/src/controllers/upload.controller.ts`

**Problem**: Transcoded HLS streams had noticeably lower quality than the original uploaded video. The default bitrates were too conservative.

**Changes**:
- Increased video bitrates across all quality tiers:
  - **480p**: 800k -> 1500k
  - **720p**: 2500k -> 4000k
  - **1080p**: 5000k -> 8000k
- Increased audio bitrate: 128k -> 192k (AAC)
- Changed FFmpeg preset from `-preset fast` to `-preset slow` for better compression efficiency
- Changed profile from `main` to `high` and level from `4.0` to `4.1` for better codec features
- Added `-maxrate` and `-bufsize` constraints per-stream for consistent quality:
  - maxrate matches target bitrate
  - bufsize is 2x the target bitrate

**Quality tiers (landscape)**:
| Tier | Resolution | Video Bitrate | Audio Bitrate | Preset | Profile |
|------|-----------|---------------|---------------|--------|---------|
| 480p | 854x480 | 1500 kbps | 192 kbps | slow | high 4.1 |
| 720p | 1280x720 | 4000 kbps | 192 kbps | slow | high 4.1 |
| 1080p | 1920x1080 | 8000 kbps | 192 kbps | slow | high 4.1 |

**Quality tiers (portrait)**:
| Tier | Resolution | Video Bitrate | Audio Bitrate | Preset | Profile |
|------|-----------|---------------|---------------|--------|---------|
| 480p | 480x854 | 1500 kbps | 192 kbps | slow | high 4.1 |
| 720p | 720x1280 | 4000 kbps | 192 kbps | slow | high 4.1 |
| 1080p | 1080x1920 | 8000 kbps | 192 kbps | slow | high 4.1 |

**Trade-off**: `-preset slow` takes longer to transcode but produces significantly better quality at the same bitrate. For a VOD platform where content is transcoded once and streamed many times, this is the right trade-off.

---

### 2. Quality Selector in Video Player

**Files changed**: `frontend/src/screens/PlayerScreen.tsx`

**Problem**: HLS streams were transcoded into multiple quality levels (480p/720p/1080p) but the player had no UI to let users manually switch quality. The player relied entirely on hls.js auto quality selection.

**Changes**:

#### A. Stream type detection
- Added `streamType` state (`'hls' | 'raw'`) to differentiate between HLS and raw video streams
- Backend's `GET /streaming/:contentId/url` already returns `streamType` — now the frontend uses it

#### B. hls.js integration
- Added hls.js CDN script (`https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js`)
- For HLS streams: creates `Hls` instance with `startLevel: -1` (auto quality selection initially)
- For raw streams: falls back to native `<video src="...">` playback
- Exposes `hls.currentLevel` for programmatic quality switching

#### C. Quality selector UI
- **Gear icon**: Added settings gear SVG button in the top-right of the overlay bar (only visible for HLS streams)
- **Quality panel**: Floating dark panel positioned at bottom-right with:
  - "Quality" title header
  - "Auto" option (default, with checkmark)
  - Individual quality options (e.g., "854p HD", "480p") sorted highest-first
  - HD badge for 720p+ resolutions
  - Active state highlighting in red (#E50914)
- Panel auto-dismisses when tapping elsewhere or selecting a quality

#### D. Styles added
- `.quality-btn` — Gear icon button styling
- `.quality-panel` — Floating panel with blur backdrop
- `.quality-panel-title` — Uppercase "Quality" header
- `.quality-option` — Individual quality row with active/inactive states
- `.quality-badge` — Red "HD" badge

---

### 3. CORS Fix for HLS Playback in WebView

**Files changed**: `frontend/src/screens/PlayerScreen.tsx`

**Problem**: After adding hls.js for quality switching, HLS streams from CloudFront stopped playing. The WebView loaded inline HTML (origin: `null` from `about:blank`), and hls.js uses XMLHttpRequest to fetch `.m3u8` manifests and `.ts` segments. CloudFront rejected these cross-origin requests because no `Access-Control-Allow-Origin` header was present.

**Error**: `Access to XMLHttpRequest at 'https://d1xzgwjb57w3t7.cloudfront.net/...' from origin 'null' has been blocked by CORS policy`

**Root cause**: Before hls.js, the `<video src="...">` element loaded URLs directly (not subject to CORS). hls.js uses XHR which is subject to CORS enforcement.

**Fix**: Set `baseUrl` on the WebView's `source` prop to match the CloudFront domain origin. This makes the WebView's page origin match the stream URL's origin, turning hls.js XHR requests into same-origin requests (no CORS check needed).

```tsx
// Extract origin from stream URL
const baseUrl = streamUrl.startsWith('http') ? new URL(streamUrl).origin : undefined;

// Pass to WebView
<WebView source={{ html, baseUrl }} ... />
```

**Why this works**: On Android, `baseUrl` is passed to `loadDataWithBaseURL()`, which sets the page's origin. When the origin matches the XHR target domain, the browser treats it as same-origin and skips CORS preflight/checks entirely.

**Alternative approaches considered**:
- Adding CORS headers to CloudFront/S3 — requires AWS configuration changes and ongoing maintenance
- Backend proxy for HLS — defeats the purpose of CDN edge caching
- `allowUniversalAccessFromFileURLs` — security risk, allows all cross-origin requests

---

## Architecture Overview

```
                     Internet
                        |
               +--------+--------+
               |                 |
      +--------v--------+  +----v-------------------+
      |  EC2 (API)      |  |  CloudFront CDN        |
      |  t3.small       |  |  d1xzgwjb57w3t7        |
      |  13.200.190.1   |  |  .cloudfront.net       |
      |  :3000          |  +----+-------------------+
      |  - REST API     |       |
      |  - Auth/JWT     |  +----v-------------------+
      |  - FFmpeg       |  |  S3: youstream-streaming|
      |  - S3 upload    |  |  (private, OAC only)   |
      +--------+--------+  +------------------------+
               |
      +--------v-----------------+
      |  MongoDB Atlas M0        |
      |  cluster0.dvigj1i        |
      |  .mongodb.net            |
      +-------------------------+
```

### Upload & Transcode Flow
1. Mobile app uploads video via `POST /api/v1/upload/video`
2. Backend saves raw file, probes with FFprobe
3. FFmpeg transcodes to multi-quality HLS (480p/720p/1080p)
4. HLS output uploaded to S3 (`youstream-streaming` bucket)
5. Local files cleaned up
6. CloudFront URL saved to MongoDB (`content.streaming.hlsUrl`)

### Streaming Flow
1. Mobile app calls `GET /api/v1/streaming/:contentId/url`
2. Backend returns CloudFront URL + stream type (hls/raw)
3. Player loads hls.js for HLS streams (with quality selector)
4. hls.js fetches manifests and segments from CloudFront CDN
5. User can manually switch quality via gear icon

---

## Pending / Future Work

- [ ] Subtitle upload and selection UI
- [ ] Resume playback (continue watching integration in player)
- [ ] Offline downloads
- [ ] Push notifications for transcode completion
- [ ] Series episode navigation within the player
- [ ] User subscription management & payment integration
- [ ] Content recommendation engine
- [ ] Admin dashboard (web)
- [ ] Rate limiting per user (not just per IP)
- [ ] Custom domain + SSL for API (currently direct IP:3000)
- [ ] CloudFront CORS headers (belt-and-suspenders alongside baseUrl fix)
