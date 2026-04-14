import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IDevice extends Document {
  userId: Types.ObjectId;
  deviceId: string;
  deviceType: 'mobile' | 'tv' | 'web';
  deviceName: string;
  lastActiveAt: Date;
  createdAt: Date;
}

const deviceSchema = new Schema<IDevice>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    deviceId: { type: String, required: true },
    deviceType: { type: String, enum: ['mobile', 'tv', 'web'], default: 'mobile' },
    deviceName: { type: String, default: 'Unknown Device' },
    lastActiveAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

deviceSchema.index({ userId: 1, deviceId: 1 }, { unique: true });

export const Device = mongoose.model<IDevice>('Device', deviceSchema);
