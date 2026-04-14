import { Request, Response } from 'express';
import { Content } from '../models/content.model';
import { sendSuccess, sendError } from '../utils/response';

// GET /api/v1/search?q=...&type=...&genre=...&language=...
export async function search(req: Request, res: Response) {
  try {
    const { q, type, genre, language, page = '1', limit = '20' } = req.query;

    if (!q || (q as string).trim().length === 0) {
      return sendError(res, 'VALIDATION', 'Search query is required');
    }

    const filter: Record<string, unknown> = {
      status: 'published',
      $text: { $search: q as string },
    };

    if (type) filter.type = type;
    if (genre) filter.genres = genre;
    if (language) filter.contentLang = language;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const [results, total] = await Promise.all([
      Content.find(filter, { score: { $meta: 'textScore' } })
        .populate('genres', 'name slug')
        .sort({ score: { $meta: 'textScore' } })
        .skip(skip)
        .limit(limitNum),
      Content.countDocuments(filter),
    ]);

    return sendSuccess(res, {
      results,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  } catch (error) {
    console.error('search error:', error);
    return sendError(res, 'SERVER_ERROR', 'Search failed', 500);
  }
}

// GET /api/v1/search/autocomplete?q=...
export async function autocomplete(req: Request, res: Response) {
  try {
    const { q } = req.query;

    if (!q || (q as string).trim().length === 0) {
      return sendSuccess(res, []);
    }

    const results = await Content.find(
      {
        status: 'published',
        title: { $regex: q as string, $options: 'i' },
      },
      { title: 1, posterUrl: 1, type: 1 }
    ).limit(5);

    return sendSuccess(res, results);
  } catch (error) {
    console.error('autocomplete error:', error);
    return sendError(res, 'SERVER_ERROR', 'Autocomplete failed', 500);
  }
}
