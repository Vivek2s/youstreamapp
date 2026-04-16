import { connectDatabase } from '../../api/src/database/connection';
import { Job } from '../../api/src/models/job.model';
import { claimJob, recoverStaleJobs } from '../../api/src/queues/jobQueue';
import { processTorrentJob, getActiveTorrentCount } from './processor';
import { config } from '../../api/src/config';
import os from 'os';

const WORKER_ID = `torrent-${os.hostname()}-${process.pid}`;
const JOB_TYPE = 'torrent-download' as const;

async function processNextPendingJobs() {
  // Process all pending jobs up to the concurrency limit
  while (getActiveTorrentCount() < config.torrentMaxConcurrent) {
    const job = await claimJob(JOB_TYPE, WORKER_ID);
    if (!job) break;

    console.log(`🔧 Claimed job ${job._id} for content ${job.contentId}`);

    // Process in background (don't await — allows picking up more jobs)
    processTorrentJob(job._id.toString(), job.contentId.toString(), job.data as any)
      .catch((err) => {
        console.error(`❌ Unhandled error processing job ${job._id}:`, err);
      });
  }
}

async function startWorker() {
  console.log(`
╔══════════════════════════════════════════╗
║       YouStream Torrent Worker           ║
║──────────────────────────────────────────║
║  Worker ID:   ${WORKER_ID.substring(0, 24).padEnd(25)}║
║  Max Concurrent: ${String(config.torrentMaxConcurrent).padEnd(22)}║
║  Stall Timeout:  ${(config.torrentStallTimeoutMs >= 3600000 ? `${Math.round(config.torrentStallTimeoutMs / 3600000)}h` : `${Math.round(config.torrentStallTimeoutMs / 60000)}m`).padEnd(22)}║
╚══════════════════════════════════════════╝
  `);

  await connectDatabase();

  // Step 1: Recover stale jobs from crashed workers
  await recoverStaleJobs();

  // Step 2: Process any pending jobs that accumulated while we were down
  await processNextPendingJobs();

  // Step 3: Watch for new jobs — try Change Streams first, fall back to polling
  try {
    startChangeStream();
    console.log(`👀 Watching for new torrent-download jobs via Change Stream...`);
  } catch (err: any) {
    console.warn(`⚠️  Change Streams not available (${err.message}), falling back to polling...`);
    startPolling();
  }
}

function startChangeStream() {
  const pipeline = [
    {
      $match: {
        operationType: 'insert',
        'fullDocument.type': JOB_TYPE,
        'fullDocument.status': 'pending',
      },
    },
  ];

  const changeStream = Job.watch(pipeline, { fullDocument: 'updateLookup' });

  changeStream.on('change', async () => {
    await processNextPendingJobs();
  });

  changeStream.on('error', (err: any) => {
    // If Change Streams aren't supported (standalone MongoDB), fall back to polling
    if (err.code === 40573 || err.codeName === 'InvalidReplicaSetConfig' || err.message?.includes('replica set')) {
      console.warn('⚠️  Change Streams not supported, switching to polling mode...');
      startPolling();
    } else {
      console.error('❌ Change stream error:', err.message);
      setTimeout(startChangeStream, 5000);
    }
  });

  // Also watch for re-queued jobs
  const retryPipeline = [
    {
      $match: {
        operationType: 'update',
        'updateDescription.updatedFields.status': 'pending',
        'fullDocument.type': JOB_TYPE,
      },
    },
  ];

  const retryStream = Job.watch(retryPipeline, { fullDocument: 'updateLookup' });
  retryStream.on('change', async () => {
    await processNextPendingJobs();
  });
  retryStream.on('error', () => {});
}

function startPolling() {
  console.log('🔄 Polling for torrent-download jobs every 5 seconds...');
  setInterval(async () => {
    try {
      await processNextPendingJobs();
    } catch (err) {
      console.error('Polling error:', err);
    }
  }, 5000);
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  process.exit(0);
});

startWorker().catch((err) => {
  console.error('Failed to start torrent worker:', err);
  process.exit(1);
});
