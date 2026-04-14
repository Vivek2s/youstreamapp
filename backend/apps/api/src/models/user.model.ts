import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  phone: string;
  name: string;
  email?: string;
  role: 'user' | 'admin';
  subscriptionStatus: 'active' | 'inactive' | 'expired';
  subscriptionPlan?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    phone: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: '' },
    email: { type: String, default: '' },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    subscriptionStatus: {
      type: String,
      enum: ['active', 'inactive', 'expired'],
      default: 'active',
    },
    subscriptionPlan: { type: String, default: 'free' },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', userSchema);
