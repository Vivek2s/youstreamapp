import { connectDatabase } from '../../api/src/database/connection';
import { Job } from '../../api/src/models/job.model';
import { claimJob, recoverStaleJobs } from '../../api/src/queues/jobQueue';
import { processTranscodeJob, getActiveTranscodeCount } from './processor';
import os from 'os';

const WORKER_ID = `transcoder-${os.hostname()}-${process.pid}`;
const JOB_TYPE = 'transcode' as const;
const MAX_CONCURRENT = parseInt(process.env.TRANSCODE_MAX_CONCURRENT || '1', 10);

async function processNextPendingJobs() {
  while (getActiveTranscodeCount() < MAX_CONCURRENT) {
    const job = await claimJob(JOB_TYPE, WORKER_ID);
    if (!job) break;

    console.log(`🔧 Claimed transcode job ${job._id} for content ${job.contentId}`);

    // Process in background (don't await — allows picking up more jobs if MAX_CONCURRENT > 1)
    processTranscodeJob(job._id.toString(), job.contentId.toString(), job.data as any)
      .catch((err) => {
        console.error(`❌ Unhandled error processing job ${job._id}:`, err);
      });
  }
}

async function startWorker() {
  console.log(`
╔══════════════════════════════════════════╗
║       YouStream Transcoder Worker        ║
║──────────────────────────────────────────║
║  Worker ID:      ${WORKER_ID.substring(0, 21).padEnd(22)}║
║  Max Concurrent: ${String(MAX_CONCURRENT).padEnd(22)}║
╚══════════════════════════════════════════╝
  `);

  await connectDatabase();

  // Step 1: Recover stale jobs from crashed workers
  await recoverStaleJobs();

  // Step 2: Process any pending jobs that accumulated
  await processNextPendingJobs();

  // Step 3: Watch for new jobs — try Change Streams first, fall back to polling
  try {
    startChangeStream();
    console.log(`👀 Watching for new transcode jobs via Change Stream...`);
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
    if (err.code === 40573 || err.codeName === 'InvalidReplicaSetConfig' || err.message?.includes('replica set')) {
      console.warn('⚠️  Change Streams not supported, switching to polling mode...');
      startPolling();
    } else {
      console.error('❌ Change stream error:', err.message);
      setTimeout(startChangeStream, 5000);
    }
  });

  // Watch for re-queued jobs
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
  console.log('🔄 Polling for transcode jobs every 5 seconds...');
  setInterval(async () => {
    try {
      await processNextPendingJobs();
    } catch (err) {
      console.error('Polling error:', err);
    }
  }, 5000);
}

process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  process.exit(0);
});

startWorker().catch((err) => {
  console.error('Failed to start transcoder worker:', err);
  process.exit(1);
});
