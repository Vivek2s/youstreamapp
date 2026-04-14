import { Request, Response } from 'express';
import { execSync, exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { Content } from '../models/content.model';
import { Genre } from '../models/genre.model';
import { Category } from '../models/category.model';
import { sendSuccess, sendError } from '../utils/response';
import { config } from '../config';
import { uploadDirectoryToS3, uploadFileToS3, deleteLocalDirectory } from '../utils/s3';

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

      // Check rotation metadata — phone videos are often 1080x1920 stored as 1920x1080 + rotation=90
      const rotation = parseInt(videoStream.tags?.rotate || '0', 10);
      if (rotation === 90 || rotation === 270) {
        [width, height] = [height, width];
      }
      // Also check side_data for display rotation
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

    // Create content document (draft until processing is done)
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

    // Move uploaded file to uploads dir
    const uploadDir = path.join(UPLOADS_DIR, contentId);
    fs.mkdirSync(uploadDir, { recursive: true });
    const inputPath = path.join(uploadDir, `raw${ext}`);
    fs.renameSync(uploadedFile.path, inputPath);

    console.log(`📁 Saved to: ${inputPath}`);

    // Get video info (dimensions, duration, orientation)
    const videoInfo = getVideoInfo(inputPath);

    // Always upload original to S3 raw bucket
    if (config.storageMode === 's3') {
      const rawS3Key = `${contentId}/original${ext}`;
      await uploadFileToS3(inputPath, config.awsS3RawBucket, rawS3Key, getVideoContentType(ext));

      // Also upload original to streaming bucket so it's playable via CloudFront
      await uploadFileToS3(inputPath, config.awsS3StreamingBucket, rawS3Key, getVideoContentType(ext));
      const rawUrl = `${config.cloudfrontDomain}/${contentId}/original${ext}`;

      if (transcode) {
        // Save rawUrl now, start transcoding in background
        await Content.findByIdAndUpdate(contentId, {
          $set: { rawUrl, duration: Math.round(videoInfo.duration / 60), isPortrait: videoInfo.isPortrait },
        });
        transcodeToHLS(contentId, inputPath, videoInfo);

        return sendSuccess(res, {
          contentId,
          message: 'Upload received, transcoding started. Original saved.',
          status: 'transcoding',
        }, 'Video uploaded', 201);
      } else {
        // No transcode — publish immediately with raw video URL
        await Content.findByIdAndUpdate(contentId, {
          $set: {
            status: 'published',
            rawUrl,
            duration: Math.round(videoInfo.duration / 60),
            isPortrait: videoInfo.isPortrait,
            streaming: { hlsUrl: '', subtitles: [] },
          },
        });

        // Clean up local file
        deleteLocalDirectory(uploadDir);

        console.log(`✅ Published (no transcode): ${contentId}`);
        console.log(`   Raw URL: ${rawUrl}`);

        return sendSuccess(res, {
          contentId,
          message: 'Upload complete. Video published.',
          status: 'published',
        }, 'Video uploaded', 201);
      }
    } else {
      // Local mode
      const rawUrl = `/uploads/${contentId}/raw${ext}`;

      if (transcode) {
        await Content.findByIdAndUpdate(contentId, {
          $set: { rawUrl, duration: Math.round(videoInfo.duration / 60), isPortrait: videoInfo.isPortrait },
        });
        transcodeToHLS(contentId, inputPath, videoInfo);

        return sendSuccess(res, {
          contentId,
          message: 'Upload received, transcoding started',
          status: 'transcoding',
        }, 'Video uploaded', 201);
      } else {
        await Content.findByIdAndUpdate(contentId, {
          $set: {
            status: 'published',
            rawUrl,
            duration: Math.round(videoInfo.duration / 60),
            isPortrait: videoInfo.isPortrait,
            streaming: { hlsUrl: '', subtitles: [] },
          },
        });

        console.log(`✅ Published (no transcode): ${contentId}`);
        return sendSuccess(res, {
          contentId,
          message: 'Upload complete. Video published.',
          status: 'published',
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

// Background transcode function
export async function transcodeToHLS(contentId: string, inputPath: string, videoInfo: VideoInfo) {
  const outputDir = path.join(STREAMS_DIR, contentId);
  fs.mkdirSync(outputDir, { recursive: true });

  // Define quality tiers based on orientation
  // Portrait: short side is width, long side is height
  // Landscape: short side is height, long side is width
  const tiers = videoInfo.isPortrait
    ? [
        { name: '480p', w: 480, h: 854, bitrate: '1500k' },
        { name: '720p', w: 720, h: 1280, bitrate: '4000k' },
        { name: '1080p', w: 1080, h: 1920, bitrate: '8000k' },
      ]
    : [
        { name: '480p', w: 854, h: 480, bitrate: '1500k' },
        { name: '720p', w: 1280, h: 720, bitrate: '4000k' },
        { name: '1080p', w: 1920, h: 1080, bitrate: '8000k' },
      ];

  // Only include tiers that don't upscale the source
  const srcShort = Math.min(videoInfo.width, videoInfo.height);
  const applicableTiers = tiers.filter((t) => Math.min(t.w, t.h) <= srcShort);
  // Always have at least one tier
  if (applicableTiers.length === 0) applicableTiers.push(tiers[0]);

  console.log(`\n🔄 Transcoding ${contentId}: ${videoInfo.width}x${videoInfo.height} ${videoInfo.isPortrait ? 'portrait' : 'landscape'}`);
  console.log(`   Tiers: ${applicableTiers.map((t) => t.name).join(', ')}`);

  // Create output dirs
  applicableTiers.forEach((_, i) => fs.mkdirSync(path.join(outputDir, String(i)), { recursive: true }));

  // Build FFmpeg command with per-tier scale filters
  const maps = applicableTiers.map((tier, i) =>
    `-map 0:v:0 -map 0:a:0? -filter:v:${i} "scale=${tier.w}:${tier.h}:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2" -c:v:${i} libx264 -b:v:${i} ${tier.bitrate} -maxrate:v:${i} ${tier.bitrate} -bufsize:v:${i} ${parseInt(tier.bitrate) * 2}k -preset slow -profile:v:${i} high -level:v:${i} 4.1`
  ).join(' ');

  const varStreamMap = applicableTiers.map((_, i) => `v:${i},a:${i}`).join(' ');

  const ffmpegCmd = [
    `ffmpeg -i "${inputPath}" -y`,
    maps,
    `-c:a aac -b:a 192k`,
    `-f hls -hls_time 4 -hls_playlist_type vod`,
    `-hls_segment_filename "${outputDir}/%v/segment_%03d.ts"`,
    `-master_pl_name master.m3u8`,
    `-var_stream_map "${varStreamMap}"`,
    `"${outputDir}/%v/stream.m3u8"`,
  ].join(' ');

  exec(ffmpegCmd, async (error) => {
    if (error) {
      console.error(`❌ Transcode failed for ${contentId}:`, error.message);
      // Fallback: single quality preserving orientation
      const fallbackTier = applicableTiers[0];
      const simpleFfmpeg = [
        `ffmpeg -i "${inputPath}" -y`,
        `-vf "scale=${fallbackTier.w}:${fallbackTier.h}:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2"`,
        `-c:v libx264 -b:v ${fallbackTier.bitrate} -preset fast -profile:v main -level:v 4.0`,
        `-c:a aac -b:a 192k`,
        `-f hls -hls_time 4 -hls_playlist_type vod`,
        `-hls_segment_filename "${outputDir}/segment_%03d.ts"`,
        `"${outputDir}/stream.m3u8"`,
      ].join(' ');

      console.log('🔄 Retrying with single quality...');
      exec(simpleFfmpeg, async (err2) => {
        if (err2) {
          console.error('❌ Simple transcode also failed:', err2.message);
          await Content.findByIdAndUpdate(contentId, { $set: { status: 'published' } });
          return;
        }

        const masterContent = `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-STREAM-INF:BANDWIDTH=${parseInt(fallbackTier.bitrate) * 1000 + 128000},RESOLUTION=${fallbackTier.w}x${fallbackTier.h}\nstream.m3u8`;
        fs.writeFileSync(path.join(outputDir, 'master.m3u8'), masterContent);

        if (config.storageMode === 's3') {
          await uploadDirectoryToS3(outputDir, config.awsS3StreamingBucket, contentId);
          deleteLocalDirectory(outputDir);
          deleteLocalDirectory(path.join(UPLOADS_DIR, contentId));
        }
        await finalizeContent(contentId, videoInfo.duration);
      });
      return;
    }

    // Rename directories from 0,1,2 to meaningful names
    applicableTiers.forEach((tier, i) => {
      const src = path.join(outputDir, String(i));
      const dst = path.join(outputDir, tier.name);
      if (fs.existsSync(src)) fs.renameSync(src, dst);
    });

    // Fix master playlist paths (rename 0/ 1/ 2/ to 480p/ 720p/ 1080p/)
    const masterPath = path.join(outputDir, 'master.m3u8');
    if (fs.existsSync(masterPath)) {
      let master = fs.readFileSync(masterPath, 'utf-8');
      applicableTiers.forEach((tier, i) => {
        master = master.replace(new RegExp(`${i}/stream\\.m3u8`, 'g'), `${tier.name}/stream.m3u8`);
      });
      fs.writeFileSync(masterPath, master);
    }

    if (config.storageMode === 's3') {
      await uploadDirectoryToS3(outputDir, config.awsS3StreamingBucket, contentId);
      deleteLocalDirectory(outputDir);
      deleteLocalDirectory(path.join(UPLOADS_DIR, contentId));
    }
    await finalizeContent(contentId, videoInfo.duration);
  });
}

export async function finalizeContent(contentId: string, duration: number) {
  try {
    const hlsUrl = config.storageMode === 's3'
      ? `${config.cloudfrontDomain}/${contentId}/master.m3u8`
      : `/streams/${contentId}/master.m3u8`;

    await Content.findByIdAndUpdate(contentId, {
      $set: {
        status: 'published',
        duration: Math.round(duration / 60),
        'streaming.hlsUrl': hlsUrl,
      },
    });
    console.log(`✅ Transcode complete: ${contentId}`);
    console.log(`   HLS URL: ${hlsUrl}`);
  } catch (err) {
    console.error('Failed to update content:', err);
  }
}
