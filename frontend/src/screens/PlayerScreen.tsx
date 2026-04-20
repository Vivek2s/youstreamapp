import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, StatusBar, NativeModules, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebView as WebViewType } from 'react-native-webview';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import Orientation from 'react-native-orientation-locker';

const { ImmersiveMode } = NativeModules;
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing } from '../theme';
import { contentService } from '../services/content.service';
import { HomeStackParamList } from '../types';

type Props = {
  navigation: NativeStackNavigationProp<HomeStackParamList, 'Player'>;
  route: RouteProp<HomeStackParamList, 'Player'>;
};

export default function PlayerScreen({ navigation, route }: Props) {
  const { contentId, title, episodeUrl, episodeSubs } = route.params;
  const webViewRef = useRef<WebViewType>(null);

  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [streamType, setStreamType] = useState<'hls' | 'raw'>('raw');
  const [subtitles, setSubtitles] = useState<{ lang: string; url: string }[]>([]);
  const [spriteVttUrl, setSpriteVttUrl] = useState('');
  const [subtitlePref, setSubtitlePref] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // Enter immersive fullscreen (hide Android nav bar)
    if (Platform.OS === 'android' && ImmersiveMode) {
      ImmersiveMode.enable();
    }
    // Load subtitle preference
    AsyncStorage.getItem('subtitleEnabled').then(v => { if (v === 'true') setSubtitlePref(true); });
    loadStreamUrl();
    return () => {
      // Exit immersive and re-lock to portrait when leaving player (mobile only)
      if (Platform.OS === 'android' && ImmersiveMode) {
        ImmersiveMode.disable();
      }
      if (!Platform.isTV) {
        Orientation.lockToPortrait();
      }
    };
  }, [contentId]);

  // Lock orientation based on video aspect ratio (mobile only — TV is always landscape)
  useEffect(() => {
    if (streamUrl && !Platform.isTV) {
      if (isPortrait) {
        Orientation.lockToPortrait();
      } else {
        Orientation.lockToLandscape();
      }
    }
  }, [streamUrl, isPortrait]);

  const loadStreamUrl = async () => {
    try {
      if (episodeUrl) {
        // Direct episode playback — use URL as-is
        console.log('[Player] Episode URL:', episodeUrl);
        setStreamUrl(episodeUrl);
        setStreamType(episodeUrl.includes('.m3u8') ? 'hls' : 'raw');
        if (episodeSubs && episodeSubs.length > 0) {
          setSubtitles(episodeSubs);
        }
        setLoading(false);
        return;
      }
      const data = await contentService.getStreamUrl(contentId);
      console.log('[Player] Stream URL:', data.hlsUrl, 'type:', data.streamType);
      setStreamUrl(data.hlsUrl);
      setStreamType(data.streamType || 'raw');
      setSubtitles(data.subtitles || []);
      setSpriteVttUrl(data.spriteVttUrl || '');
      setIsPortrait(data.isPortrait || false);
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
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<style>
  * { margin:0; padding:0; box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  *:focus { outline:none !important; }
  button:focus, input:focus { outline:none !important; box-shadow:none !important; }
  body { background:#000; width:100vw; height:100vh; overflow:hidden; font-family:-apple-system,sans-serif; -webkit-user-select:none; }
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

  /* Top bar — safe area aware */
  .top-bar {
    display:flex; align-items:center; gap:14px;
    padding:calc(20px + env(safe-area-inset-top, 0px)) calc(16px + env(safe-area-inset-right, 0px)) 16px calc(16px + env(safe-area-inset-left, 0px));
    background:linear-gradient(to bottom, rgba(0,0,0,0.6), transparent);
  }
  .back-btn {
    width:40px; height:40px; display:flex; align-items:center; justify-content:center;
    background:none; border:none; cursor:pointer; flex-shrink:0;
  }
  .back-btn svg { width:26px; height:26px; filter:drop-shadow(0 1px 3px rgba(0,0,0,0.8)); }
  .video-title {
    color:#fff; font-size:15px; font-weight:700; letter-spacing:0.3px;
    display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
    overflow:hidden; white-space:normal; flex:1;
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
    transition:transform 0.15s ease, background 0.15s ease;
  }
  .ctrl-btn.pressed { transform:scale(1.25); background:rgba(255,255,255,0.25); }
  .ctrl-btn svg { width:26px; height:26px; }
  .ctrl-btn span { font-size:9px; margin-top:-2px; }
  .play-btn {
    width:68px; height:68px; background:rgba(0,0,0,0.55); border-radius:50%;
    border:2px solid rgba(255,255,255,0.3); cursor:pointer;
    display:flex; align-items:center; justify-content:center;
    backdrop-filter:blur(4px); -webkit-backdrop-filter:blur(4px);
  }
  .play-btn svg { width:32px; height:32px; filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5)); }

  /* Netflix-style bottom bar — safe area aware */
  .bottom-bar {
    padding:0 calc(16px + env(safe-area-inset-right, 0px)) calc(24px + env(safe-area-inset-bottom, 0px)) calc(16px + env(safe-area-inset-left, 0px));
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
    border-radius:2px; transition:width 0.3s ease;
  }
  .progress-thumb {
    position:absolute; width:14px; height:14px; background:#E50914;
    border-radius:50%; top:50%; transform:translate(-50%,-50%);
    box-shadow:0 0 4px rgba(0,0,0,0.5); transition:left 0.3s ease, transform 0.1s;
  }
  /* Seek label shown inside button */
  .ctrl-btn.seek-active { transform:scale(1.15); background:rgba(255,255,255,0.2); }
  .ctrl-btn.seek-active svg { display:none; }
  .ctrl-btn.seek-active span { display:none; }
  .seek-label {
    display:none; color:#fff; font-size:14px; font-weight:800;
    text-shadow:0 1px 4px rgba(0,0,0,0.9);
  }
  .ctrl-btn.seek-active .seek-label { display:block; }
  /* Thumbnail preview */
  .thumb-preview {
    position:absolute; bottom:32px; left:50%;
    transform:translateX(-50%);
    background:#000; border:2px solid rgba(255,255,255,0.7);
    border-radius:4px; overflow:hidden;
    display:none; z-index:25; pointer-events:none;
    box-shadow:0 4px 16px rgba(0,0,0,0.8);
  }
  .thumb-preview.show { display:block; }
  .thumb-preview-time {
    position:absolute; bottom:-22px; left:50%; transform:translateX(-50%);
    color:#fff; font-size:12px; font-weight:700; white-space:nowrap;
    text-shadow:0 1px 4px rgba(0,0,0,0.9);
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
    background:none; border:none; cursor:pointer; flex-shrink:0;
  }
  .quality-btn svg { width:22px; height:22px; filter:drop-shadow(0 1px 3px rgba(0,0,0,0.8)); }
  .quality-btn.tv-focused, .sub-btn.tv-focused {
    background:rgba(255,255,255,0.25); border-radius:50%;
    transform:scale(1.15);
    box-shadow:0 0 0 2px #fff;
  }
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
  .quality-option:active, .quality-option:focus { background:rgba(255,255,255,0.15); outline:none; }
  .quality-option.active { color:#E50914; font-weight:700; }
  .quality-option .check { font-size:16px; }
  .quality-badge {
    display:inline-block; background:#E50914; color:#fff;
    font-size:9px; font-weight:800; padding:1px 4px; border-radius:2px;
    margin-left:6px; vertical-align:middle;
  }

  /* Subtitle selector */
  .sub-btn, .quality-btn { outline:none; }
  .sub-btn:focus, .quality-btn:focus {
    background:rgba(255,255,255,0.2); border-radius:8px;
  }
  .sub-btn {
    width:40px; height:40px; display:flex; align-items:center; justify-content:center;
    background:none; border:none; cursor:pointer; flex-shrink:0;
  }
  .sub-btn svg { width:22px; height:22px; filter:drop-shadow(0 1px 3px rgba(0,0,0,0.8)); }
  .sub-panel {
    position:fixed; right:12px; bottom:90px;
    background:rgba(20,20,20,0.95); border-radius:10px;
    padding:8px 0; min-width:130px;
    display:none; z-index:20;
    backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);
    box-shadow:0 4px 20px rgba(0,0,0,0.5);
  }
  .sub-panel.show { display:block; }
</style>
</head><body tabindex="0">

<video id="v" playsinline></video>
<div class="quality-panel" id="qualityPanel">
  <div class="quality-panel-title">Quality</div>
</div>
<div class="sub-panel" id="subPanel"></div>

<div class="overlay" id="overlay">
  <div class="top-bar">
    <button class="back-btn" id="backBtn">
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M15 18l-6-6 6-6"/>
      </svg>
    </button>
    <div class="video-title">${safeTitle}</div>
    <button class="sub-btn" id="subBtn" style="display:none">
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 15h4M15 15h2M7 11h2M13 11h4"/>
      </svg>
    </button>
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
      <span class="seek-label" id="rwLabel"></span>
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
      <span class="seek-label" id="ffLabel"></span>
    </button>
  </div>

  <div class="bottom-bar">
    <div class="progress-wrap" id="progressWrap">
      <div class="progress-track">
        <div class="progress-fill" id="progressFill"></div>
      </div>
      <div class="progress-thumb" id="progressThumb" style="left:0%"></div>
      <input type="range" class="seek-input" id="seek" min="0" max="1000" value="0" step="1">
      <div class="thumb-preview" id="thumbPreview">
        <span class="thumb-preview-time" id="thumbTime"></span>
      </div>
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
var subBtn = document.getElementById('subBtn');
var subPanel = document.getElementById('subPanel');
var rwBtn = document.getElementById('rwBtn');
var ffBtn = document.getElementById('ffBtn');
var rwLabel = document.getElementById('rwLabel');
var ffLabel = document.getElementById('ffLabel');
var hideTimer;
var seekResetTimer;
var hls = null;
var streamType = '${streamType}';
var streamUrl = '${streamUrl}';
var subtitles = ${JSON.stringify(subtitles)};
var subtitlePrefOn = ${subtitlePref ? 'true' : 'false'};
var spriteVttUrl = '${spriteVttUrl}';
var thumbPreview = document.getElementById('thumbPreview');
var thumbTime = document.getElementById('thumbTime');
var spriteCues = [];
var thumbHideTimer;

var playSvg = '<polygon points="6,3 20,12 6,21"/>';
var pauseSvg = '<rect x="5" y="3" width="4.5" height="18" rx="1"/><rect x="14.5" y="3" width="4.5" height="18" rx="1"/>';

function fmt(s) {
  var h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = Math.floor(s%60);
  if (h > 0) return h + ':' + (m<10?'0':'') + m + ':' + (sec<10?'0':'') + sec;
  return m + ':' + (sec<10?'0':'') + sec;
}

function showOverlay() {
  overlay.classList.remove('hidden');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(function() {
    if(!v.paused) {
      overlay.classList.add('hidden');
      qualityPanel.classList.remove('show');
      subPanel.classList.remove('show');
      // Re-focus body so D-pad events work immediately
      document.body.focus();
    }
  }, 4000);
}

// Keep body focused for D-pad input
document.body.focus();
v.addEventListener('play', function() { setTimeout(function() { document.body.focus(); }, 100); });

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
  subPanel.classList.remove('show');
  qualityPanel.classList.toggle('show');
  showOverlay();
});

// --- Subtitle support ---
var activeSubTrack = -1;
if (subtitles && subtitles.length > 0) {
  subBtn.style.display = 'flex';
  // Add <track> elements to video
  subtitles.forEach(function(sub, i) {
    var track = document.createElement('track');
    track.kind = 'subtitles';
    track.label = sub.lang;
    track.srclang = sub.lang;
    track.src = sub.url;
    track.default = false;
    v.appendChild(track);
  });
  // Build subtitle panel
  var subHtml = '<div class="quality-panel-title">Subtitles</div>';
  subHtml += '<button class="quality-option active" tabindex="0" onclick="setSub(-1, this)"><span>Off</span><span class="check">✓</span></button>';
  subtitles.forEach(function(sub, i) {
    subHtml += '<button class="quality-option" tabindex="0" onclick="setSub(' + i + ', this)"><span>' + sub.lang + '</span><span class="check"></span></button>';
  });
  subPanel.innerHTML = subHtml;

  // Auto-enable first subtitle if preference is on
  if (subtitlePrefOn && subtitles.length > 0) {
    var firstBtn = subPanel.querySelectorAll('button.quality-option')[1]; // index 0 is "Off", 1 is first subtitle
    if (firstBtn) setSub(0, firstBtn);
  }
}

function setSub(idx, el) {
  activeSubTrack = idx;
  for (var i = 0; i < v.textTracks.length; i++) {
    v.textTracks[i].mode = (i === idx) ? 'showing' : 'hidden';
  }
  subPanel.querySelectorAll('.quality-option').forEach(function(btn) {
    btn.classList.remove('active');
    btn.querySelector('.check').textContent = '';
  });
  el.classList.add('active');
  el.querySelector('.check').textContent = '✓';
  subPanel.classList.remove('show');
  // Save subtitle preference
  window.ReactNativeWebView.postMessage(idx >= 0 ? 'subtitle-pref:on' : 'subtitle-pref:off');
  showOverlay();
}

subBtn.addEventListener('click', function(e) {
  e.stopPropagation();
  qualityPanel.classList.remove('show');
  subPanel.classList.toggle('show');
  showOverlay();
});

// Tap anywhere to toggle overlay / close panels
document.body.addEventListener('click', function(e) {
  if (e.target.closest('.quality-panel') || e.target.closest('.sub-panel')) return;
  if (e.target.closest('.quality-btn') || e.target.closest('.sub-btn')) return;
  if (e.target.closest('.overlay > *')) { qualityPanel.classList.remove('show'); subPanel.classList.remove('show'); return; }
  qualityPanel.classList.remove('show');
  subPanel.classList.remove('show');
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

// --- Sprite thumbnail preview ---
if (spriteVttUrl) {
  // Parse VTT to extract cues with sprite coordinates
  var xhr = new XMLHttpRequest();
  xhr.open('GET', spriteVttUrl, true);
  xhr.onload = function() {
    if (xhr.status !== 200) return;
    var lines = xhr.responseText.split('\\n');
    var i = 0;
    while (i < lines.length) {
      var line = lines[i].trim();
      // Look for timestamp lines: 00:00:00.000 --> 00:00:10.000
      var match = line.match(/(\\d+:\\d+:\\d+\\.\\d+)\\s*-->\\s*(\\d+:\\d+:\\d+\\.\\d+)/);
      if (match) {
        var start = parseVttTime(match[1]);
        var end = parseVttTime(match[2]);
        i++;
        if (i < lines.length) {
          var urlLine = lines[i].trim();
          // Parse: sprites/sprite_1.jpg#xywh=0,0,160,90
          var parts = urlLine.split('#xywh=');
          if (parts.length === 2) {
            var imgUrl = parts[0];
            // Resolve relative to VTT URL
            if (!imgUrl.startsWith('http')) {
              var base = spriteVttUrl.substring(0, spriteVttUrl.lastIndexOf('/') + 1);
              imgUrl = base + imgUrl;
            }
            var coords = parts[1].split(',').map(Number);
            spriteCues.push({ start: start, end: end, url: imgUrl, x: coords[0], y: coords[1], w: coords[2], h: coords[3] });
          }
        }
      }
      i++;
    }
    console.log('Loaded ' + spriteCues.length + ' sprite cues');
  };
  xhr.send();
}

function parseVttTime(str) {
  var p = str.split(':');
  var sec = parseFloat(p[2]) + parseInt(p[1]) * 60 + parseInt(p[0]) * 3600;
  return sec;
}

function showThumbAtTime(sec) {
  if (!spriteCues.length) return;
  // Find matching cue
  var cue = null;
  for (var i = 0; i < spriteCues.length; i++) {
    if (sec >= spriteCues[i].start && sec < spriteCues[i].end) {
      cue = spriteCues[i]; break;
    }
  }
  if (!cue) { hideThumb(); return; }

  thumbPreview.style.width = cue.w + 'px';
  thumbPreview.style.height = cue.h + 'px';
  thumbPreview.style.backgroundImage = 'url(' + cue.url + ')';
  thumbPreview.style.backgroundPosition = '-' + cue.x + 'px -' + cue.y + 'px';
  thumbPreview.style.backgroundSize = 'auto';
  thumbTime.textContent = fmt(sec);
  thumbPreview.classList.add('show');

  clearTimeout(thumbHideTimer);
  thumbHideTimer = setTimeout(hideThumb, 1500);
}

function hideThumb() {
  thumbPreview.classList.remove('show');
}

// --- Visual feedback helpers ---
function seekBy(delta) {
  var newTime = Math.max(0, Math.min(v.duration||0, v.currentTime + delta));
  v.currentTime = newTime;
  // Smooth progress update
  if (v.duration) {
    var pct = (newTime / v.duration) * 100;
    seek.value = pct * 10;
    updateProgress(pct);
    cur.textContent = fmt(newTime);
  }
  // Show seek text inside the button, hide icon
  var isForward = delta > 0;
  var btn = isForward ? ffBtn : rwBtn;
  var label = isForward ? ffLabel : ffLabel;
  if (isForward) {
    ffLabel.textContent = '+' + delta + 's';
    ffBtn.classList.add('seek-active');
    rwBtn.classList.remove('seek-active');
  } else {
    rwLabel.textContent = delta + 's';
    rwBtn.classList.add('seek-active');
    ffBtn.classList.remove('seek-active');
  }
  clearTimeout(seekResetTimer);
  seekResetTimer = setTimeout(function() {
    ffBtn.classList.remove('seek-active');
    rwBtn.classList.remove('seek-active');
  }, 900);
  showThumbAtTime(newTime);
  showOverlay();
}

// --- TV D-pad / keyboard support ---
document.addEventListener('keydown', function(e) {
  var key = e.key || e.code;
  showOverlay();

  // Check if a panel (subtitle/quality) is open
  var panelOpen = subPanel.classList.contains('show') || qualityPanel.classList.contains('show');
  var openPanel = subPanel.classList.contains('show') ? subPanel : (qualityPanel.classList.contains('show') ? qualityPanel : null);

  if (panelOpen && openPanel) {
    var btns = Array.from(openPanel.querySelectorAll('button.quality-option'));
    var focused = openPanel.querySelector('button:focus') || openPanel.querySelector('button.active');
    var idx = btns.indexOf(focused);

    switch(key) {
      case 'ArrowUp':
        e.preventDefault();
        if (idx > 0) btns[idx - 1].focus();
        else btns[btns.length - 1].focus();
        return;
      case 'ArrowDown':
        e.preventDefault();
        if (idx < btns.length - 1) btns[idx + 1].focus();
        else btns[0].focus();
        return;
      case 'Enter':
        e.preventDefault();
        if (focused) focused.click();
        return;
      case 'Escape':
      case 'GoBack':
        e.preventDefault();
        subPanel.classList.remove('show');
        qualityPanel.classList.remove('show');
        return;
    }
  }

  // Overlay buttons (subtitle, quality) — only those that are visible
  var overlayBtns = [subBtn, qualityBtn].filter(function(b) { return b.style.display !== 'none'; });
  var btnFocusIdx = -1; // -1 = no button focused
  overlayBtns.forEach(function(b, i) { if (b.classList.contains('tv-focused')) btnFocusIdx = i; });
  var overlayVisible = !overlay.classList.contains('hidden');

  switch(key) {
    case 'ArrowRight':
      e.preventDefault();
      if (btnFocusIdx >= 0 && btnFocusIdx < overlayBtns.length - 1) {
        // Move focus to next button
        overlayBtns[btnFocusIdx].classList.remove('tv-focused');
        overlayBtns[btnFocusIdx + 1].classList.add('tv-focused');
      } else {
        seekBy(10);
      }
      break;
    case 'ArrowLeft':
      e.preventDefault();
      if (btnFocusIdx > 0) {
        overlayBtns[btnFocusIdx].classList.remove('tv-focused');
        overlayBtns[btnFocusIdx - 1].classList.add('tv-focused');
      } else if (btnFocusIdx === 0) {
        // Unfocus buttons
        overlayBtns[0].classList.remove('tv-focused');
      } else {
        seekBy(-10);
      }
      break;
    case 'ArrowUp':
      e.preventDefault();
      if (btnFocusIdx >= 0) {
        // Already on buttons — do nothing (can't go higher)
      } else if (overlayVisible && overlayBtns.length > 0) {
        // Overlay is showing — focus first button
        overlayBtns[0].classList.add('tv-focused');
      } else {
        showOverlay();
      }
      break;
    case 'ArrowDown':
      e.preventDefault();
      if (btnFocusIdx >= 0) {
        // Unfocus buttons
        overlayBtns[btnFocusIdx].classList.remove('tv-focused');
      }
      break;
    case 'Enter':
    case 'Select':
    case ' ':
    case 'MediaPlayPause':
      e.preventDefault();
      if (btnFocusIdx >= 0) {
        // Press the focused button (opens panel)
        overlayBtns[btnFocusIdx].click();
        overlayBtns[btnFocusIdx].classList.remove('tv-focused');
      } else {
        // Show overlay + play/pause
        showOverlay();
        if (v.paused) { v.play(); } else { v.pause(); }
      }
      break;
    case 'Escape':
    case 'GoBack':
      e.preventDefault();
      if (panelOpen) {
        subPanel.classList.remove('show');
        qualityPanel.classList.remove('show');
      } else {
        window.ReactNativeWebView.postMessage('back');
      }
      break;
  }
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
        focusable={true}
        onLoad={() => {
          // Ensure WebView has focus for D-pad events on TV
          if (Platform.isTV && webViewRef.current) {
            webViewRef.current.requestFocus?.();
            webViewRef.current.injectJavaScript('document.body.focus(); true;');
          }
        }}
        onMessage={(event) => {
          const msg = event.nativeEvent.data;
          if (msg === 'back') {
            navigation.goBack();
          } else if (msg === 'subtitle-pref:on') {
            AsyncStorage.setItem('subtitleEnabled', 'true');
            setSubtitlePref(true);
          } else if (msg === 'subtitle-pref:off') {
            AsyncStorage.setItem('subtitleEnabled', 'false');
            setSubtitlePref(false);
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
