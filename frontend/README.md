# YouStream Frontend

React Native mobile app for the YouStream OTT streaming platform.

## Tech Stack

- **Framework**: React Native 0.85
- **Language**: TypeScript 5.8
- **Navigation**: React Navigation 7 (native stack + bottom tabs)
- **State Management**: Redux Toolkit + React Redux
- **HTTP Client**: Axios (with token refresh interceptor)
- **Video Player**: WebView + hls.js (adaptive HLS streaming)
- **File Uploads**: react-native-blob-util (multipart with progress)
- **Storage**: AsyncStorage (tokens, user data)
- **Styling**: StyleSheet with centralized theme constants

## Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── ContentCard.tsx             # Poster/backdrop card (two sizes)
│   │   ├── ContentRow.tsx              # Horizontal scrollable content list
│   │   ├── HeroBanner.tsx              # Featured content banner with gradient
│   │   └── LoadingSpinner.tsx          # Activity indicator
│   ├── hooks/
│   │   └── useAuth.ts                  # Auth state hook + typed dispatch
│   ├── navigation/
│   │   ├── AppNavigator.tsx            # Root: auth check → Auth or Main
│   │   ├── AuthNavigator.tsx           # Login → OTP stack
│   │   └── MainNavigator.tsx           # Bottom tabs + modal screens
│   ├── screens/
│   │   ├── LoginScreen.tsx             # Phone number input (+91)
│   │   ├── OTPScreen.tsx               # 6-digit OTP with auto-advance
│   │   ├── HomeScreen.tsx              # Hero banner + content rows
│   │   ├── SearchScreen.tsx            # Real-time search with results
│   │   ├── ContentDetailScreen.tsx     # Backdrop, metadata, play button, episodes
│   │   ├── PlayerScreen.tsx            # WebView HLS player with quality selector
│   │   ├── UploadScreen.tsx            # Video/torrent upload with progress
│   │   ├── ActivityScreen.tsx          # Active downloads & recent uploads
│   │   ├── MyListScreen.tsx            # Favorites grid (3 columns)
│   │   └── ProfileScreen.tsx           # User info, settings, sign out
│   ├── services/
│   │   ├── api.ts                      # Axios instance with auth interceptor
│   │   ├── auth.service.ts             # OTP send/verify, token management
│   │   └── content.service.ts          # Content, streaming, upload, favorites
│   ├── store/
│   │   ├── store.ts                    # Redux store (auth + content slices)
│   │   ├── authSlice.ts                # Auth state, login/logout thunks
│   │   └── contentSlice.ts             # Home data, search thunks
│   ├── theme/
│   │   ├── colors.ts                   # Netflix-dark palette (#E50914, #141414)
│   │   ├── spacing.ts                  # Spacing scale, border radii, card sizes
│   │   └── index.ts                    # Theme exports
│   └── types/
│       └── index.ts                    # TypeScript interfaces (User, Content, etc.)
├── App.tsx                             # Root: Redux Provider + Navigation + StatusBar
├── index.js                            # App registration
├── app.json                            # App name: YouStreamApp
├── android/                            # Android native project
├── assets/
│   └── YouStream_icon.svg
├── tsconfig.json
├── babel.config.js
├── metro.config.js
└── package.json
```

## Getting Started

### Prerequisites

- Node.js >= 20
- React Native CLI
- Android Studio (for Android) / Xcode (for iOS)
- Running backend server (local or production)

### Install & Run

```bash
cd frontend
npm install

# Start Metro bundler
npm start

# Run on Android
npm run android

# Run on iOS
npm run ios
```

### API Configuration

The API base URL is configured in `src/services/api.ts`:
- **Production**: `http://13.200.190.1:3000/api/v1`
- **Android emulator**: `http://10.0.2.2:3000/api/v1`
- **iOS simulator**: `http://localhost:3000/api/v1`

## Screens

### Authentication
| Screen | Description |
|--------|-------------|
| **LoginScreen** | Phone number input with +91 prefix. Sends OTP via backend. |
| **OTPScreen** | 6-digit code entry with auto-advance between fields. Auto-submits when complete. |

### Main App (Bottom Tabs)
| Tab | Screen | Description |
|-----|--------|-------------|
| Home | **HomeScreen** | Hero banner + categorized content rows. Pull-to-refresh. |
| Upload | **UploadScreen** | Multi-step: pick file -> enter details -> upload/download -> transcode -> done. |
| Activity | **ActivityScreen** | Active downloads/transcodes with progress. Polls every 3s. |
| Profile | **ProfileScreen** | User info, settings menu, sign out. |

### Modal Screens (full-screen, no tabs)
| Screen | Description |
|--------|-------------|
| **SearchScreen** | Real-time search (min 2 chars). Shows poster, title, metadata. |
| **ContentDetailScreen** | Backdrop image, play button, cast, genres. Episode list for series. |
| **PlayerScreen** | Custom HTML5 video player in WebView with Netflix-style controls. |
| **MyListScreen** | 3-column favorites grid. |

## Video Player

The player (`PlayerScreen.tsx`) uses a WebView with an inline HTML5 video player:

- **HLS streams**: Uses [hls.js](https://github.com/video-dev/hls.js/) for adaptive bitrate playback
- **Raw videos**: Native `<video>` element for direct .mp4 playback
- **Quality selector**: Gear icon in top-right opens quality panel (Auto / 480p / 720p / 1080p)
- **Controls**: Play/pause, 10s skip forward/backward, seek bar, time display
- **CORS handling**: WebView `baseUrl` is set to the stream's origin domain to avoid CORS issues with hls.js XHR requests
- **Overlay**: Auto-hides after 4 seconds of playback, tap to toggle

## Navigation Flow

```
AppNavigator
├── AuthNavigator (when logged out)
│   ├── Login
│   └── OTP
└── MainNavigator (when logged in)
    ├── Bottom Tabs
    │   ├── Home → HomeScreen
    │   ├── Upload → UploadScreen
    │   ├── Activity → ActivityScreen
    │   └── Profile → ProfileScreen
    └── Modal Stack
        ├── Search
        ├── ContentDetail
        ├── Player
        └── MyList
```

## State Management

### Auth Slice
- `user` — Current user object
- `isLoggedIn` — Auth state flag
- Thunks: `checkAuth()`, `sendOTP()`, `verifyOTP()`, `logout()`

### Content Slice
- `homeData` — Hero content + categorized rows
- `searchResults` — Search results array
- Thunks: `fetchHomeData()`, `searchContent()`

## Theme

Netflix-inspired dark theme:
- **Primary**: `#E50914` (red)
- **Background**: `#141414` (dark)
- **Surface**: `#1F1F1F` (elevated)
- **Text**: `#FFFFFF` / `#B3B3B3` / `#808080`
- **Success**: `#46D369` / **Warning**: `#F5C518`

Responsive card sizes using screen width percentages (poster: 28% width, backdrop: 70% width).

## Services

### API Service (`api.ts`)
- Axios instance with 15s timeout
- Request interceptor: attaches Bearer token from AsyncStorage
- Response interceptor: auto-refreshes expired tokens (401 handling)

### Auth Service (`auth.service.ts`)
- `sendOTP(phone)` / `verifyOTP(phone, otp)` — OTP flow
- `getMe()` — Fetch current user
- `logout()` — Clear tokens from storage
- `isLoggedIn()` — Check for stored token

### Content Service (`content.service.ts`)
- Content: `getHomeRows()`, `getContents()`, `getContentById()`, `getGenres()`
- Search: `search()`, `autocomplete()`
- Streaming: `getStreamUrl()`, `updateProgress()`
- Favorites: `getFavorites()`, `addFavorite()`, `removeFavorite()`
- Upload: `uploadVideo()`, `uploadTorrent()`, `getTranscodeStatus()`, `cancelTorrent()`, `getActivity()`
