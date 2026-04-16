import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IEpisode {
  episodeNumber: number;
  title: string;
  description: string;
  duration: number;
  hlsUrl: string;
  thumbnailUrl: string;
  subtitles: { lang: string; url: string }[];
}

export interface ISeason {
  seasonNumber: number;
  title: string;
  episodes: IEpisode[];
}

export interface IContent extends Document {
  type: 'movie' | 'series';
  title: string;
  description: string;
  genres: Types.ObjectId[];
  categories: Types.ObjectId[];
  contentLang: string;
  releaseYear: number;
  duration: number;
  rating: string;
  posterUrl: string;
  backdropUrl: string;
  thumbnailUrl: string;
  trailerUrl: string;
  rawUrl: string;
  streaming: {
    hlsUrl: string;
    spriteVttUrl: string;
    subtitles: { lang: string; url: string }[];
  };
  seasons: ISeason[];
  cast: string[];
  isPortrait: boolean;
  status: 'published' | 'draft' | 'downloading' | 'transcoding' | 'error';
  viewCount: number;
  torrent?: {
    downloadProgress: number;
    downloadSpeed: number;
    fileSize: number;
    errorMessage?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const episodeSchema = new Schema<IEpisode>({
  episodeNumber: { type: Number, required: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  duration: { type: Number, default: 0 },
  hlsUrl: { type: String, default: '' },
  thumbnailUrl: { type: String, default: '' },
  subtitles: [{ lang: String, url: String }],
});

const seasonSchema = new Schema<ISeason>({
  seasonNumber: { type: Number, required: true },
  title: { type: String, default: '' },
  episodes: [episodeSchema],
});

const contentSchema = new Schema<IContent>(
  {
    type: { type: String, enum: ['movie', 'series'], required: true },
    title: { type: String, required: true, index: 'text' },
    description: { type: String, default: '' },
    genres: [{ type: Schema.Types.ObjectId, ref: 'Genre' }],
    categories: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
    contentLang: { type: String, default: 'en' },
    releaseYear: { type: Number, default: new Date().getFullYear() },
    duration: { type: Number, default: 0 },
    rating: { type: String, default: 'U' },
    posterUrl: { type: String, default: '' },
    backdropUrl: { type: String, default: '' },
    thumbnailUrl: { type: String, default: '' },
    trailerUrl: { type: String, default: '' },
    rawUrl: { type: String, default: '' },
    streaming: {
      hlsUrl: { type: String, default: '' },
      spriteVttUrl: { type: String, default: '' },
      subtitles: [{ lang: String, url: String }],
    },
    seasons: [seasonSchema],
    cast: [{ type: String }],
    isPortrait: { type: Boolean, default: false },
    status: { type: String, enum: ['published', 'draft', 'downloading', 'transcoding', 'error'], default: 'draft' },
    viewCount: { type: Number, default: 0 },
    torrent: {
      downloadProgress: { type: Number, default: 0 },
      downloadSpeed: { type: Number, default: 0 },
      fileSize: { type: Number, default: 0 },
      errorMessage: { type: String, default: '' },
    },
  },
  { timestamps: true }
);

contentSchema.index({ title: 'text', description: 'text' }, { language_override: 'textSearchLang' });

export const Content = mongoose.model<IContent>('Content', contentSchema);
