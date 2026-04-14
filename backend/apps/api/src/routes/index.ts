import { Router } from 'express';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import contentRoutes from './content.routes';
import streamingRoutes from './streaming.routes';
import searchRoutes from './search.routes';
import uploadRoutes from './upload.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/content', contentRoutes);
router.use('/streaming', streamingRoutes);
router.use('/search', searchRoutes);
router.use('/upload', uploadRoutes);

export default router;
