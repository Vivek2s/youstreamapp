import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),

  // Storage
  storageMode: (process.env.STORAGE_MODE || 'local') as 'local' | 's3',
  storageRoot: process.env.STORAGE_ROOT || path.resolve(__dirname, '../../../../storage'),

  // MongoDB
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/youstream',

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'youstream-dev-secret',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'youstream-dev-refresh-secret',
  jwtAccessExpirySeconds: parseInt(process.env.JWT_ACCESS_EXPIRY_SECONDS || '3600', 10),    // 1 hour
  jwtRefreshExpirySeconds: parseInt(process.env.JWT_REFRESH_EXPIRY_SECONDS || '2592000', 10), // 30 days

  // OTP
  otpMode: process.env.OTP_MODE || 'mock',
  otpMockCode: process.env.OTP_MOCK_CODE || '006699',
  otpExpiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES || '5', 10),

  // AWS
  awsRegion: process.env.AWS_REGION || 'ap-south-1',
  awsS3RawBucket: process.env.AWS_S3_RAW_BUCKET || 'ott-raw',
  awsS3StreamingBucket: process.env.AWS_S3_STREAMING_BUCKET || 'ott-streaming',
  cloudfrontDomain: process.env.CLOUDFRONT_DOMAIN || 'https://cdn.yourdomain.com',

  // Torrent
  torrentMaxConcurrent: parseInt(process.env.TORRENT_MAX_CONCURRENT || '3', 10),
  torrentStallTimeoutMs: parseInt(process.env.TORRENT_STALL_TIMEOUT_MS || '86400000', 10), // 24 hours
};
