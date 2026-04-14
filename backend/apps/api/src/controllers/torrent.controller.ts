import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import torrentStream from 'torrent-stream';
import { Content } from '../models/content.model';
import { sendSuccess, sendError } from '../utils/response';
import { config } from '../config';
import { exec } from 'child_process';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const parseTorrent = require('parse-torrent');
import { getVideoInfo, getVideoContentType, transcodeToHLS, UPLOADS_DIR } from './upload.controller';
import { uploadFileToS3, deleteLocalDirectory } from '../utils/s3';

const TORRENTS_DIR = path.join(config.storageRoot, 'torrents');
fs.mkdirSync(TORRENTS_DIR, { recursive: true });

const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.wmv', '.flv'];

// Track active torrent engines for concurrency limit and cleanup
const activeTorrents = new Map<string, any>();

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

async function handleTorrentError(contentId: string, engine: any, message: string) {
  console.error(`❌ Torrent error for ${contentId}: ${message}`);
  try {
    await Content.findByIdAndUpdate(contentId, {
      $set: {
        status: 'error',
        'torrent.errorMessage': message,
      },
    });
  } catch (e) {
    console.error('Failed to update content status to error:', e);
  }

  // Clean up engine
  if (engine) {
    try {
      engine.destroy(() => {});
    } catch {}
  }
  activeTorrents.delete(contentId);

  // Clean up torrent files
  const torrentDir = path.join(TORRENTS_DIR, contentId);
  if (fs.existsSync(torrentDir)) {
    deleteLocalDirectory(torrentDir);
  }
}

// Extensions that can be played natively in HTML5 video (no remux needed)
const WEB_PLAYABLE = ['.mp4', '.webm'];

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

async function startTorrentDownload(contentId: string, torrentFilePath: string, transcode: boolean) {
  const downloadDir = path.join(TORRENTS_DIR, contentId, 'data');
  fs.mkdirSync(downloadDir, { recursive: true });

  let engine: any;
  try {
    const torrentBuffer = fs.readFileSync(torrentFilePath);
    engine = torrentStream(torrentBuffer, {
      path: downloadDir,
      connections: 50,
      uploads: 0,
      verify: true,
      dht: true,
      tracker: true,
    });
  } catch (err: any) {
    await handleTorrentError(contentId, null, `Invalid torrent file: ${err.message}`);
    return;
  }

  activeTorrents.set(contentId, engine);

  let selectedFile: any = null;
  let totalSize = 0;
  let lastDownloaded = 0;
  let stallCount = 0;
  let progressInterval: ReturnType<typeof setInterval> | null = null;
  let stallInterval: ReturnType<typeof setInterval> | null = null;

  const cleanup = () => {
    if (progressInterval) clearInterval(progressInterval);
    if (stallInterval) clearInterval(stallInterval);
  };

  engine.on('ready', async () => {
    console.log(`📥 Torrent ready for ${contentId}, ${engine.files.length} files found`);

    // Find the largest video file in the torrent
    let largestVideo: any = null;
    for (const file of engine.files) {
      const ext = path.extname(file.name).toLowerCase();
      if (VIDEO_EXTENSIONS.includes(ext)) {
        if (!largestVideo || file.length > largestVideo.length) {
          largestVideo = file;
        }
      }
    }

    if (!largestVideo) {
      cleanup();
      await handleTorrentError(contentId, engine, 'No video files found in torrent');
      return;
    }

    selectedFile = largestVideo;
    totalSize = largestVideo.length;

    // Select only the video file, deselect everything else
    for (const file of engine.files) {
      if (file === largestVideo) {
        file.select();
      } else {
        file.deselect();
      }
    }

    // Update Content with file size
    await Content.findByIdAndUpdate(contentId, {
      $set: { 'torrent.fileSize': totalSize },
    });

    console.log(`📥 Downloading: ${largestVideo.name} (${(totalSize / 1024 / 1024).toFixed(1)} MB)`);

    // Progress updates every 3 seconds
    progressInterval = setInterval(async () => {
      try {
        const downloaded = engine.swarm?.downloaded || 0;
        const progress = totalSize > 0 ? Math.min(Math.round((downloaded / totalSize) * 100), 100) : 0;
        const speed = engine.swarm?.downloadSpeed ? engine.swarm.downloadSpeed() : 0;
        await Content.findByIdAndUpdate(contentId, {
          $set: {
            'torrent.downloadProgress': progress,
            'torrent.downloadSpeed': speed,
          },
        });
      } catch {}
    }, 3000);

    // Stall detection every 3 seconds — abort after 5 minutes of no progress
    const maxStallChecks = Math.ceil(config.torrentStallTimeoutMs / 3000);
    stallInterval = setInterval(() => {
      const currentDownloaded = engine.swarm?.downloaded || 0;
      if (currentDownloaded === lastDownloaded) {
        stallCount++;
        if (stallCount >= maxStallChecks) {
          cleanup();
          handleTorrentError(contentId, engine, 'Download stalled — no progress for 5 minutes');
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

    // Update progress to 100%
    await Content.findByIdAndUpdate(contentId, {
      $set: { 'torrent.downloadProgress': 100, 'torrent.downloadSpeed': 0 },
    });

    // Find the downloaded video file on disk
    const videoFilePath = findLargestVideoFile(downloadDir);
    if (!videoFilePath) {
      await handleTorrentError(contentId, engine, 'Downloaded file not found on disk');
      return;
    }

    // Move video to uploads dir for transcoding
    const ext = path.extname(videoFilePath);
    const uploadDir = path.join(UPLOADS_DIR, contentId);
    fs.mkdirSync(uploadDir, { recursive: true });
    const inputPath = path.join(uploadDir, `raw${ext}`);

    try {
      fs.copyFileSync(videoFilePath, inputPath);
    } catch (err: any) {
      await handleTorrentError(contentId, engine, `Failed to move video file: ${err.message}`);
      return;
    }

    // Clean up torrent download data and engine
    engine.destroy(() => {});
    activeTorrents.delete(contentId);
    deleteLocalDirectory(path.join(TORRENTS_DIR, contentId));

    // Probe video
    const videoInfo = getVideoInfo(inputPath);

    if (transcode) {
      // Full HLS transcode
      await Content.findByIdAndUpdate(contentId, {
        $set: {
          status: 'transcoding',
          duration: Math.round(videoInfo.duration / 60),
          isPortrait: videoInfo.isPortrait,
        },
      });
      console.log(`🔄 Starting transcode for torrent content ${contentId}`);
      transcodeToHLS(contentId, inputPath, videoInfo);
    } else {
      // Direct serve — remux to MP4 if not web-playable
      let servePath = inputPath;
      let serveExt = ext;

      if (!WEB_PLAYABLE.includes(ext.toLowerCase())) {
        const mp4Path = path.join(uploadDir, 'raw.mp4');
        try {
          await remuxToMp4(inputPath, mp4Path);
          // Remove original, use remuxed
          fs.unlinkSync(inputPath);
          servePath = mp4Path;
          serveExt = '.mp4';
          console.log(`✅ Remuxed ${ext} → .mp4 for ${contentId}`);
        } catch (err: any) {
          console.error(`❌ Remux failed for ${contentId}, falling back to transcode:`, err.message);
          await Content.findByIdAndUpdate(contentId, {
            $set: { status: 'transcoding', duration: Math.round(videoInfo.duration / 60) },
          });
          transcodeToHLS(contentId, inputPath, videoInfo);
          return;
        }
      }

      // Upload to S3 or serve locally
      if (config.storageMode === 's3') {
        const rawS3Key = `${contentId}/original${serveExt}`;
        await uploadFileToS3(servePath, config.awsS3StreamingBucket, rawS3Key, getVideoContentType(serveExt));
        const rawUrl = `${config.cloudfrontDomain}/${contentId}/original${serveExt}`;
        await Content.findByIdAndUpdate(contentId, {
          $set: {
            status: 'published',
            rawUrl,
            duration: Math.round(videoInfo.duration / 60),
            isPortrait: videoInfo.isPortrait,
            streaming: { hlsUrl: '', subtitles: [] },
          },
        });
        deleteLocalDirectory(uploadDir);
        console.log(`✅ Published (direct serve): ${contentId} → ${rawUrl}`);
      } else {
        const rawUrl = `/uploads/${contentId}/raw${serveExt}`;
        await Content.findByIdAndUpdate(contentId, {
          $set: {
            status: 'published',
            rawUrl,
            duration: Math.round(videoInfo.duration / 60),
            isPortrait: videoInfo.isPortrait,
            streaming: { hlsUrl: '', subtitles: [] },
          },
        });
        console.log(`✅ Published (direct serve, local): ${contentId}`);
      }
    }
  });

  engine.on('error', async (err: Error) => {
    cleanup();
    await handleTorrentError(contentId, engine, err.message);
  });
}

// POST /api/v1/upload/torrent
export async function uploadTorrent(req: Request, res: Response) {
  try {
    if (!req.file) {
      return sendError(res, 'VALIDATION', 'No torrent file provided');
    }

    const { title, description, type, rating } = req.body;
    const transcode = req.body.transcode === 'true' || req.body.transcode === true;

    if (!title) {
      return sendError(res, 'VALIDATION', 'Title is required');
    }

    // Check concurrency limit
    if (activeTorrents.size >= config.torrentMaxConcurrent) {
      // Clean up uploaded file
      if (req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return sendError(res, 'BUSY', 'Another torrent download is already in progress. Please wait.', 429);
    }

    console.log(`\n📥 Torrent upload received: ${req.file.originalname}`);

    // Pre-validate: parse .torrent and check for video files
    try {
      const torrentBuffer = fs.readFileSync(req.file.path);
      const parsed = parseTorrent(torrentBuffer) as any;
      const videoFiles = (parsed.files || []).filter((f: any) =>
        VIDEO_EXTENSIONS.includes(path.extname(f.name || f.path || '').toLowerCase())
      );
      if (videoFiles.length === 0) {
        fs.unlinkSync(req.file.path);
        return sendError(res, 'VALIDATION', 'Torrent contains no video files. Only torrents with video content (.mp4, .mkv, .avi, .mov, .webm) are allowed.', 400);
      }
      const largest = videoFiles.sort((a: any, b: any) => (b.length || 0) - (a.length || 0))[0];
      console.log(`📋 Torrent validated: ${videoFiles.length} video file(s), largest: ${largest.name || largest.path} (${((largest.length || 0) / 1024 / 1024).toFixed(1)} MB)`);
    } catch (parseErr: any) {
      // If parse fails, allow download to proceed — engine will validate later
      console.warn(`⚠️ Could not pre-validate torrent: ${parseErr.message}`);
    }

    // Create content document
    const content = await Content.create({
      type: type || 'movie',
      title,
      description: description || '',
      rating: rating || 'U',
      status: 'downloading',
      torrent: {
        downloadProgress: 0,
        downloadSpeed: 0,
        fileSize: 0,
        errorMessage: '',
      },
    });

    const contentId = content._id.toString();

    // Move torrent file to torrents dir
    const torrentDir = path.join(TORRENTS_DIR, contentId);
    fs.mkdirSync(torrentDir, { recursive: true });
    const torrentFilePath = path.join(torrentDir, 'source.torrent');
    fs.renameSync(req.file.path, torrentFilePath);

    // Start download in background (fire-and-forget)
    startTorrentDownload(contentId, torrentFilePath, transcode);

    return sendSuccess(res, {
      contentId,
      message: 'Torrent received, download started.',
      status: 'downloading',
    }, 'Torrent upload started', 201);
  } catch (error) {
    console.error('uploadTorrent error:', error);
    return sendError(res, 'SERVER_ERROR', 'Torrent upload failed', 500);
  }
}

// POST /api/v1/upload/torrent/:contentId/cancel
export async function cancelTorrent(req: Request, res: Response) {
  try {
    const contentId = req.params.contentId as string;
    const content = await Content.findById(contentId);

    if (!content) {
      return sendError(res, 'NOT_FOUND', 'Content not found', 404);
    }

    if (content.status !== 'downloading') {
      return sendError(res, 'VALIDATION', `Cannot cancel — status is "${content.status}"`, 400);
    }

    // Destroy the torrent engine if active
    const engine = activeTorrents.get(contentId);
    if (engine) {
      try { engine.destroy(() => {}); } catch {}
      activeTorrents.delete(contentId);
    }

    // Clean up files on disk
    const torrentDir = path.join(TORRENTS_DIR, contentId);
    if (fs.existsSync(torrentDir)) {
      deleteLocalDirectory(torrentDir);
    }
    const uploadDir = path.join(UPLOADS_DIR, contentId);
    if (fs.existsSync(uploadDir)) {
      deleteLocalDirectory(uploadDir);
    }

    // Delete the content doc entirely
    await Content.findByIdAndDelete(contentId);

    console.log(`🚫 Torrent cancelled and removed: ${contentId}`);
    return sendSuccess(res, { contentId }, 'Torrent download cancelled');
  } catch (error) {
    console.error('cancelTorrent error:', error);
    return sendError(res, 'SERVER_ERROR', 'Failed to cancel torrent', 500);
  }
}

// GET /api/v1/upload/activity
export async function getActivity(_req: Request, res: Response) {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const items = await Content.find({
      $or: [
        { status: { $in: ['downloading', 'transcoding', 'error'] } },
        { status: 'published', updatedAt: { $gte: twentyFourHoursAgo } },
      ],
    })
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();

    return sendSuccess(res, items);
  } catch (error) {
    console.error('getActivity error:', error);
    return sendError(res, 'SERVER_ERROR', 'Failed to get activity', 500);
  }
}

// Cleanup function for server shutdown / restart
export function getActiveTorrentCount(): number {
  return activeTorrents.size;
}
