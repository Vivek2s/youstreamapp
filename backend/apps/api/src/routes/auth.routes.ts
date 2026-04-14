import { Router } from 'express';
import {
  sendOTP,
  verifyOTP,
  refreshToken,
  generateQR,
  authorizeQR,
  qrStatus,
  getMe,
} from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.post('/send-otp', sendOTP);
router.post('/verify-otp', verifyOTP);
router.post('/refresh-token', refreshToken);

// QR code login (for TV)
router.get('/qr-generate', generateQR);
router.post('/qr-authorize', authMiddleware, authorizeQR);
router.get('/qr-status/:sessionId', qrStatus);

// Current user
router.get('/me', authMiddleware, getMe);

export default router;
