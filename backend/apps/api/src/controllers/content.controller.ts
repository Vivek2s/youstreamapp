import { Request, Response } from 'express';
import { Content } from '../models/content.model';
import { Genre } from '../models/genre.model';
import { Category } from '../models/category.model';
import { sendSuccess, sendError } from '../utils/response';

// GET /api/v1/content
export async function getContents(req: Request, res: Response) {
  try {
    const { type, genre, category, language, page = '1', limit = '20' } = req.query;

    const filter: Record<string, unknown> = { status: 'published' };
    if (type) filter.type = type;
    if (genre) filter.genres = genre;
    if (category) filter.categories = category;
    if (language) filter.contentLang = language;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const [contents, total] = await Promise.all([
      Content.find(filter)
        .populate('genres', 'name slug')
        .populate('categories', 'name slug')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Content.countDocuments(filter),
    ]);

    return sendSuccess(res, {
      contents,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('getContents error:', error);
    return sendError(res, 'SERVER_ERROR', 'Failed to get contents', 500);
  }
}

// GET /api/v1/content/:id
export async function getContentById(req: Request, res: Response) {
  try {
    const content = await Content.findById(req.params.id)
      .populate('genres', 'name slug')
      .populate('categories', 'name slug');

    if (!content) {
      return sendError(res, 'NOT_FOUND', 'Content not found', 404);
    }

    return sendSuccess(res, content);
  } catch (error) {
    console.error('getContentById error:', error);
    return sendError(res, 'SERVER_ERROR', 'Failed to get content', 500);
  }
}

// POST /api/v1/content  (admin)
export async function createContent(req: Request, res: Response) {
  try {
    const content = await Content.create(req.body);
    return sendSuccess(res, content, 'Content created', 201);
  } catch (error) {
    console.error('createContent error:', error);
    return sendError(res, 'SERVER_ERROR', 'Failed to create content', 500);
  }
}

// PUT /api/v1/content/:id  (admin)
export async function updateContent(req: Request, res: Response) {
  try {
    const content = await Content.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );

    if (!content) {
      return sendError(res, 'NOT_FOUND', 'Content not found', 404);
    }

    return sendSuccess(res, content, 'Content updated');
  } catch (error) {
    console.error('updateContent error:', error);
    return sendError(res, 'SERVER_ERROR', 'Failed to update content', 500);
  }
}

// DELETE /api/v1/content/:id  (admin)
export async function deleteContent(req: Request, res: Response) {
  try {
    const content = await Content.findByIdAndDelete(req.params.id);
    if (!content) {
      return sendError(res, 'NOT_FOUND', 'Content not found', 404);
    }
    return sendSuccess(res, null, 'Content deleted');
  } catch (error) {
    console.error('deleteContent error:', error);
    return sendError(res, 'SERVER_ERROR', 'Failed to delete content', 500);
  }
}

// GET /api/v1/content/home/rows  — returns categorized content rows for home screen
export async function getHomeRows(req: Request, res: Response) {
  try {
    const categories = await Category.find().sort({ order: 1 });

    const rows = await Promise.all(
      categories.map(async (cat) => {
        const contents = await Content.find({
          categories: cat._id,
          status: 'published',
        })
          .select('title posterUrl backdropUrl thumbnailUrl type duration rating releaseYear')
          .limit(15);

        return { category: { id: cat._id, name: cat.name, slug: cat.slug }, contents };
      })
    );

    // Also add "All Content" row if no categories have content yet
    const allContent = await Content.find({ status: 'published' })
      .select('title posterUrl backdropUrl thumbnailUrl type duration rating releaseYear genres')
      .populate('genres', 'name slug')
      .sort({ createdAt: -1 })
      .limit(20);

    return sendSuccess(res, {
      hero: allContent[0] || null,
      rows,
      allContent,
    });
  } catch (error) {
    console.error('getHomeRows error:', error);
    return sendError(res, 'SERVER_ERROR', 'Failed to get home rows', 500);
  }
}

// --- Genres ---

// GET /api/v1/genres
export async function getGenres(_req: Request, res: Response) {
  try {
    const genres = await Genre.find().sort({ name: 1 });
    return sendSuccess(res, genres);
  } catch (error) {
    console.error('getGenres error:', error);
    return sendError(res, 'SERVER_ERROR', 'Failed to get genres', 500);
  }
}

// POST /api/v1/genres  (admin)
export async function createGenre(req: Request, res: Response) {
  try {
    const { name } = req.body;
    if (!name) return sendError(res, 'VALIDATION', 'Genre name required');

    const slug = name.toLowerCase().replace(/\s+/g, '-');
    const genre = await Genre.create({ name, slug });
    return sendSuccess(res, genre, 'Genre created', 201);
  } catch (error) {
    console.error('createGenre error:', error);
    return sendError(res, 'SERVER_ERROR', 'Failed to create genre', 500);
  }
}

// --- Categories ---

// GET /api/v1/categories
export async function getCategories(_req: Request, res: Response) {
  try {
    const categories = await Category.find().sort({ order: 1 });
    return sendSuccess(res, categories);
  } catch (error) {
    console.error('getCategories error:', error);
    return sendError(res, 'SERVER_ERROR', 'Failed to get categories', 500);
  }
}

// POST /api/v1/categories  (admin)
export async function createCategory(req: Request, res: Response) {
  try {
    const { name, order } = req.body;
    if (!name) return sendError(res, 'VALIDATION', 'Category name required');

    const slug = name.toLowerCase().replace(/\s+/g, '-');
    const category = await Category.create({ name, slug, order: order || 0 });
    return sendSuccess(res, category, 'Category created', 201);
  } catch (error) {
    console.error('createCategory error:', error);
    return sendError(res, 'SERVER_ERROR', 'Failed to create category', 500);
  }
}
