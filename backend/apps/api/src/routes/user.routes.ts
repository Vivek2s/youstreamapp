import { Router } from 'express';
import {
  getProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  getWatchHistory,
  getContinueWatching,
  getFavorites,
  addFavorite,
  removeFavorite,
} from '../controllers/user.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// All user routes require auth
router.use(authMiddleware);

// Profiles
router.get('/profiles', getProfiles);
router.post('/profiles', createProfile);
router.put('/profiles/:profileId', updateProfile);
router.delete('/profiles/:profileId', deleteProfile);

// Watch history
router.get('/watch-history/:profileId', getWatchHistory);
router.get('/continue-watching/:profileId', getContinueWatching);

// Favorites
router.get('/favorites/:profileId', getFavorites);
router.post('/favorites', addFavorite);
router.delete('/favorites/:profileId/:contentId', removeFavorite);

export default router;
