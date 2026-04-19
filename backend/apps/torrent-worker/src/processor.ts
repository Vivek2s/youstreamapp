import path from 'path';
import fs from 'fs';
import torrentStream from 'torrent-stream';
import { exec, execSync } from 'child_process';
import { Content } from '../../api/src/models/content.model';
import { config } from '../../api/src/config';
import { updateHeartbeat, completeJob, failJob, isJobCancelled } from '../../api/src/queues/jobQueue';
import { enqueueJob } from '../../api/src/queues/jobQueue';
import { uploadFileToS3, uploadDirectoryToS3, deleteLocalDirectory } from '../../api/src/utils/s3';
import { ITorrentDownloadData } from '../../api/src/models/job.model';

const TORRENTS_DIR = path.join(config.storageRoot, 'torrents');
const UPLOADS_DIR = path.join(config.storageRoot, 'uploads');
const STREAMS_DIR = path.join(config.storageRoot, 'streams');

fs.mkdirSync(TORRENTS_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(STREAMS_DIR, { recursive: true });

const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.wmv', '.flv'];
const WEB_PLAYABLE = ['.mp4', '.webm'];

// Track active torrent engines for cleanup on cancel
const activeTorrents = new Map<string, any>();

export function getActiveTorrentCount(): number {
  return activeTorrents.size;
}

function findLargestVideoFile(dir: string): string | null {
  const result = { path: '', size: 0 };
  let found = false;

  function scan(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (VIDEO_EXTENSIONS.includes(ext)) {
          const stat = fs.statSync(fullPath);
          if (!found || stat.size > result.size) {
            result.path = fullPath;
            result.size = stat.size;
            found = true;
          }
        }
      }
    }
  }

  scan(dir);
  return found ? result.path : null;
}

function parseEpisodeInfo(filename: string): { season: number; episode: number; title: string } {
  const base = path.basename(filename, path.extname(filename));

  let m = base.match(/[Ss](\d+)[Ee](\d+)/);
  if (m) return { season: parseInt(m[1]), episode: parseInt(m[2]), title: base.replace(m[0], '').replace(/[._-]+/g, ' ').trim() || `Episode ${parseInt(m[2])}` };

  m = base.match(/(\d+)x(\d+)/i);
  if (m) return { season: parseInt(m[1]), episode: parseInt(m[2]), title: base.replace(m[0], '').replace(/[._-]+/g, ' ').trim() || `Episode ${parseInt(m[2])}` };

  m = base.match(/season\s*(\d+)\s*episode\s*(\d+)/i);
  if (m) return { season: parseInt(m[1]), episode: parseInt(m[2]), title: `Episode ${parseInt(m[2])}` };

  m = base.match(/[Ee][Pp]?(\d+)/);
  if (m) return { season: 1, episode: parseInt(m[1]), title: base.replace(m[0], '').replace(/[._-]+/g, ' ').trim() || `Episode ${parseInt(m[1])}` };

  return { season: 1, episode: 0, title: base.replace(/[._-]+/g, ' ').trim() };
}

function remuxToMp4(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = `ffmpeg -i "${inputPath}" -c copy -movflags +faststart "${outputPath}"`;
    console.log(`🔄 Remuxing to MP4: ${path.basename(inputPath)}`);
    exec(cmd, (error) => {
      if (error) return reject(error);
      resolve();
    });
  });
}

function getVideoInfo(filePath: string) {
  let duration = 0, width = 0, height = 0;
  try {
    const probeOutput = execSync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`
    ).toString();
    const probeData = JSON.parse(probeOutput);
    duration = Math.round(parseFloat(probeData.format?.duration || '0'));
    const videoStream = probeData.streams?.find((s: any) => s.codec_type === 'video');
    if (videoStream) {
      width = videoStream.width || 0;
      height = videoStream.height || 0;
      const rotation = parseInt(videoStream.tags?.rotate || '0', 10);
      if (rotation === 90 || rotation === 270) [width, height] = [height, width];
      const sideData = videoStream.side_data_list?.find((sd: any) => sd.rotation);
      if (sideData) {
        const r = Math.abs(parseInt(sideData.rotation, 10));
        if (r === 90 || r === 270) [width, height] = [height, width];
      }
    }
  } catch {
    console.warn('Could not probe video');
  }
  const isPortrait = height > width;
  return { duration, width, height, isPortrait };
}

function getVideoContentType(ext: string): string {
  const types: Record<string, string> = {
    '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime', '.webm': 'video/webm',
  };
  return types[ext.toLowerCase()] || 'video/mp4';
}

async function extractSubtitles(contentId: string, inputPath: string): Promise<{ lang: string; url: string }[]> {
  const results: { lang: string; url: string }[] = [];
  const uploadDir = path.dirname(inputPath);
  const subsDir = path.join(uploadDir, 'subs');
  fs.mkdirSync(subsDir, { recursive: true });

  try {
    const probeOutput = execSync(
      `ffprobe -v quiet -print_format json -show_streams -select_streams s "${inputPath}"`,
      { stdio: ['pipe', 'pipe', 'pipe'] }
    ).toString();
    const probeData = JSON.parse(probeOutput);
    const subStreams = probeData.streams || [];

    if (subStreams.length === 0) {
      console.log(`📝 No embedded subtitle streams found in ${path.basename(inputPath)}`);
    } else {
      console.log(`📝 Found ${subStreams.length} embedded subtitle stream(s) in ${path.basename(inputPath)}`);
    }

    for (let i = 0; i < subStreams.length; i++) {
      const stream = subStreams[i];
      const codec = stream.codec_name || 'unknown';
      const lang = stream.tags?.language || stream.tags?.title || `sub${i}`;

      // PGS/HDMV/DVB bitmap subtitles cannot be converted to text-based VTT
      if (['hdmv_pgs_subtitle', 'pgssub', 'dvd_subtitle', 'dvdsub', 'dvb_subtitle'].includes(codec)) {
        console.log(`📝 Skipping subtitle #${i} (${lang}): ${codec} is bitmap-based, cannot convert to VTT`);
        continue;
      }

      const vttPath = path.join(subsDir, `${lang}_${i}.vtt`);
      try {
        execSync(`ffmpeg -i "${inputPath}" -map 0:s:${i} -c:s webvtt -y "${vttPath}"`, { stdio: 'pipe' });
        if (fs.existsSync(vttPath) && fs.statSync(vttPath).size > 0) {
          const url = await uploadSubtitleFile(contentId, vttPath, `${lang}_${i}.vtt`);
          if (url) results.push({ lang, url });
          console.log(`📝 Extracted subtitle #${i}: ${lang} (${codec})`);
        }
      } catch (err: any) {
        console.warn(`⚠️  Failed to extract subtitle #${i} (${lang}, ${codec}): ${err.message?.substring(0, 100)}`);
      }
    }
  } catch (err: any) {
    console.warn(`⚠️  Subtitle probe failed for ${path.basename(inputPath)}: ${err.message?.substring(0, 100)}`);
  }

  const videoDir = path.dirname(inputPath);
  const SUBTITLE_EXTS = ['.srt', '.vtt', '.ass', '.ssa'];
  try {
    const files = fs.readdirSync(videoDir);
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (!SUBTITLE_EXTS.includes(ext)) continue;
      const subFilePath = path.join(videoDir, file);
      const baseName = path.basename(file, ext);
      const vttPath = path.join(subsDir, `${baseName}.vtt`);
      if (ext === '.vtt') {
        const url = await uploadSubtitleFile(contentId, subFilePath, file);
        if (url) results.push({ lang: baseName, url });
      } else {
        try {
          execSync(`ffmpeg -i "${subFilePath}" -c:s webvtt -y "${vttPath}"`, { stdio: 'pipe' });
          if (fs.existsSync(vttPath) && fs.statSync(vttPath).size > 0) {
            const url = await uploadSubtitleFile(contentId, vttPath, `${baseName}.vtt`);
            if (url) results.push({ lang: baseName, url });
          }
        } catch {}
      }
    }
  } catch {}

  if (results.length > 0) {
    try {
      await Content.findByIdAndUpdate(contentId, { $set: { 'streaming.subtitles': results } });
    } catch {}
    console.log(`📝 Extracted ${results.length} subtitle(s) for ${contentId}`);
  }

  deleteLocalDirectory(subsDir);
  return results;
}

async function uploadSubtitleFile(contentId: string, localPath: string, fileName: string): Promise<string> {
  if (config.storageMode === 's3') {
    const s3Key = `${contentId}/subs/${fileName}`;
    await uploadFileToS3(localPath, config.awsS3StreamingBucket, s3Key, 'text/vtt');
    return `${config.cloudfrontDomain}/${contentId}/subs/${fileName}`;
  } else {
    const subsDir = path.join(STREAMS_DIR, contentId, 'subs');
    fs.mkdirSync(subsDir, { recursive: true });
    fs.copyFileSync(localPath, path.join(subsDir, fileName));
    return `/streams/${contentId}/subs/${fileName}`;
  }
}

async function generateThumbnail(contentId: string, inputPath: string, videoInfo: { duration: number }): Promise<string> {
  try {
    const uploadDir = path.dirname(inputPath);
    const thumbPath = path.join(uploadDir, 'thumbnail.jpg');
    const seekTime = Math.max(1, Math.min(10, Math.floor(videoInfo.duration * 0.1)));
    execSync(`ffmpeg -ss ${seekTime} -i "${inputPath}" -vframes 1 -q:v 2 -y "${thumbPath}"`, { stdio: 'pipe' });
    if (!fs.existsSync(thumbPath)) return '';
    if (config.storageMode === 's3') {
      await uploadFileToS3(thumbPath, config.awsS3StreamingBucket, `${contentId}/thumbnail.jpg`, 'image/jpeg');
      return `${config.cloudfrontDomain}/${contentId}/thumbnail.jpg`;
    } else {
      const streamsThumbDir = path.join(STREAMS_DIR, contentId);
      fs.mkdirSync(streamsThumbDir, { recursive: true });
      fs.copyFileSync(thumbPath, path.join(streamsThumbDir, 'thumbnail.jpg'));
      return `/streams/${contentId}/thumbnail.jpg`;
    }
  } catch {
    return '';
  }
}

// ---- Main processor function ----

export async function processTorrentJob(jobId: string, contentId: string, data: ITorrentDownloadData) {
  const { torrentSource, selectedIndices, transcode, isSeries } = data;

  if (isSeries || selectedIndices.length > 1) {
    await processMultiFileDownload(jobId, contentId, torrentSource, selectedIndices, transcode);
  } else {
    await processSingleFileDownload(jobId, contentId, torrentSource, transcode);
  }
}

async function processMultiFileDownload(jobId: string, contentId: string, torrentSource: string, selectedIndices: number[], transcode: boolean) {
  const downloadDir = path.join(TORRENTS_DIR, contentId, 'data');
  fs.mkdirSync(downloadDir, { recursive: true });

  let engine: any;
  try {
    const isMagnet = torrentSource.startsWith('magnet:');
    const source = isMagnet ? torrentSource : fs.readFileSync(torrentSource);
    engine = torrentStream(source, {
      path: downloadDir, connections: 50, uploads: 0, verify: true, dht: true, tracker: true,
    });
  } catch (err: any) {
    await handleJobError(jobId, contentId, null, `Invalid torrent source: ${err.message}`);
    return;
  }

  activeTorrents.set(contentId, engine);

  return new Promise<void>((resolve) => {
    let totalSize = 0;
    let lastDownloaded = 0;
    let stallCount = 0;
    let progressInterval: ReturnType<typeof setInterval> | null = null;
    let stallInterval: ReturnType<typeof setInterval> | null = null;
    let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

    const cleanup = () => {
      if (progressInterval) clearInterval(progressInterval);
      if (stallInterval) clearInterval(stallInterval);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
    };

    engine.on('ready', async () => {
      const SUBTITLE_EXTS = ['.srt', '.vtt', '.ass', '.ssa'];
      let selectedCount = 0;

      for (let i = 0; i < engine.files.length; i++) {
        const ext = path.extname(engine.files[i].name).toLowerCase();
        const isSelectedVideo = selectedIndices.includes(i);
        const isSubtitle = SUBTITLE_EXTS.includes(ext);
        if (isSelectedVideo || isSubtitle) {
          engine.files[i].select();
          totalSize += engine.files[i].length;
          selectedCount++;
        } else {
          engine.files[i].deselect();
        }
      }

      console.log(`📥 Multi-file torrent ready for ${contentId}, selected ${selectedCount} files`);
      await Content.findByIdAndUpdate(contentId, { $set: { 'torrent.fileSize': totalSize } });

      // Heartbeat for stale job recovery
      heartbeatInterval = setInterval(() => updateHeartbeat(jobId), 30000);

      // Progress polling
      progressInterval = setInterval(async () => {
        try {
          // Check if job was cancelled
          if (await isJobCancelled(jobId)) {
            cleanup();
            engine.destroy(() => {});
            activeTorrents.delete(contentId);
            deleteLocalDirectory(path.join(TORRENTS_DIR, contentId));
            console.log(`🚫 Torrent cancelled: ${contentId}`);
            resolve();
            return;
          }
          const downloaded = engine.swarm?.downloaded || 0;
          const progress = totalSize > 0 ? Math.min(Math.round((downloaded / totalSize) * 100), 100) : 0;
          const speed = engine.swarm?.downloadSpeed ? engine.swarm.downloadSpeed() : 0;
          await Content.findByIdAndUpdate(contentId, {
            $set: { 'torrent.downloadProgress': progress, 'torrent.downloadSpeed': speed },
          });
        } catch {}
      }, 3000);

      // Stall detection
      const maxStallChecks = Math.ceil(config.torrentStallTimeoutMs / 3000);
      const stallTimeoutLabel = config.torrentStallTimeoutMs >= 3600000
        ? `${Math.round(config.torrentStallTimeoutMs / 3600000)} hour(s)`
        : `${Math.round(config.torrentStallTimeoutMs / 60000)} minute(s)`;
      stallInterval = setInterval(() => {
        const currentDownloaded = engine.swarm?.downloaded || 0;
        if (currentDownloaded === lastDownloaded) {
          stallCount++;
          if (stallCount >= maxStallChecks) {
            cleanup();
            handleJobError(jobId, contentId, engine, `Download stalled — no progress for ${stallTimeoutLabel}`).then(resolve);
          }
        } else {
          stallCount = 0;
          lastDownloaded = currentDownloaded;
        }
      }, 3000);
    });

    engine.on('idle', async () => {
      cleanup();
      console.log(`✅ Multi-file download complete for ${contentId}`);
      await Content.findByIdAndUpdate(contentId, {
        $set: { 'torrent.downloadProgress': 100, 'torrent.downloadSpeed': 0 },
      });

      const allVideos: string[] = [];
      const scanDir = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) scanDir(full);
          else if (VIDEO_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) {
            allVideos.push(full);
          }
        }
      };
      scanDir(downloadDir);

      if (allVideos.length === 0) {
        await handleJobError(jobId, contentId, engine, 'No video files found after download');
        resolve();
        return;
      }

      engine.destroy(() => {});
      activeTorrents.delete(contentId);
      allVideos.sort((a, b) => path.basename(a).localeCompare(path.basename(b)));

      const isSeriesResult = allVideos.length > 1;

      if (!isSeriesResult) {
        // Single file
        await processSingleVideoFile(jobId, contentId, allVideos[0], downloadDir, transcode);
      } else {
        // Series: process each episode
        await processSeriesEpisodes(jobId, contentId, allVideos, downloadDir, transcode);
      }
      resolve();
    });

    engine.on('error', async (err: Error) => {
      cleanup();
      await handleJobError(jobId, contentId, engine, err.message);
      resolve();
    });
  });
}

async function processSingleFileDownload(jobId: string, contentId: string, torrentSource: string, transcode: boolean) {
  const downloadDir = path.join(TORRENTS_DIR, contentId, 'data');
  fs.mkdirSync(downloadDir, { recursive: true });

  let engine: any;
  try {
    const isMagnet = torrentSource.startsWith('magnet:');
    const source = isMagnet ? torrentSource : fs.readFileSync(torrentSource);
    engine = torrentStream(source, {
      path: downloadDir, connections: 50, uploads: 0, verify: true, dht: true, tracker: true,
    });
  } catch (err: any) {
    await handleJobError(jobId, contentId, null, `Invalid torrent source: ${err.message}`);
    return;
  }

  activeTorrents.set(contentId, engine);

  return new Promise<void>((resolve) => {
    let selectedFile: any = null;
    let totalSize = 0;
    let lastDownloaded = 0;
    let stallCount = 0;
    let progressInterval: ReturnType<typeof setInterval> | null = null;
    let stallInterval: ReturnType<typeof setInterval> | null = null;
    let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

    const cleanup = () => {
      if (progressInterval) clearInterval(progressInterval);
      if (stallInterval) clearInterval(stallInterval);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
    };

    engine.on('ready', async () => {
      let largestVideo: any = null;
      for (const file of engine.files) {
        const ext = path.extname(file.name).toLowerCase();
        if (VIDEO_EXTENSIONS.includes(ext) && (!largestVideo || file.length > largestVideo.length)) {
          largestVideo = file;
        }
      }

      if (!largestVideo) {
        cleanup();
        await handleJobError(jobId, contentId, engine, 'No video files found in torrent');
        resolve();
        return;
      }

      selectedFile = largestVideo;
      totalSize = largestVideo.length;

      const SUB_EXTS = ['.srt', '.vtt', '.ass', '.ssa'];
      for (const file of engine.files) {
        const ext = path.extname(file.name).toLowerCase();
        if (file === largestVideo || SUB_EXTS.includes(ext)) file.select();
        else file.deselect();
      }

      await Content.findByIdAndUpdate(contentId, { $set: { 'torrent.fileSize': totalSize } });
      console.log(`📥 Downloading: ${largestVideo.name} (${(totalSize / 1024 / 1024).toFixed(1)} MB)`);

      heartbeatInterval = setInterval(() => updateHeartbeat(jobId), 30000);

      progressInterval = setInterval(async () => {
        try {
          if (await isJobCancelled(jobId)) {
            cleanup();
            engine.destroy(() => {});
            activeTorrents.delete(contentId);
            deleteLocalDirectory(path.join(TORRENTS_DIR, contentId));
            console.log(`🚫 Torrent cancelled: ${contentId}`);
            resolve();
            return;
          }
          const downloaded = engine.swarm?.downloaded || 0;
          const progress = totalSize > 0 ? Math.min(Math.round((downloaded / totalSize) * 100), 100) : 0;
          const speed = engine.swarm?.downloadSpeed ? engine.swarm.downloadSpeed() : 0;
          await Content.findByIdAndUpdate(contentId, {
            $set: { 'torrent.downloadProgress': progress, 'torrent.downloadSpeed': speed },
          });
        } catch {}
      }, 3000);

      const maxStallChecks = Math.ceil(config.torrentStallTimeoutMs / 3000);
      const stallTimeoutLabel = config.torrentStallTimeoutMs >= 3600000
        ? `${Math.round(config.torrentStallTimeoutMs / 3600000)} hour(s)`
        : `${Math.round(config.torrentStallTimeoutMs / 60000)} minute(s)`;
      stallInterval = setInterval(() => {
        const currentDownloaded = engine.swarm?.downloaded || 0;
        if (currentDownloaded === lastDownloaded) {
          stallCount++;
          if (stallCount >= maxStallChecks) {
            cleanup();
            handleJobError(jobId, contentId, engine, `Download stalled — no progress for ${stallTimeoutLabel}`).then(resolve);
          }
        } else {
          stallCount = 0;
          lastDownloaded = currentDownloaded;
        }
      }, 3000);
    });

    engine.on('idle', async () => {
      if (!selectedFile) return;
      cleanup();
      console.log(`✅ Torrent download complete for ${contentId}`);
      await Content.findByIdAndUpdate(contentId, {
        $set: { 'torrent.downloadProgress': 100, 'torrent.downloadSpeed': 0 },
      });

      const videoFilePath = findLargestVideoFile(downloadDir);
      if (!videoFilePath) {
        await handleJobError(jobId, contentId, engine, 'Downloaded file not found on disk');
        resolve();
        return;
      }

      engine.destroy(() => {});
      activeTorrents.delete(contentId);

      await processSingleVideoFile(jobId, contentId, videoFilePath, downloadDir, transcode);
      resolve();
    });

    engine.on('error', async (err: Error) => {
      cleanup();
      await handleJobError(jobId, contentId, engine, err.message);
      resolve();
    });
  });
}

// ---- Post-download processing ----

async function processSingleVideoFile(jobId: string, contentId: string, videoFilePath: string, downloadDir: string, transcode: boolean) {
  const ext = path.extname(videoFilePath);
  const uploadDir = path.join(UPLOADS_DIR, contentId);
  fs.mkdirSync(uploadDir, { recursive: true });
  const inputPath = path.join(uploadDir, `raw${ext}`);

  try {
    fs.copyFileSync(videoFilePath, inputPath);
  } catch (err: any) {
    await handleJobError(jobId, contentId, null, `Failed to move video file: ${err.message}`);
    return;
  }

  // Copy external subtitle files
  const SUBTITLE_EXTS = ['.srt', '.vtt', '.ass', '.ssa'];
  try {
    const scanForSubs = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) scanForSubs(full);
        else if (SUBTITLE_EXTS.includes(path.extname(entry.name).toLowerCase())) {
          fs.copyFileSync(full, path.join(uploadDir, entry.name));
        }
      }
    };
    scanForSubs(downloadDir);
  } catch {}

  deleteLocalDirectory(path.join(TORRENTS_DIR, contentId));

  const videoInfo = getVideoInfo(inputPath);
  await extractSubtitles(contentId, inputPath);

  if (transcode) {
    await Content.findByIdAndUpdate(contentId, {
      $set: { status: 'transcoding', duration: Math.round(videoInfo.duration), isPortrait: videoInfo.isPortrait },
    });
    // Enqueue transcode job instead of doing it in-process
    await enqueueJob('transcode', contentId, {
      inputPath,
      videoInfo,
      isEpisode: false,
    });
    await completeJob(jobId);
  } else {
    let servePath = inputPath;
    let serveExt = ext;

    if (!WEB_PLAYABLE.includes(ext.toLowerCase())) {
      const mp4Path = path.join(uploadDir, 'raw.mp4');
      try {
        await remuxToMp4(inputPath, mp4Path);
        fs.unlinkSync(inputPath);
        servePath = mp4Path;
        serveExt = '.mp4';
      } catch {
        // Remux failed — enqueue transcode as fallback
        await Content.findByIdAndUpdate(contentId, {
          $set: { status: 'transcoding', duration: Math.round(videoInfo.duration) },
        });
        await enqueueJob('transcode', contentId, { inputPath, videoInfo, isEpisode: false });
        await completeJob(jobId);
        return;
      }
    }

    await extractSubtitles(contentId, servePath);

    if (config.storageMode === 's3') {
      await uploadFileToS3(servePath, config.awsS3StreamingBucket, `${contentId}/original${serveExt}`, getVideoContentType(serveExt));
      await Content.findByIdAndUpdate(contentId, {
        $set: {
          status: 'published', rawUrl: `${config.cloudfrontDomain}/${contentId}/original${serveExt}`,
          duration: Math.round(videoInfo.duration), isPortrait: videoInfo.isPortrait, 'streaming.hlsUrl': '',
        },
      });
      deleteLocalDirectory(uploadDir);
    } else {
      await Content.findByIdAndUpdate(contentId, {
        $set: {
          status: 'published', rawUrl: `/uploads/${contentId}/raw${serveExt}`,
          duration: Math.round(videoInfo.duration), isPortrait: videoInfo.isPortrait, 'streaming.hlsUrl': '',
        },
      });
    }
    await completeJob(jobId);
  }
}

async function processSeriesEpisodes(jobId: string, contentId: string, allVideos: string[], downloadDir: string, transcode: boolean) {
  await Content.findByIdAndUpdate(contentId, { $set: { status: 'transcoding', type: 'series' } });

  const processedEpisodes: any[] = [];

  for (let i = 0; i < allVideos.length; i++) {
    const videoFile = allVideos[i];
    const fileName = path.basename(videoFile);
    const ext = path.extname(videoFile);
    const epInfo = parseEpisodeInfo(fileName);
    const epId = `${contentId}_ep${i}`;

    console.log(`🎬 Processing episode ${i + 1}/${allVideos.length}: ${fileName}`);

    const epUploadDir = path.join(UPLOADS_DIR, epId);
    fs.mkdirSync(epUploadDir, { recursive: true });
    const inputPath = path.join(epUploadDir, `raw${ext}`);
    fs.copyFileSync(videoFile, inputPath);

    const videoInfo = getVideoInfo(inputPath);
    const epSubtitles = await extractSubtitles(epId, inputPath);

    let thumbUrl = '';
    try { thumbUrl = await generateThumbnail(epId, inputPath, videoInfo); } catch {}

    let episodeUrl = '';
    if (transcode) {
      const epOutputDir = path.join(STREAMS_DIR, epId);
      fs.mkdirSync(epOutputDir, { recursive: true });
      await new Promise<void>((resolve) => {
        const cmd = `ffmpeg -i "${inputPath}" -y -c:v libx264 -b:v 4000k -preset fast -profile:v main -c:a aac -b:a 192k -f hls -hls_time 4 -hls_playlist_type vod -hls_segment_filename "${epOutputDir}/segment_%03d.ts" "${epOutputDir}/stream.m3u8"`;
        exec(cmd, async (err) => {
          if (err) { console.error(`❌ Episode transcode failed: ${fileName}`, err.message); resolve(); return; }
          if (config.storageMode === 's3') {
            await uploadDirectoryToS3(epOutputDir, config.awsS3StreamingBucket, epId);
            episodeUrl = `${config.cloudfrontDomain}/${epId}/stream.m3u8`;
            deleteLocalDirectory(epOutputDir);
          } else {
            episodeUrl = `/streams/${epId}/stream.m3u8`;
          }
          resolve();
        });
      });
    } else {
      let servePath = inputPath;
      let serveExt = ext;
      if (!WEB_PLAYABLE.includes(ext.toLowerCase())) {
        const mp4Path = path.join(epUploadDir, 'raw.mp4');
        try { await remuxToMp4(inputPath, mp4Path); fs.unlinkSync(inputPath); servePath = mp4Path; serveExt = '.mp4'; } catch {}
      }
      if (config.storageMode === 's3') {
        await uploadFileToS3(servePath, config.awsS3StreamingBucket, `${epId}/original${serveExt}`, getVideoContentType(serveExt));
        episodeUrl = `${config.cloudfrontDomain}/${epId}/original${serveExt}`;
      } else {
        episodeUrl = `/uploads/${epId}/raw${serveExt}`;
      }
    }

    if (config.storageMode === 's3') deleteLocalDirectory(epUploadDir);

    processedEpisodes.push({
      episodeNumber: epInfo.episode || i + 1,
      title: epInfo.title || `Episode ${i + 1}`,
      description: '',
      duration: Math.round(videoInfo.duration),
      hlsUrl: episodeUrl,
      thumbnailUrl: thumbUrl,
      subtitles: epSubtitles,
    });

    console.log(`   ✅ Episode ${i + 1} done: ${episodeUrl}`);

    // Update heartbeat during long series processing
    await updateHeartbeat(jobId);
  }

  deleteLocalDirectory(path.join(TORRENTS_DIR, contentId));

  await Content.findByIdAndUpdate(contentId, {
    $set: {
      status: 'published',
      type: 'series',
      seasons: [{
        seasonNumber: 1,
        title: 'Season 1',
        episodes: processedEpisodes.sort((a, b) => a.episodeNumber - b.episodeNumber),
      }],
    },
  });
  console.log(`✅ Series complete: ${contentId} — ${processedEpisodes.length} episodes`);
  await completeJob(jobId);
}

async function handleJobError(jobId: string, contentId: string, engine: any, message: string) {
  console.error(`❌ Torrent error for ${contentId}: ${message}`);
  try {
    await Content.findByIdAndUpdate(contentId, {
      $set: { status: 'error', 'torrent.errorMessage': message },
    });
  } catch {}

  if (engine) {
    try { engine.destroy(() => {}); } catch {}
  }
  activeTorrents.delete(contentId);

  const torrentDir = path.join(TORRENTS_DIR, contentId);
  if (fs.existsSync(torrentDir)) deleteLocalDirectory(torrentDir);

  await failJob(jobId, message);
}
