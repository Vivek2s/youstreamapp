import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IQRSession extends Document {
  sessionId: string;
  status: 'pending' | 'authorized' | 'expired';
  userId?: Types.ObjectId;
  accessToken?: string;
  refreshToken?: string;
  expiresAt: Date;
  createdAt: Date;
}

const qrSessionSchema = new Schema<IQRSession>(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    status: { type: String, enum: ['pending', 'authorized', 'expired'], default: 'pending' },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    accessToken: { type: String },
    refreshToken: { type: String },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// Auto-delete expired sessions
qrSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const QRSession = mongoose.model<IQRSession>('QRSession', qrSessionSchema);
