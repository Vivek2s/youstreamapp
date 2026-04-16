import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ITorrentDownloadData {
  torrentSource: string;         // magnet URI or path to .torrent file
  selectedIndices: number[];     // which file indices to download
  transcode: boolean;
  isSeries: boolean;
}

export interface ITranscodeData {
  inputPath: string;             // path to raw video on shared volume
  videoInfo: {
    duration: number;
    width: number;
    height: number;
    isPortrait: boolean;
  };
  isEpisode: boolean;
  episodeId?: string;            // e.g. "contentId_ep0"
  episodeIndex?: number;
}

export type JobType = 'torrent-download' | 'transcode';
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface IJob extends Document {
  type: JobType;
  status: JobStatus;
  contentId: Types.ObjectId;
  data: ITorrentDownloadData | ITranscodeData;
  workerId: string | null;
  heartbeat: Date | null;
  attempts: number;
  maxAttempts: number;
  error: string;
  createdAt: Date;
  updatedAt: Date;
}

const jobSchema = new Schema<IJob>(
  {
    type: { type: String, enum: ['torrent-download', 'transcode'], required: true },
    status: { type: String, enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'], default: 'pending' },
    contentId: { type: Schema.Types.ObjectId, ref: 'Content', required: true },
    data: { type: Schema.Types.Mixed, required: true },
    workerId: { type: String, default: null },
    heartbeat: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    error: { type: String, default: '' },
  },
  { timestamps: true }
);

// Index for efficient job claiming (type + status + FIFO order)
jobSchema.index({ type: 1, status: 1, createdAt: 1 });
// Index for finding jobs by contentId (cancel, status check)
jobSchema.index({ contentId: 1, status: 1 });

export const Job = mongoose.model<IJob>('Job', jobSchema);
