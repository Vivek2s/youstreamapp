import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import QRCode from 'qrcode';
import { User } from '../models/user.model';
import { OTP } from '../models/otp.model';
import { Profile } from '../models/profile.model';
import { QRSession } from '../models/qr-session.model';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { sendSuccess, sendError } from '../utils/response';
import { config } from '../config';
import { AuthRequest } from '../middleware/auth.middleware';

// POST /api/v1/auth/send-otp
export async function sendOTP(req: Request, res: Response) {
  try {
    const { phone } = req.body;

    if (!phone) {
      return sendError(res, 'VALIDATION', 'Phone number is required');
    }

    // Delete any existing OTPs for this phone
    await OTP.deleteMany({ phone });

    const code = config.otpMode === 'mock' ? config.otpMockCode : Math.floor(100000 + Math.random() * 900000).toString();

    const expiresAt = new Date(Date.now() + config.otpExpiryMinutes * 60 * 1000);

    await OTP.create({ phone, code, expiresAt });

    // In mock mode, return the code in response for easy testing
    const data = config.otpMode === 'mock' ? { mockOtp: code } : {};

    return sendSuccess(res, data, 'OTP sent successfully');
  } catch (error) {
    console.error('sendOTP error:', error);
    return sendError(res, 'SERVER_ERROR', 'Failed to send OTP', 500);
  }
}

// POST /api/v1/auth/verify-otp
export async function verifyOTP(req: Request, res: Response) {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return sendError(res, 'VALIDATION', 'Phone and OTP are required');
    }

    const otpRecord = await OTP.findOne({
      phone,
      code: otp,
      expiresAt: { $gt: new Date() },
      verified: false,
    });

    if (!otpRecord) {
      return sendError(res, 'INVALID_OTP', 'Invalid or expired OTP', 401);
    }

    // Mark OTP as verified
    otpRecord.verified = true;
    await otpRecord.save();

    // Find or create user
    let user = await User.findOne({ phone });
    let isNewUser = false;

    if (!user) {
      user = await User.create({ phone, name: '', role: 'user' });
      isNewUser = true;

      // Create default profile for new user
      await Profile.create({
        userId: user._id,
        name: 'Default',
        avatar: '',
        ratingCeiling: 'A',
        isKids: false,
      });
    }

    const accessToken = generateAccessToken({ userId: user._id.toString(), role: user.role });
    const refreshToken = generateRefreshToken({ userId: user._id.toString(), tokenId: uuidv4() });

    return sendSuccess(res, {
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        phone: user.phone,
        name: user.name,
        role: user.role,
        subscriptionStatus: user.subscriptionStatus,
      },
      isNewUser,
    }, 'Login successful');
  } catch (error) {
    console.error('verifyOTP error:', error);
    return sendError(res, 'SERVER_ERROR', 'Verification failed', 500);
  }
}

// POST /api/v1/auth/refresh-token
export async function refreshToken(req: Request, res: Response) {
  try {
    const { refreshToken: token } = req.body;

    if (!token) {
      return sendError(res, 'VALIDATION', 'Refresh token is required');
    }

    const payload = verifyRefreshToken(token);
    const user = await User.findById(payload.userId);

    if (!user) {
      return sendError(res, 'UNAUTHORIZED', 'User not found', 401);
    }

    const newAccessToken = generateAccessToken({ userId: user._id.toString(), role: user.role });
    const newRefreshToken = generateRefreshToken({ userId: user._id.toString(), tokenId: uuidv4() });

    return sendSuccess(res, {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    }, 'Token refreshed');
  } catch {
    return sendError(res, 'UNAUTHORIZED', 'Invalid refresh token', 401);
  }
}

// GET /api/v1/auth/qr-generate
export async function generateQR(_req: Request, res: Response) {
  try {
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min expiry

    await QRSession.create({ sessionId, status: 'pending', expiresAt });

    const qrData = JSON.stringify({ type: 'youstream-auth', sessionId });
    const qrImage = await QRCode.toDataURL(qrData);

    return sendSuccess(res, { sessionId, qrData, qrImage }, 'QR code generated');
  } catch (error) {
    console.error('generateQR error:', error);
    return sendError(res, 'SERVER_ERROR', 'Failed to generate QR', 500);
  }
}

// POST /api/v1/auth/qr-authorize  (called by mobile app, needs auth)
export async function authorizeQR(req: AuthRequest, res: Response) {
  try {
    const { sessionId } = req.body;

    if (!sessionId || !req.userId) {
      return sendError(res, 'VALIDATION', 'Session ID required');
    }

    const session = await QRSession.findOne({ sessionId, status: 'pending' });

    if (!session) {
      return sendError(res, 'NOT_FOUND', 'QR session not found or expired');
    }

    if (session.expiresAt < new Date()) {
      session.status = 'expired';
      await session.save();
      return sendError(res, 'EXPIRED', 'QR session expired');
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return sendError(res, 'NOT_FOUND', 'User not found');
    }

    // Generate tokens for the TV device
    const accessToken = generateAccessToken({ userId: user._id.toString(), role: user.role });
    const refreshToken = generateRefreshToken({ userId: user._id.toString(), tokenId: uuidv4() });

    session.status = 'authorized';
    session.userId = user._id;
    session.accessToken = accessToken;
    session.refreshToken = refreshToken;
    await session.save();

    return sendSuccess(res, null, 'QR login authorized');
  } catch (error) {
    console.error('authorizeQR error:', error);
    return sendError(res, 'SERVER_ERROR', 'Authorization failed', 500);
  }
}

// GET /api/v1/auth/qr-status/:sessionId  (polled by TV)
export async function qrStatus(req: Request, res: Response) {
  try {
    const { sessionId } = req.params;

    const session = await QRSession.findOne({ sessionId });

    if (!session) {
      return sendError(res, 'NOT_FOUND', 'Session not found');
    }

    if (session.status === 'authorized' && session.accessToken) {
      const user = await User.findById(session.userId);
      return sendSuccess(res, {
        status: 'authorized',
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        user: user ? {
          id: user._id,
          phone: user.phone,
          name: user.name,
          role: user.role,
        } : null,
      });
    }

    return sendSuccess(res, { status: session.status });
  } catch (error) {
    console.error('qrStatus error:', error);
    return sendError(res, 'SERVER_ERROR', 'Failed to check status', 500);
  }
}

// GET /api/v1/auth/me  (get current user)
export async function getMe(req: AuthRequest, res: Response) {
  try {
    const user = await User.findById(req.userId).select('-__v');
    if (!user) {
      return sendError(res, 'NOT_FOUND', 'User not found', 404);
    }
    return sendSuccess(res, user);
  } catch (error) {
    console.error('getMe error:', error);
    return sendError(res, 'SERVER_ERROR', 'Failed to get user', 500);
  }
}
