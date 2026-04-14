import { Router } from 'express';
import { getStreamUrl, updateProgress, getProgress } from '../controllers/streaming.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/:contentId/url', getStreamUrl);
router.post('/progress', updateProgress);
router.get('/progress/:profileId/:contentId', getProgress);

export default router;
