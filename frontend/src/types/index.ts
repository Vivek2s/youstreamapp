export interface User {
  id: string;
  phone: string;
  name: string;
  role: 'user' | 'admin';
  subscriptionStatus: 'active' | 'inactive' | 'expired';
}

export interface Profile {
  _id: string;
  userId: string;
  name: string;
  avatar: string;
  isKids: boolean;
  ratingCeiling: string;
}

export interface Content {
  _id: string;
  type: 'movie' | 'series';
  title: string;
  description: string;
  genres: Genre[];
  categories: Category[];
  contentLang: string;
  releaseYear: number;
  duration: number;
  rating: string;
  posterUrl: string;
  backdropUrl: string;
  trailerUrl: string;
  streaming: {
    hlsUrl: string;
    subtitles: { lang: string; url: string }[];
  };
  seasons?: Season[];
  cast: string[];
  status: string;
  viewCount: number;
}

export interface Genre {
  _id: string;
  name: string;
  slug: string;
}

export interface Category {
  _id: string;
  name: string;
  slug: string;
}

export interface Season {
  seasonNumber: number;
  title: string;
  episodes: Episode[];
}

export interface Episode {
  episodeNumber: number;
  title: string;
  description: string;
  duration: number;
  hlsUrl: string;
  thumbnailUrl: string;
}

export interface ContentRow {
  category: { id: string; name: string; slug: string };
  contents: Content[];
}

export interface HomeData {
  hero: Content | null;
  rows: ContentRow[];
  allContent: Content[];
}

export interface WatchHistory {
  _id: string;
  profileId: string;
  contentId: Content;
  progressSeconds: number;
  duration: number;
  completed: boolean;
  updatedAt: string;
}

// Navigation types
export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  OTP: { phone: string };
};

export type MainTabParamList = {
  Home: undefined;
  Upload: undefined;
  Activity: undefined;
  Profile: undefined;
};

export type HomeStackParamList = {
  HomeScreen: undefined;
  Search: undefined;
  ContentDetail: { contentId: string };
  Player: { contentId: string; title: string };
};
