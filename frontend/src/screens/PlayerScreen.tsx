import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, StatusBar } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebView as WebViewType } from 'react-native-webview';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { colors, spacing } from '../theme';
import { contentService } from '../services/content.service';
import { HomeStackParamList } from '../types';

type Props = {
  navigation: NativeStackNavigationProp<HomeStackParamList, 'Player'>;
  route: RouteProp<HomeStackParamList, 'Player'>;
};

export default function PlayerScreen({ navigation, route }: Props) {
  const { contentId, title } = route.params;
  const webViewRef = useRef<WebViewType>(null);

  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [streamType, setStreamType] = useState<'hls' | 'raw'>('raw');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadStreamUrl();
  }, [contentId]);

  const loadStreamUrl = async () => {
    try {
      const data = await contentService.getStreamUrl(contentId);
      console.log('[Player] Stream URL:', data.hlsUrl, 'type:', data.streamType);
      setStreamUrl(data.hlsUrl);
      setStreamType(data.streamType || 'raw');
    } catch (err: any) {
      console.log('[Player] Error loading stream:', err.message);
      setError('No stream available for this content');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading stream...</Text>
      </View>
    );
  }

  if (error || !streamUrl) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        <Text style={styles.errorIcon}>!</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.errorText}>{error || 'No stream URL available'}</Text>
        <TouchableOpacity style={styles.backButtonCenter} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Extract origin from stream URL so WebView same-origin policy allows hls.js XHR requests
  const baseUrl = streamUrl.startsWith('http') ? new URL(streamUrl).origin : undefined;

  const safeTitle = title.replace(/'/g, "\\'").replace(/"/g, '\\"');

  const html = `
<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
  * { margin:0; padding:0; box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  body { background:#000; width:100vw; height:100vh; overflow:hidden; font-family:-apple-system,sans-serif; }
  video { width:100%; height:100%; object-fit:contain; display:block; }

  .overlay {
    position:fixed; top:0; left:0; right:0; bottom:0;
    display:flex; flex-direction:column; justify-content:space-between;
    background:rgba(0,0,0,0.35);
    opacity:1; transition:opacity 0.3s;
    pointer-events:none; z-index:10;
  }
  .overlay.hidden { opacity:0; }
  .overlay > * { pointer-events:auto; }

  /* Top bar */
  .top-bar {
    display:flex; align-items:center; gap:14px;
    padding:20px 16px 32px;
    background:linear-gradient(to bottom, rgba(0,0,0,0.6), transparent);
  }
  .back-btn {
    width:40px; height:40px; display:flex; align-items:center; justify-content:center;
    background:none; border:none; cursor:pointer;
  }
  .back-btn svg { width:26px; height:26px; filter:drop-shadow(0 1px 3px rgba(0,0,0,0.8)); }
  .video-title {
    color:#fff; font-size:16px; font-weight:700; letter-spacing:0.3px;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1;
    text-shadow:0 1px 4px rgba(0,0,0,0.8);
  }

  /* Center controls */
  .center-controls {
    display:flex; align-items:center; justify-content:center; gap:48px;
  }
  .ctrl-btn {
    width:52px; height:52px; display:flex; align-items:center; justify-content:center;
    flex-direction:column;
    background:rgba(0,0,0,0.5); border-radius:50%; border:none; cursor:pointer;
    color:#fff; font-weight:800; backdrop-filter:blur(4px);
    -webkit-backdrop-filter:blur(4px);
  }
  .ctrl-btn svg { width:26px; height:26px; }
  .ctrl-btn span { font-size:9px; margin-top:-2px; }
  .play-btn {
    width:68px; height:68px; background:rgba(0,0,0,0.55); border-radius:50%;
    border:2px solid rgba(255,255,255,0.3); cursor:pointer;
    display:flex; align-items:center; justify-content:center;
    backdrop-filter:blur(4px); -webkit-backdrop-filter:blur(4px);
  }
  .play-btn svg { width:32px; height:32px; filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5)); }

  /* Netflix-style bottom bar */
  .bottom-bar {
    padding:0 16px 48px;
    background:linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 50%, transparent 100%);
  }
  .progress-wrap {
    position:relative; width:100%; height:20px; display:flex; align-items:center;
    cursor:pointer; margin-bottom:8px;
  }
  .progress-track {
    position:absolute; left:0; right:0; height:3px; background:rgba(255,255,255,0.25);
    border-radius:2px; top:50%; transform:translateY(-50%);
    transition:height 0.15s;
  }
  .progress-wrap:active .progress-track, .progress-wrap:hover .progress-track { height:5px; }
  .progress-buffer {
    position:absolute; left:0; height:100%; background:rgba(255,255,255,0.15);
    border-radius:2px;
  }
  .progress-fill {
    position:absolute; left:0; height:100%; background:#E50914;
    border-radius:2px;
  }
  .progress-thumb {
    position:absolute; width:14px; height:14px; background:#E50914;
    border-radius:50%; top:50%; transform:translate(-50%,-50%);
    box-shadow:0 0 4px rgba(0,0,0,0.5); transition:transform 0.1s;
  }
  .progress-wrap:active .progress-thumb { transform:translate(-50%,-50%) scale(1.3); }
  .seek-input {
    position:absolute; width:100%; height:100%; opacity:0; cursor:pointer;
    -webkit-appearance:none; margin:0; z-index:2;
  }
  .time-row {
    display:flex; justify-content:space-between; align-items:center;
  }
  .time-text {
    color:#fff; font-size:13px; font-weight:600;
    text-shadow:0 1px 3px rgba(0,0,0,0.7);
  }

  /* Quality selector */
  .quality-btn {
    width:40px; height:40px; display:flex; align-items:center; justify-content:center;
    background:none; border:none; cursor:pointer;
  }
  .quality-btn svg { width:22px; height:22px; filter:drop-shadow(0 1px 3px rgba(0,0,0,0.8)); }
  .quality-panel {
    position:fixed; right:12px; bottom:90px;
    background:rgba(20,20,20,0.95); border-radius:10px;
    padding:8px 0; min-width:130px;
    display:none; z-index:20;
    backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);
    box-shadow:0 4px 20px rgba(0,0,0,0.5);
  }
  .quality-panel.show { display:block; }
  .quality-panel-title {
    color:rgba(255,255,255,0.5); font-size:11px; font-weight:600;
    padding:6px 16px 8px; text-transform:uppercase; letter-spacing:0.5px;
  }
  .quality-option {
    display:flex; align-items:center; justify-content:space-between;
    padding:10px 16px; color:#fff; font-size:14px; font-weight:500;
    cursor:pointer; border:none; background:none; width:100%; text-align:left;
  }
  .quality-option:active { background:rgba(255,255,255,0.1); }
  .quality-option.active { color:#E50914; font-weight:700; }
  .quality-option .check { font-size:16px; }
  .quality-badge {
    display:inline-block; background:#E50914; color:#fff;
    font-size:9px; font-weight:800; padding:1px 4px; border-radius:2px;
    margin-left:6px; vertical-align:middle;
  }
</style>
</head><body>

<video id="v" playsinline></video>
<div class="quality-panel" id="qualityPanel">
  <div class="quality-panel-title">Quality</div>
</div>

<div class="overlay" id="overlay">
  <div class="top-bar">
    <button class="back-btn" id="backBtn">
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M15 18l-6-6 6-6"/>
      </svg>
    </button>
    <div class="video-title">${safeTitle}</div>
    <button class="quality-btn" id="qualityBtn" style="display:none">
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
      </svg>
    </button>
  </div>

  <div class="center-controls">
    <button class="ctrl-btn" id="rwBtn">
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12.5 8.14v-4l-5 5 5 5v-4a4 4 0 110 8 4 4 0 01-4-4"/>
      </svg>
      <span>10</span>
    </button>
    <button class="play-btn" id="playBtn">
      <svg id="playIcon" viewBox="0 0 24 24" fill="#fff">
        <polygon points="6,3 20,12 6,21"/>
      </svg>
    </button>
    <button class="ctrl-btn" id="ffBtn">
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11.5 8.14v-4l5 5-5 5v-4a4 4 0 100 8 4 4 0 004-4"/>
      </svg>
      <span>10</span>
    </button>
  </div>

  <div class="bottom-bar">
    <div class="progress-wrap" id="progressWrap">
      <div class="progress-track">
        <div class="progress-fill" id="progressFill"></div>
      </div>
      <div class="progress-thumb" id="progressThumb" style="left:0%"></div>
      <input type="range" class="seek-input" id="seek" min="0" max="1000" value="0" step="1">
    </div>
    <div class="time-row">
      <span class="time-text" id="cur">0:00</span>
      <span class="time-text" id="dur">0:00</span>
    </div>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"></script>
<script>
var v = document.getElementById('v');
var overlay = document.getElementById('overlay');
var playBtn = document.getElementById('playBtn');
var playIcon = document.getElementById('playIcon');
var seek = document.getElementById('seek');
var progressFill = document.getElementById('progressFill');
var progressThumb = document.getElementById('progressThumb');
var cur = document.getElementById('cur');
var dur = document.getElementById('dur');
var qualityBtn = document.getElementById('qualityBtn');
var qualityPanel = document.getElementById('qualityPanel');
var hideTimer;
var hls = null;
var streamType = '${streamType}';
var streamUrl = '${streamUrl}';

var playSvg = '<polygon points="6,3 20,12 6,21"/>';
var pauseSvg = '<rect x="5" y="3" width="4.5" height="18" rx="1"/><rect x="14.5" y="3" width="4.5" height="18" rx="1"/>';

function fmt(s) {
  var m = Math.floor(s/60), sec = Math.floor(s%60);
  return m + ':' + (sec<10?'0':'') + sec;
}

function showOverlay() {
  overlay.classList.remove('hidden');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(function() {
    if(!v.paused) { overlay.classList.add('hidden'); qualityPanel.classList.remove('show'); }
  }, 4000);
}

// --- Video source setup ---
if (streamType === 'hls' && typeof Hls !== 'undefined' && Hls.isSupported()) {
  hls = new Hls({ startLevel: -1 });
  hls.loadSource(streamUrl);
  hls.attachMedia(v);
  hls.on(Hls.Events.MANIFEST_PARSED, function(e, data) {
    // Show quality button
    qualityBtn.style.display = 'flex';
    buildQualityMenu(data.levels);
    v.play().catch(function(){});
  });
} else {
  // Native playback (raw mp4 or native HLS)
  v.src = streamUrl;
  v.play().catch(function(){});
}

// --- Quality menu ---
function buildQualityMenu(levels) {
  var html = '<div class="quality-panel-title">Quality</div>';
  // Auto option
  html += '<button class="quality-option active" data-level="-1" onclick="setQuality(-1, this)"><span>Auto</span><span class="check">✓</span></button>';
  // Each level (sorted highest first)
  var sorted = levels.map(function(l,i){ return {i:i, h:l.height, w:l.width}; }).sort(function(a,b){ return b.h - a.h; });
  sorted.forEach(function(l) {
    var label = l.h + 'p';
    var badge = l.h >= 1080 ? '<span class="quality-badge">HD</span>' : (l.h >= 720 ? '<span class="quality-badge">HD</span>' : '');
    html += '<button class="quality-option" data-level="' + l.i + '" onclick="setQuality(' + l.i + ', this)"><span>' + label + badge + '</span><span class="check"></span></button>';
  });
  qualityPanel.innerHTML = html;
}

function setQuality(level, el) {
  if (!hls) return;
  hls.currentLevel = level;
  // Update active state
  qualityPanel.querySelectorAll('.quality-option').forEach(function(btn) {
    btn.classList.remove('active');
    btn.querySelector('.check').textContent = '';
  });
  el.classList.add('active');
  el.querySelector('.check').textContent = '✓';
  qualityPanel.classList.remove('show');
  showOverlay();
}

// Toggle quality panel
qualityBtn.addEventListener('click', function(e) {
  e.stopPropagation();
  qualityPanel.classList.toggle('show');
  showOverlay();
});

// Tap anywhere to toggle overlay / close quality panel
document.body.addEventListener('click', function(e) {
  if (e.target.closest('.quality-panel')) return;
  if (e.target.closest('.quality-btn')) return;
  if (e.target.closest('.overlay > *')) { qualityPanel.classList.remove('show'); return; }
  qualityPanel.classList.remove('show');
  if (overlay.classList.contains('hidden')) { showOverlay(); }
  else { overlay.classList.add('hidden'); }
});

// Play/pause
playBtn.addEventListener('click', function(e) {
  e.stopPropagation();
  if (v.paused) { v.play(); } else { v.pause(); }
});
v.addEventListener('play', function() { playIcon.innerHTML = pauseSvg; showOverlay(); });
v.addEventListener('pause', function() { playIcon.innerHTML = playSvg; showOverlay(); });

// Seek buttons
document.getElementById('rwBtn').addEventListener('click', function(e) { e.stopPropagation(); v.currentTime = Math.max(0, v.currentTime-10); showOverlay(); });
document.getElementById('ffBtn').addEventListener('click', function(e) { e.stopPropagation(); v.currentTime = Math.min(v.duration||0, v.currentTime+10); showOverlay(); });

// Seek bar
var seeking = false;
function updateProgress(pct) {
  progressFill.style.width = pct + '%';
  progressThumb.style.left = pct + '%';
}
seek.addEventListener('input', function() {
  seeking = true;
  var pct = seek.value / 10;
  updateProgress(pct);
  v.currentTime = (pct / 100) * (v.duration || 0);
  cur.textContent = fmt(v.currentTime);
});
seek.addEventListener('change', function() { seeking = false; showOverlay(); });

// Time update
v.addEventListener('timeupdate', function() {
  if (!seeking && v.duration) {
    var pct = (v.currentTime / v.duration) * 100;
    seek.value = pct * 10;
    updateProgress(pct);
  }
  cur.textContent = fmt(v.currentTime);
});
v.addEventListener('loadedmetadata', function() { dur.textContent = fmt(v.duration); });

// Back button
document.getElementById('backBtn').addEventListener('click', function(e) {
  e.stopPropagation();
  window.ReactNativeWebView.postMessage('back');
});

showOverlay();
</script>
</body></html>
  `;

  return (
    <View style={styles.playerContainer}>
      <StatusBar hidden />
      <WebView
        ref={webViewRef}
        source={{ html, baseUrl }}
        style={styles.webview}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled={true}
        allowsFullscreenVideo={true}
        mixedContentMode="compatibility"
        onMessage={(event) => {
          if (event.nativeEvent.data === 'back') {
            navigation.goBack();
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  webview: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingText: {
    color: colors.textSecondary,
    marginTop: spacing.md,
    fontSize: 14,
  },
  errorIcon: {
    fontSize: 48,
    color: colors.primary,
    fontWeight: '800',
    marginBottom: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  errorText: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: spacing.sm,
    textAlign: 'center',
    paddingHorizontal: spacing.xxl,
  },
  backButtonCenter: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: 8,
  },
  backText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
});
