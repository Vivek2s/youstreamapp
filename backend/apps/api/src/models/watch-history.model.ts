import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IWatchHistory extends Document {
  profileId: Types.ObjectId;
  contentId: Types.ObjectId;
  episodeIndex?: number;
  seasonIndex?: number;
  progressSeconds: number;
  duration: number;
  completed: boolean;
  updatedAt: Date;
}

const watchHistorySchema = new Schema<IWatchHistory>(
  {
    profileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true, index: true },
    contentId: { type: Schema.Types.ObjectId, ref: 'Content', required: true },
    episodeIndex: { type: Number },
    seasonIndex: { type: Number },
    progressSeconds: { type: Number, default: 0 },
    duration: { type: Number, default: 0 },
    completed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

watchHistorySchema.index({ profileId: 1, contentId: 1 }, { unique: true });

export const WatchHistory = mongoose.model<IWatchHistory>('WatchHistory', watchHistorySchema);
