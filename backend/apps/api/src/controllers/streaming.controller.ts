import { Request, Response } from 'express';
import { Content } from '../models/content.model';
import { WatchHistory } from '../models/watch-history.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { sendSuccess, sendError } from '../utils/response';
import { config } from '../config';

// GET /api/v1/streaming/:contentId/url
export async function getStreamUrl(req: AuthRequest, res: Response) {
  try {
    const { contentId } = req.params;

    const content = await Content.findById(contentId);
    if (!content) {
      return sendError(res, 'NOT_FOUND', 'Content not found', 404);
    }

    // Determine the best available stream URL:
    // 1. HLS URL (transcoded) — best quality, adaptive bitrate
    // 2. Raw URL (original file) — direct .mp4/.mkv playback
    let streamUrl = '';
    let streamType: 'hls' | 'raw' = 'hls';

    if (content.streaming.hlsUrl) {
      const hlsPath = content.streaming.hlsUrl;
      streamUrl = hlsPath.startsWith('http') ? hlsPath : `http://127.0.0.1:${config.port}${hlsPath}`;
      streamType = 'hls';
    } else if (content.rawUrl) {
      const rawPath = content.rawUrl;
      streamUrl = rawPath.startsWith('http') ? rawPath : `http://127.0.0.1:${config.port}${rawPath}`;
      streamType = 'raw';
    }

    if (!streamUrl) {
      return sendError(res, 'NOT_FOUND', 'No stream available for this content', 404);
    }

    // Increment view count
    await Content.findByIdAndUpdate(contentId, { $inc: { viewCount: 1 } });

    return sendSuccess(res, {
      hlsUrl: streamUrl,
      streamType,
      subtitles: content.streaming.subtitles,
      duration: content.duration,
      isPortrait: content.isPortrait || false,
    });
  } catch (error) {
    console.error('getStreamUrl error:', error);
    return sendError(res, 'SERVER_ERROR', 'Failed to get stream URL', 500);
  }
}

// POST /api/v1/streaming/progress
export async function updateProgress(req: AuthRequest, res: Response) {
  try {
    const { profileId, contentId, progressSeconds, duration, seasonIndex, episodeIndex } = req.body;

    if (!profileId || !contentId || progressSeconds === undefined) {
      return sendError(res, 'VALIDATION', 'profileId, contentId, and progressSeconds required');
    }

    const completed = duration ? progressSeconds >= duration * 0.9 : false;

    const history = await WatchHistory.findOneAndUpdate(
      { profileId, contentId },
      {
        $set: {
          progressSeconds,
          duration: duration || 0,
          completed,
          seasonIndex,
          episodeIndex,
        },
      },
      { upsert: true, new: true }
    );

    return sendSuccess(res, history, 'Progress updated');
  } catch (error) {
    console.error('updateProgress error:', error);
    return sendError(res, 'SERVER_ERROR', 'Failed to update progress', 500);
  }
}

// GET /api/v1/streaming/progress/:profileId/:contentId
export async function getProgress(req: Request, res: Response) {
  try {
    const { profileId, contentId } = req.params;

    const history = await WatchHistory.findOne({ profileId, contentId });

    return sendSuccess(res, history || { progressSeconds: 0, completed: false });
  } catch (error) {
    console.error('getProgress error:', error);
    return sendError(res, 'SERVER_ERROR', 'Failed to get progress', 500);
  }
}
