import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IProfile extends Document {
  userId: Types.ObjectId;
  name: string;
  avatar: string;
  parentalPin?: string;
  ratingCeiling: string;
  isKids: boolean;
  createdAt: Date;
}

const profileSchema = new Schema<IProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    avatar: { type: String, default: '' },
    parentalPin: { type: String },
    ratingCeiling: { type: String, default: 'A' },
    isKids: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Profile = mongoose.model<IProfile>('Profile', profileSchema);
