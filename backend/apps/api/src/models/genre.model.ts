import mongoose, { Document, Schema } from 'mongoose';

export interface IGenre extends Document {
  name: string;
  slug: string;
}

const genreSchema = new Schema<IGenre>(
  {
    name: { type: String, required: true, unique: true },
    slug: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

export const Genre = mongoose.model<IGenre>('Genre', genreSchema);
