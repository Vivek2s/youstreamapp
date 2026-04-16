import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { uploadVideo, getTranscodeStatus, uploadSubtitle } from '../controllers/upload.controller';
import { uploadTorrent, uploadMagnet, parseTorrentFiles, startSeriesDownload, cancelTorrent, getActivity } from '../controllers/torrent.controller';
import { authMiddleware, adminMiddleware } from '../middleware/auth.middleware';
import { config } from '../config';

const UPLOADS_DIR = path.join(config.storageRoot, 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ['.mp4', '.mkv', '.avi', '.mov', '.webm'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only video files allowed: ' + allowed.join(', ')));
    }
  },
});

// Torrent file multer config
const torrentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const torrentUpload = multer({
  storage: torrentStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max for .torrent files
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.torrent') {
      cb(null, true);
    } else {
      cb(new Error('Only .torrent files allowed'));
    }
  },
});

// Subtitle file multer config
const subtitleStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const subtitleUpload = multer({
  storage: subtitleStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max for subtitle files
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.srt', '.vtt', '.ass', '.ssa'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only subtitle files allowed: .srt, .vtt, .ass, .ssa'));
    }
  },
});

const router = Router();

// Upload requires auth (admin in production, any user for testing)
router.post('/video', authMiddleware, upload.single('video'), uploadVideo);
router.post('/torrent', authMiddleware, torrentUpload.single('torrent'), uploadTorrent);
router.post('/torrent/parse', authMiddleware, torrentUpload.single('torrent'), parseTorrentFiles);
router.post('/torrent/download', authMiddleware, startSeriesDownload);
router.post('/magnet', authMiddleware, uploadMagnet);
router.post('/torrent/:contentId/cancel', authMiddleware, cancelTorrent);
router.post('/subtitle/:contentId', authMiddleware, subtitleUpload.single('subtitle'), uploadSubtitle);
router.get('/status/:contentId', authMiddleware, getTranscodeStatus);
router.get('/activity', authMiddleware, getActivity);

export default router;
