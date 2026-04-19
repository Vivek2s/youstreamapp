import { Request, Response } from 'express';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

// Convert SRT/ASS/SSA to VTT in pure Node.js (no FFmpeg needed)
function convertSrtToVtt(srtContent: string): string {
  let vtt = 'WEBVTT\n\n';
  // SRT uses comma in timestamps (00:01:23,456), VTT uses dot (00:01:23.456)
  vtt += srtContent
    .replace(/\r\n/g, '\n')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return vtt;
}
import { Content } from '../models/content.model';
import { sendSuccess, sendError } from '../utils/response';
import { config } from '../config';
import { uploadFileToS3, deleteLocalDirectory } from '../utils/s3';
import { enqueueJob } from '../queues/jobQueue';

export const UPLOADS_DIR = path.join(config.storageRoot, 'uploads');
export const STREAMS_DIR = path.join(config.storageRoot, 'streams');

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  isPortrait: boolean;
}

export function getVideoInfo(filePath: string): VideoInfo {
  let duration = 0;
  let width = 0;
  let height = 0;

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
      if (rotation === 90 || rotation === 270) {
        [width, height] = [height, width];
      }
      const sideData = videoStream.side_data_list?.find((sd: any) => sd.rotation);
      if (sideData) {
        const r = Math.abs(parseInt(sideData.rotation, 10));
        if (r === 90 || r === 270) {
          [width, height] = [height, width];
        }
      }
    }
  } catch {
    console.warn('Could not probe video');
  }

  const isPortrait = height > width;
  console.log(`🎬 Video: ${width}x${height} ${isPortrait ? 'portrait' : 'landscape'} ${duration}s`);
  return { duration, width, height, isPortrait };
}

export function getVideoContentType(ext: string): string {
  const types: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
  };
  return types[ext.toLowerCase()] || 'video/mp4';
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

// Extract embedded subtitles from video container and find external .srt/.vtt/.ass files
export async function extractSubtitles(contentId: string, inputPath: string): Promise<{ lang: string; url: string }[]> {
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

    for (let i = 0; i < subStreams.length; i++) {
      const stream = subStreams[i];
      const lang = stream.tags?.language || stream.tags?.title || `sub${i}`;
      const vttPath = path.join(subsDir, `${lang}_${i}.vtt`);

      try {
        execSync(
          `ffmpeg -i "${inputPath}" -map 0:s:${i} -c:s webvtt -y "${vttPath}"`,
          { stdio: 'pipe' }
        );

        if (fs.existsSync(vttPath) && fs.statSync(vttPath).size > 0) {
          const url = await uploadSubtitleFile(contentId, vttPath, `${lang}_${i}.vtt`);
          if (url) results.push({ lang, url });
        }
      } catch {}
    }
  } catch {}

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
      await Content.findByIdAndUpdate(contentId, {
        $set: { 'streaming.subtitles': results },
      });
    } catch {}
    console.log(`📝 Extracted ${results.length} subtitle(s) for ${contentId}: ${results.map(s => s.lang).join(', ')}`);
  }

  deleteLocalDirectory(subsDir);
  return results;
}

// POST /api/v1/upload/subtitle/:contentId — Upload external subtitle file
export async function uploadSubtitle(req: Request, res: Response) {
  try {
    if (!req.file) {
      return sendError(res, 'VALIDATION', 'No subtitle file provided');
    }

    const contentId = req.params.contentId as string;
    const lang = req.body.lang || path.basename(req.file.originalname, path.extname(req.file.originalname));

    const content = await Content.findById(contentId);
    if (!content) {
      return sendError(res, 'NOT_FOUND', 'Content not found', 404);
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    const tempPath = req.file.path;
    let vttPath = tempPath;

    if (ext !== '.vtt') {
      vttPath = tempPath.replace(/\.[^.]+$/, '.vtt');

      if (ext === '.srt') {
        // SRT → VTT: pure text conversion, no FFmpeg needed
        const srtContent = fs.readFileSync(tempPath, 'utf-8');
        fs.writeFileSync(vttPath, convertSrtToVtt(srtContent));
        fs.unlinkSync(tempPath);
      } else {
        // ASS/SSA → VTT: try FFmpeg, but handle gracefully if not available
        try {
          execSync(`ffmpeg -i "${tempPath}" -c:s webvtt -y "${vttPath}"`, { stdio: 'pipe' });
        } catch (err) {
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
          return sendError(res, 'SERVER_ERROR', 'Failed to convert subtitle to VTT. ASS/SSA conversion requires FFmpeg.', 500);
        }
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      }
    }

    const fileName = `${lang}.vtt`;
    const url = await uploadSubtitleFile(contentId, vttPath, fileName);

    if (fs.existsSync(vttPath)) fs.unlinkSync(vttPath);

    const existingSubs = content.streaming.subtitles.filter(s => s.lang !== lang);
    existingSubs.push({ lang, url });

    await Content.findByIdAndUpdate(contentId, {
      $set: { 'streaming.subtitles': existingSubs },
    });

    console.log(`📝 Subtitle uploaded for ${contentId}: ${lang} → ${url}`);
    return sendSuccess(res, { lang, url, subtitles: existingSubs }, 'Subtitle uploaded');
  } catch (error) {
    console.error('uploadSubtitle error:', error);
    return sendError(res, 'SERVER_ERROR', 'Subtitle upload failed', 500);
  }
}

// POST /api/v1/upload/video
export async function uploadVideo(req: Request, res: Response) {
  try {
    if (!req.file) {
      return sendError(res, 'VALIDATION', 'No video file provided');
    }

    const { title, description, type, genreIds, categoryIds, releaseYear, rating } = req.body;
    const transcode = req.body.transcode === 'true' || req.body.transcode === true;

    if (!title) {
      return sendError(res, 'VALIDATION', 'Title is required');
    }

    const uploadedFile = req.file;
    const ext = path.extname(uploadedFile.originalname);
    console.log(`\n📤 Upload received: ${uploadedFile.originalname} (${(uploadedFile.size / 1024 / 1024).toFixed(1)} MB) transcode=${transcode}`);

    const content = await Content.create({
      type: type || 'movie',
      title,
      description: description || '',
      genres: genreIds ? JSON.parse(genreIds) : [],
      categories: categoryIds ? JSON.parse(categoryIds) : [],
      releaseYear: releaseYear || new Date().getFullYear(),
      rating: rating || 'U',
      status: 'draft',
    });

    const contentId = content._id.toString();

    const uploadDir = path.join(UPLOADS_DIR, contentId);
    fs.mkdirSync(uploadDir, { recursive: true });
    const inputPath = path.join(uploadDir, `raw${ext}`);
    fs.renameSync(uploadedFile.path, inputPath);

    console.log(`📁 Saved to: ${inputPath}`);

    const videoInfo = getVideoInfo(inputPath);

    // Generate thumbnail inline (quick operation)
    let thumbnailUrl = '';
    try {
      const thumbPath = path.join(uploadDir, 'thumbnail.jpg');
      const seekTime = Math.max(1, Math.min(10, Math.floor(videoInfo.duration * 0.1)));
      execSync(`ffmpeg -ss ${seekTime} -i "${inputPath}" -vframes 1 -q:v 2 -y "${thumbPath}"`, { stdio: 'pipe' });
      if (fs.existsSync(thumbPath)) {
        if (config.storageMode === 's3') {
          await uploadFileToS3(thumbPath, config.awsS3StreamingBucket, `${contentId}/thumbnail.jpg`, 'image/jpeg');
          thumbnailUrl = `${config.cloudfrontDomain}/${contentId}/thumbnail.jpg`;
        } else {
          const streamsThumbDir = path.join(STREAMS_DIR, contentId);
          fs.mkdirSync(streamsThumbDir, { recursive: true });
          fs.copyFileSync(thumbPath, path.join(streamsThumbDir, 'thumbnail.jpg'));
          thumbnailUrl = `/streams/${contentId}/thumbnail.jpg`;
        }
      }
    } catch {}

    // Extract subtitles inline (quick operation)
    extractSubtitles(contentId, inputPath);

    // Upload original to S3
    if (config.storageMode === 's3') {
      const rawS3Key = `${contentId}/original${ext}`;
      await uploadFileToS3(inputPath, config.awsS3RawBucket, rawS3Key, getVideoContentType(ext));
      await uploadFileToS3(inputPath, config.awsS3StreamingBucket, rawS3Key, getVideoContentType(ext));
      const rawUrl = `${config.cloudfrontDomain}/${contentId}/original${ext}`;

      if (transcode) {
        await Content.findByIdAndUpdate(contentId, {
          $set: { rawUrl, thumbnailUrl, duration: Math.round(videoInfo.duration), isPortrait: videoInfo.isPortrait },
        });

        // Enqueue transcode job for the transcoder worker
        await enqueueJob('transcode', contentId, {
          inputPath,
          videoInfo,
          isEpisode: false,
        });

        return sendSuccess(res, {
          contentId,
          message: 'Upload received, transcoding enqueued. Original saved.',
          status: 'transcoding',
        }, 'Video uploaded', 201);
      } else {
        await Content.findByIdAndUpdate(contentId, {
          $set: {
            status: 'published', rawUrl, thumbnailUrl,
            duration: Math.round(videoInfo.duration), isPortrait: videoInfo.isPortrait, 'streaming.hlsUrl': '',
          },
        });
        deleteLocalDirectory(uploadDir);
        console.log(`✅ Published (no transcode): ${contentId}`);

        return sendSuccess(res, {
          contentId, message: 'Upload complete. Video published.', status: 'published',
        }, 'Video uploaded', 201);
      }
    } else {
      // Local mode
      const rawUrl = `/uploads/${contentId}/raw${ext}`;

      if (transcode) {
        await Content.findByIdAndUpdate(contentId, {
          $set: { rawUrl, thumbnailUrl, duration: Math.round(videoInfo.duration), isPortrait: videoInfo.isPortrait },
        });

        // Enqueue transcode job for the transcoder worker
        await enqueueJob('transcode', contentId, {
          inputPath,
          videoInfo,
          isEpisode: false,
        });

        return sendSuccess(res, {
          contentId, message: 'Upload received, transcoding enqueued', status: 'transcoding',
        }, 'Video uploaded', 201);
      } else {
        await Content.findByIdAndUpdate(contentId, {
          $set: {
            status: 'published', rawUrl, thumbnailUrl,
            duration: Math.round(videoInfo.duration), isPortrait: videoInfo.isPortrait, 'streaming.hlsUrl': '',
          },
        });
        console.log(`✅ Published (no transcode): ${contentId}`);

        return sendSuccess(res, {
          contentId, message: 'Upload complete. Video published.', status: 'published',
        }, 'Video uploaded', 201);
      }
    }
  } catch (error) {
    console.error('uploadVideo error:', error);
    return sendError(res, 'SERVER_ERROR', 'Upload failed', 500);
  }
}

// GET /api/v1/upload/status/:contentId
export async function getTranscodeStatus(req: Request, res: Response) {
  try {
    const { contentId } = req.params;
    const content = await Content.findById(contentId);

    if (!content) {
      return sendError(res, 'NOT_FOUND', 'Content not found', 404);
    }

    const isReady = content.status === 'published';
    const streamUrl = content.streaming.hlsUrl || content.rawUrl || null;

    return sendSuccess(res, {
      contentId,
      title: content.title,
      status: content.status,
      streamReady: isReady,
      hlsUrl: streamUrl,
      ...(content.status === 'downloading' && content.torrent ? {
        downloadProgress: content.torrent.downloadProgress,
        downloadSpeed: content.torrent.downloadSpeed,
        fileSize: content.torrent.fileSize,
      } : {}),
      ...(content.status === 'error' && content.torrent ? {
        errorMessage: content.torrent.errorMessage,
      } : {}),
    });
  } catch (error) {
    console.error('getTranscodeStatus error:', error);
    return sendError(res, 'SERVER_ERROR', 'Failed to get status', 500);
  }
}
