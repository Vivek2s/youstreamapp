import app from './app';
import { connectDatabase } from './database/connection';
import { config } from './config';
import { Content } from './models/content.model';

async function bootstrap() {
  // Connect to MongoDB
  await connectDatabase();

  // Clean up any torrent downloads interrupted by previous restart
  const interrupted = await Content.updateMany(
    { status: 'downloading' },
    { $set: { status: 'error', 'torrent.errorMessage': 'Download interrupted by server restart' } }
  );
  if (interrupted.modifiedCount > 0) {
    console.log(`⚠️  Marked ${interrupted.modifiedCount} interrupted torrent download(s) as error`);
  }

  // Start server
  app.listen(config.port, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════╗
║       YouStream API Server               ║
║──────────────────────────────────────────║
║  Environment: ${config.nodeEnv.padEnd(25)}║
║  Port:        ${String(config.port).padEnd(25)}║
║  MongoDB:     ${config.mongoUri.length > 25 ? config.mongoUri.substring(0, 22) + '...' : config.mongoUri.padEnd(25)}║
║  OTP Mode:    ${config.otpMode.padEnd(25)}║
╚══════════════════════════════════════════╝
    `);
    console.log('API endpoints:');
    console.log('  POST /api/v1/auth/send-otp');
    console.log('  POST /api/v1/auth/verify-otp');
    console.log('  GET  /api/v1/auth/qr-generate');
    console.log('  GET  /api/v1/content/home/rows');
    console.log('  GET  /api/v1/content');
    console.log('  GET  /api/v1/search?q=...');
    console.log('  GET  /health');
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
