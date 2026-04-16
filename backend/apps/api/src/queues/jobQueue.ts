import { Job, JobType, JobStatus, ITorrentDownloadData, ITranscodeData } from '../models/job.model';
import { Types } from 'mongoose';

export async function enqueueJob(
  type: JobType,
  contentId: string,
  data: ITorrentDownloadData | ITranscodeData
) {
  const job = await Job.create({
    type,
    contentId: new Types.ObjectId(contentId),
    data,
    status: 'pending',
  });
  console.log(`📋 Job enqueued: ${type} for content ${contentId} (job ${job._id})`);
  return job;
}

export async function claimJob(type: JobType, workerId: string) {
  const job = await Job.findOneAndUpdate(
    { type, status: 'pending' },
    {
      $set: { status: 'processing', workerId, heartbeat: new Date() },
      $inc: { attempts: 1 },
    },
    { sort: { createdAt: 1 }, new: true }
  );
  return job;
}

export async function updateHeartbeat(jobId: string) {
  await Job.findByIdAndUpdate(jobId, { $set: { heartbeat: new Date() } });
}

export async function completeJob(jobId: string) {
  await Job.findByIdAndUpdate(jobId, {
    $set: { status: 'completed' as JobStatus, heartbeat: new Date() },
  });
}

export async function failJob(jobId: string, error: string) {
  const job = await Job.findById(jobId);
  if (!job) return;

  if (job.attempts < job.maxAttempts) {
    // Re-queue for retry
    await Job.findByIdAndUpdate(jobId, {
      $set: { status: 'pending' as JobStatus, workerId: null, heartbeat: null, error },
    });
    console.log(`🔄 Job ${jobId} re-queued for retry (attempt ${job.attempts}/${job.maxAttempts})`);
  } else {
    // Max attempts reached — mark as failed
    await Job.findByIdAndUpdate(jobId, {
      $set: { status: 'failed' as JobStatus, error },
    });
    console.log(`❌ Job ${jobId} failed after ${job.maxAttempts} attempts: ${error}`);
  }
}

export async function cancelJob(contentId: string) {
  const result = await Job.findOneAndUpdate(
    { contentId: new Types.ObjectId(contentId), status: { $in: ['pending', 'processing'] } },
    { $set: { status: 'cancelled' as JobStatus } },
    { new: true }
  );
  return result;
}

export async function isJobCancelled(jobId: string): Promise<boolean> {
  const job = await Job.findById(jobId, { status: 1 }).lean();
  return job?.status === 'cancelled';
}

export async function recoverStaleJobs(staleThresholdMs = 120000) {
  const result = await Job.updateMany(
    {
      status: 'processing',
      heartbeat: { $lt: new Date(Date.now() - staleThresholdMs) },
    },
    { $set: { status: 'pending' as JobStatus, workerId: null } }
  );
  if (result.modifiedCount > 0) {
    console.log(`🔄 Recovered ${result.modifiedCount} stale job(s)`);
  }
  return result.modifiedCount;
}
