import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import torrentStream from 'torrent-stream';
import { Content } from '../models/content.model';
import { sendSuccess, sendError } from '../utils/response';
import { config } from '../config';
import { enqueueJob, cancelJob } from '../queues/jobQueue';
import { deleteLocalDirectory } from '../utils/s3';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const parseTorrent = require('parse-torrent');

const TORRENTS_DIR = path.join(config.storageRoot, 'torrents');
const UPLOADS_DIR = path.join(config.storageRoot, 'uploads');
fs.mkdirSync(TORRENTS_DIR, { recursive: true });

const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.wmv', '.flv'];

// --- Episode name parser (used only for building initial episode metadata) ---
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

// Temporary store for parsed torrent data (cleaned up after 30 min)
const parsedTorrents = new Map<string, { source: string; files: any[]; timer: ReturnType<typeof setTimeout> }>();

// POST /api/v1/upload/torrent/parse — Parse torrent and return file list
export async function parseTorrentFiles(req: Request, res: Response) {
  try {
    const magnetLink = req.body?.magnetLink;

    if (magnetLink && magnetLink.startsWith('magnet:')) {
      console.log(`🧲 Parsing magnet: ${magnetLink.substring(0, 60)}...`);

      const torrentId = `mag_${Date.now()}`;
      const tempDir = path.join(TORRENTS_DIR, torrentId, 'data');
      fs.mkdirSync(tempDir, { recursive: true });

      const engine = torrentStream(magnetLink, {
        path: tempDir,
        connections: 50,
        uploads: 0,
        dht: true,
        tracker: true,
      });

      const fileList = await new Promise<any[]>((resolve, reject) => {
        const timeout = setTimeout(() => {
          engine.destroy(() => {});
          deleteLocalDirectory(path.join(TORRENTS_DIR, torrentId));
          reject(new Error('Timeout waiting for magnet metadata (30s). Try a different magnet link.'));
        }, 30000);

        engine.on('ready', () => {
          clearTimeout(timeout);
          const files = engine.files.map((f: any, i: number) => {
            const ext = path.extname(f.name).toLowerCase();
            return { index: i, name: f.name, size: f.length, isVideo: VIDEO_EXTENSIONS.includes(ext) };
          });
          engine.files.forEach((f: any) => f.deselect());
          engine.destroy(() => {});
          deleteLocalDirectory(path.join(TORRENTS_DIR, torrentId));
          resolve(files);
        });

        engine.on('error', (err: Error) => {
          clearTimeout(timeout);
          engine.destroy(() => {});
          deleteLocalDirectory(path.join(TORRENTS_DIR, torrentId));
          reject(err);
        });
      });

      const storeId = `magnet_${Date.now()}`;
      const timer = setTimeout(() => parsedTorrents.delete(storeId), 30 * 60 * 1000);
      parsedTorrents.set(storeId, { source: magnetLink, files: fileList, timer });

      return sendSuccess(res, { torrentId: storeId, files: fileList });
    }

    // .torrent file
    if (!req.file) {
      return sendError(res, 'VALIDATION', 'Provide a .torrent file or magnetLink in body');
    }

    const torrentBuffer = fs.readFileSync(req.file.path);
    let parsed: any;
    try {
      parsed = parseTorrent(torrentBuffer);
    } catch {
      fs.unlinkSync(req.file.path);
      return sendError(res, 'VALIDATION', 'Invalid torrent file');
    }

    const files = (parsed.files || []).map((f: any, i: number) => {
      const name = f.name || f.path || `file_${i}`;
      const ext = path.extname(name).toLowerCase();
      return { index: i, name, size: f.length || 0, isVideo: VIDEO_EXTENSIONS.includes(ext) };
    });

    const storeId = `file_${Date.now()}`;
    const torrentPath = path.join(TORRENTS_DIR, `${storeId}.torrent`);
    fs.renameSync(req.file.path, torrentPath);
    const timer = setTimeout(() => {
      parsedTorrents.delete(storeId);
      if (fs.existsSync(torrentPath)) fs.unlinkSync(torrentPath);
    }, 30 * 60 * 1000);
    parsedTorrents.set(storeId, { source: torrentPath, files, timer });

    return sendSuccess(res, { torrentId: storeId, files });
  } catch (error: any) {
    console.error('parseTorrentFiles error:', error);
    return sendError(res, 'SERVER_ERROR', error.message || 'Failed to parse torrent', 500);
  }
}

// POST /api/v1/upload/torrent/download — Start multi-file download
export async function startSeriesDownload(req: Request, res: Response) {
  try {
    const { torrentId, title, description, rating, selectedFiles, transcode: transStr } = req.body;
    const transcode = transStr === 'true' || transStr === true;

    if (!torrentId || !title) {
      return sendError(res, 'VALIDATION', 'torrentId and title are required');
    }

    const parsed = parsedTorrents.get(torrentId);
    if (!parsed) {
      return sendError(res, 'NOT_FOUND', 'Torrent session expired. Please parse again.', 404);
    }

    // Determine which file indices to download
    const selected: number[] = selectedFiles || parsed.files.filter((f: any) => f.isVideo).map((f: any) => f.index);
    const selectedFileInfos = selected.map((idx: number) => parsed.files[idx]).filter(Boolean);

    if (selectedFileInfos.length === 0) {
      return sendError(res, 'VALIDATION', 'No files selected');
    }

    // Detect series: multiple files selected, OR the torrent has multiple videos, OR filenames have episode patterns
    const totalVideoFiles = parsed.files.filter((f: any) => f.isVideo).length;
    const hasEpisodePattern = selectedFileInfos.some((f: any) => /[Ss]\d+[Ee]\d+|\d+x\d+|[Ee][Pp]?\d+/i.test(f.name));
    const isSeries = selectedFileInfos.length > 1 || totalVideoFiles > 1 || hasEpisodePattern;

    // Build episode list from filenames
    const episodes = selectedFileInfos.map((f: any, i: number) => {
      const info = parseEpisodeInfo(f.name);
      return {
        episodeNumber: info.episode || i + 1,
        title: info.title || `Episode ${i + 1}`,
        description: '',
        duration: 0,
        hlsUrl: '',
        thumbnailUrl: '',
      };
    }).sort((a: any, b: any) => a.episodeNumber - b.episodeNumber);

    // Create content document
    const content = await Content.create({
      type: isSeries ? 'series' : 'movie',
      title,
      description: description || '',
      rating: rating || 'U',
      status: 'downloading',
      seasons: isSeries ? [{ seasonNumber: 1, title: 'Season 1', episodes }] : [],
      torrent: { downloadProgress: 0, downloadSpeed: 0, fileSize: 0, errorMessage: '' },
    });

    const contentId = content._id.toString();

    // Clean up parsed cache
    clearTimeout(parsed.timer);
    parsedTorrents.delete(torrentId);

    // Enqueue job for the torrent worker
    await enqueueJob('torrent-download', contentId, {
      torrentSource: parsed.source,
      selectedIndices: selected,
      transcode,
      isSeries,
    });

    console.log(`📥 Series download enqueued: ${contentId} — ${selectedFileInfos.length} files`);

    return sendSuccess(res, {
      contentId,
      message: `Download enqueued for ${selectedFileInfos.length} file(s).`,
      status: 'downloading',
    }, 'Download started', 201);
  } catch (error) {
    console.error('startSeriesDownload error:', error);
    return sendError(res, 'SERVER_ERROR', 'Failed to start download', 500);
  }
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

    console.log(`\n📥 Torrent upload received: ${req.file.originalname}`);

    // Pre-validate
    try {
      const torrentBuffer = fs.readFileSync(req.file.path);
      const parsed = parseTorrent(torrentBuffer) as any;
      const videoFiles = (parsed.files || []).filter((f: any) =>
        VIDEO_EXTENSIONS.includes(path.extname(f.name || f.path || '').toLowerCase())
      );
      if (videoFiles.length === 0) {
        fs.unlinkSync(req.file.path);
        return sendError(res, 'VALIDATION', 'Torrent contains no video files.', 400);
      }
      const largest = videoFiles.sort((a: any, b: any) => (b.length || 0) - (a.length || 0))[0];
      console.log(`📋 Torrent validated: ${videoFiles.length} video file(s), largest: ${largest.name || largest.path} (${((largest.length || 0) / 1024 / 1024).toFixed(1)} MB)`);
    } catch (parseErr: any) {
      console.warn(`⚠️ Could not pre-validate torrent: ${parseErr.message}`);
    }

    const content = await Content.create({
      type: type || 'movie', title, description: description || '', rating: rating || 'U',
      status: 'downloading',
      torrent: { downloadProgress: 0, downloadSpeed: 0, fileSize: 0, errorMessage: '' },
    });

    const contentId = content._id.toString();
    const torrentDir = path.join(TORRENTS_DIR, contentId);
    fs.mkdirSync(torrentDir, { recursive: true });
    const torrentFilePath = path.join(torrentDir, 'source.torrent');
    fs.renameSync(req.file.path, torrentFilePath);

    // Enqueue job for the torrent worker
    await enqueueJob('torrent-download', contentId, {
      torrentSource: torrentFilePath,
      selectedIndices: [],
      transcode,
      isSeries: false,
    });

    return sendSuccess(res, {
      contentId, message: 'Torrent received, download enqueued.', status: 'downloading',
    }, 'Torrent upload started', 201);
  } catch (error) {
    console.error('uploadTorrent error:', error);
    return sendError(res, 'SERVER_ERROR', 'Torrent upload failed', 500);
  }
}

// POST /api/v1/upload/magnet
export async function uploadMagnet(req: Request, res: Response) {
  try {
    const { magnetLink, title, description, type, rating } = req.body;
    const transcode = req.body.transcode === 'true' || req.body.transcode === true;

    if (!magnetLink || !magnetLink.startsWith('magnet:')) {
      return sendError(res, 'VALIDATION', 'A valid magnet link is required');
    }
    if (!title) {
      return sendError(res, 'VALIDATION', 'Title is required');
    }

    console.log(`\n🧲 Magnet link received: ${magnetLink.substring(0, 60)}...`);

    const content = await Content.create({
      type: type || 'movie', title, description: description || '', rating: rating || 'U',
      status: 'downloading',
      torrent: { downloadProgress: 0, downloadSpeed: 0, fileSize: 0, errorMessage: '' },
    });

    const contentId = content._id.toString();

    // Enqueue job for the torrent worker
    await enqueueJob('torrent-download', contentId, {
      torrentSource: magnetLink,
      selectedIndices: [],
      transcode,
      isSeries: false,
    });

    return sendSuccess(res, {
      contentId, message: 'Magnet download enqueued.', status: 'downloading',
    }, 'Magnet download started', 201);
  } catch (error) {
    console.error('uploadMagnet error:', error);
    return sendError(res, 'SERVER_ERROR', 'Magnet download failed', 500);
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

    // Cancel the job in the queue (worker will pick up the cancellation)
    await cancelJob(contentId);

    // Clean up files on disk
    const torrentDir = path.join(TORRENTS_DIR, contentId);
    if (fs.existsSync(torrentDir)) deleteLocalDirectory(torrentDir);
    const uploadDir = path.join(UPLOADS_DIR, contentId);
    if (fs.existsSync(uploadDir)) deleteLocalDirectory(uploadDir);

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
