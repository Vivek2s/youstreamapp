import { Router } from 'express';
import {
  getContents,
  getContentById,
  createContent,
  updateContent,
  deleteContent,
  getHomeRows,
  getGenres,
  createGenre,
  getCategories,
  createCategory,
} from '../controllers/content.controller';
import { authMiddleware, adminMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Public routes
router.get('/home/rows', getHomeRows);
router.get('/genres', getGenres);
router.get('/categories', getCategories);
router.get('/', getContents);
router.get('/:id', getContentById);

// Admin routes
router.post('/', authMiddleware, adminMiddleware, createContent);
router.put('/:id', authMiddleware, adminMiddleware, updateContent);
router.delete('/:id', authMiddleware, adminMiddleware, deleteContent);
router.post('/genres', authMiddleware, adminMiddleware, createGenre);
router.post('/categories', authMiddleware, adminMiddleware, createCategory);

export default router;
