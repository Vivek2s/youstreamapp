import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import routes from './routes';
import { errorMiddleware, notFoundMiddleware } from './middleware/error.middleware';
import { config } from './config';

const app = express();

// Security — allow cross-origin for HLS streaming
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors());

// Rate limiting — exclude streaming paths
app.use(
  '/api/',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many requests' } },
  })
);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve HLS streams as static files (local dev only — in S3 mode, CloudFront handles this)
if (config.storageMode !== 's3') {
  const STREAMS_DIR = path.join(config.storageRoot, 'streams');
  app.use('/streams', express.static(STREAMS_DIR, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.m3u8')) {
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      } else if (filePath.endsWith('.ts')) {
        res.setHeader('Content-Type', 'video/mp2t');
      }
      res.setHeader('Access-Control-Allow-Origin', '*');
    },
  }));
}

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/v1', routes);

// Error handling
app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
