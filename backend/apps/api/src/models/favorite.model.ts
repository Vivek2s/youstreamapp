import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IFavorite extends Document {
  profileId: Types.ObjectId;
  contentId: Types.ObjectId;
  addedAt: Date;
}

const favoriteSchema = new Schema<IFavorite>({
  profileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true, index: true },
  contentId: { type: Schema.Types.ObjectId, ref: 'Content', required: true },
  addedAt: { type: Date, default: Date.now },
});

favoriteSchema.index({ profileId: 1, contentId: 1 }, { unique: true });

export const Favorite = mongoose.model<IFavorite>('Favorite', favoriteSchema);
