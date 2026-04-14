import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../../../.env') });

import { Genre } from '../models/genre.model';
import { Category } from '../models/category.model';
import { Content } from '../models/content.model';
import { User } from '../models/user.model';
import { Profile } from '../models/profile.model';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/youstream';

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB for seeding...');

  // Clear existing data
  await Promise.all([
    Genre.deleteMany({}),
    Category.deleteMany({}),
    Content.deleteMany({}),
  ]);

  // --- Genres ---
  const genres = await Genre.insertMany([
    { name: 'Action', slug: 'action' },
    { name: 'Drama', slug: 'drama' },
    { name: 'Comedy', slug: 'comedy' },
    { name: 'Thriller', slug: 'thriller' },
    { name: 'Sci-Fi', slug: 'sci-fi' },
    { name: 'Horror', slug: 'horror' },
    { name: 'Romance', slug: 'romance' },
    { name: 'Documentary', slug: 'documentary' },
    { name: 'Animation', slug: 'animation' },
    { name: 'Crime', slug: 'crime' },
  ]);
  console.log(`✓ ${genres.length} genres created`);

  const genreMap = Object.fromEntries(genres.map((g) => [g.slug, g._id]));

  // --- Categories ---
  const categories = await Category.insertMany([
    { name: 'Trending Now', slug: 'trending-now', order: 1 },
    { name: 'Top Picks', slug: 'top-picks', order: 2 },
    { name: 'New Releases', slug: 'new-releases', order: 3 },
    { name: 'Popular on YouStream', slug: 'popular', order: 4 },
    { name: 'Action & Adventure', slug: 'action-adventure', order: 5 },
    { name: 'Watch It Again', slug: 'watch-again', order: 6 },
  ]);
  console.log(`✓ ${categories.length} categories created`);

  const catMap = Object.fromEntries(categories.map((c) => [c.slug, c._id]));

  // --- Sample Content ---
  const sampleMovies = [
    {
      type: 'movie',
      title: 'The Last Horizon',
      description: 'A lone astronaut battles against time to save humanity from an approaching supernova. A visually stunning journey across the cosmos.',
      genres: [genreMap['sci-fi'], genreMap['action']],
      categories: [catMap['trending-now'], catMap['top-picks']],
      contentLang: 'en',
      releaseYear: 2024,
      duration: 142,
      rating: 'U/A 13+',
      posterUrl: 'https://picsum.photos/seed/movie1/300/450',
      backdropUrl: 'https://picsum.photos/seed/movie1bg/1280/720',
      trailerUrl: '',
      streaming: { hlsUrl: '', subtitles: [] },
      cast: ['Chris Evans', 'Zendaya', 'Oscar Isaac'],
      status: 'published',
      viewCount: 15420,
    },
    {
      type: 'movie',
      title: 'Mumbai Nights',
      description: 'An undercover cop infiltrates the most dangerous crime syndicate in Mumbai. Loyalties blur when he forms an unlikely bond with the kingpin.',
      genres: [genreMap['crime'], genreMap['thriller']],
      categories: [catMap['trending-now'], catMap['popular']],
      contentLang: 'hi',
      releaseYear: 2024,
      duration: 156,
      rating: 'A',
      posterUrl: 'https://picsum.photos/seed/movie2/300/450',
      backdropUrl: 'https://picsum.photos/seed/movie2bg/1280/720',
      streaming: { hlsUrl: '', subtitles: [{ lang: 'en', url: '' }] },
      cast: ['Shah Rukh Khan', 'Deepika Padukone'],
      status: 'published',
      viewCount: 23100,
    },
    {
      type: 'movie',
      title: 'Echoes of Tomorrow',
      description: 'A brilliant scientist discovers a way to send messages to her past self, but every change she makes has devastating consequences.',
      genres: [genreMap['sci-fi'], genreMap['drama']],
      categories: [catMap['new-releases'], catMap['top-picks']],
      contentLang: 'en',
      releaseYear: 2025,
      duration: 118,
      rating: 'U/A 13+',
      posterUrl: 'https://picsum.photos/seed/movie3/300/450',
      backdropUrl: 'https://picsum.photos/seed/movie3bg/1280/720',
      streaming: { hlsUrl: '', subtitles: [] },
      cast: ['Margot Robbie', 'Timothée Chalamet'],
      status: 'published',
      viewCount: 8900,
    },
    {
      type: 'movie',
      title: 'The Wedding Fiasco',
      description: 'When two rival families are forced to share a wedding venue, chaos and hilarity ensue in this heartwarming romantic comedy.',
      genres: [genreMap['comedy'], genreMap['romance']],
      categories: [catMap['popular'], catMap['new-releases']],
      contentLang: 'en',
      releaseYear: 2024,
      duration: 105,
      rating: 'U',
      posterUrl: 'https://picsum.photos/seed/movie4/300/450',
      backdropUrl: 'https://picsum.photos/seed/movie4bg/1280/720',
      streaming: { hlsUrl: '', subtitles: [] },
      cast: ['Ryan Reynolds', 'Anne Hathaway'],
      status: 'published',
      viewCount: 12300,
    },
    {
      type: 'movie',
      title: 'Shadow Protocol',
      description: 'An elite special forces unit uncovers a government conspiracy that threatens global security. Trust no one.',
      genres: [genreMap['action'], genreMap['thriller']],
      categories: [catMap['action-adventure'], catMap['trending-now']],
      contentLang: 'en',
      releaseYear: 2024,
      duration: 131,
      rating: 'U/A 13+',
      posterUrl: 'https://picsum.photos/seed/movie5/300/450',
      backdropUrl: 'https://picsum.photos/seed/movie5bg/1280/720',
      streaming: { hlsUrl: '', subtitles: [] },
      cast: ['Tom Hardy', 'Florence Pugh'],
      status: 'published',
      viewCount: 18700,
    },
    {
      type: 'movie',
      title: 'Whispers in the Dark',
      description: 'A family moves into a centuries-old mansion only to discover its dark secrets through terrifying nightmares that blur reality.',
      genres: [genreMap['horror'], genreMap['thriller']],
      categories: [catMap['popular']],
      contentLang: 'en',
      releaseYear: 2024,
      duration: 98,
      rating: 'A',
      posterUrl: 'https://picsum.photos/seed/movie6/300/450',
      backdropUrl: 'https://picsum.photos/seed/movie6bg/1280/720',
      streaming: { hlsUrl: '', subtitles: [] },
      cast: ['Anya Taylor-Joy', 'Pedro Pascal'],
      status: 'published',
      viewCount: 9800,
    },
    {
      type: 'movie',
      title: 'Dil Se Phir',
      description: 'Two childhood friends reconnect after 15 years and realize the feelings they once buried are still very much alive.',
      genres: [genreMap['romance'], genreMap['drama']],
      categories: [catMap['new-releases']],
      contentLang: 'hi',
      releaseYear: 2025,
      duration: 145,
      rating: 'U',
      posterUrl: 'https://picsum.photos/seed/movie7/300/450',
      backdropUrl: 'https://picsum.photos/seed/movie7bg/1280/720',
      streaming: { hlsUrl: '', subtitles: [{ lang: 'en', url: '' }] },
      cast: ['Ranbir Kapoor', 'Alia Bhatt'],
      status: 'published',
      viewCount: 21000,
    },
    {
      type: 'movie',
      title: 'Planet Zero',
      description: 'Earth\'s first colony ship arrives at a habitable planet only to find ruins of an advanced alien civilization — and signs they didn\'t leave willingly.',
      genres: [genreMap['sci-fi'], genreMap['horror']],
      categories: [catMap['top-picks'], catMap['action-adventure']],
      contentLang: 'en',
      releaseYear: 2024,
      duration: 135,
      rating: 'U/A 13+',
      posterUrl: 'https://picsum.photos/seed/movie8/300/450',
      backdropUrl: 'https://picsum.photos/seed/movie8bg/1280/720',
      streaming: { hlsUrl: '', subtitles: [] },
      cast: ['John Boyega', 'Lupita Nyong\'o'],
      status: 'published',
      viewCount: 14200,
    },
  ];

  const sampleSeries = [
    {
      type: 'series',
      title: 'Code Red',
      description: 'A team of elite hackers are recruited by the government to fight cyber terrorism, but they discover the biggest threat comes from within.',
      genres: [genreMap['thriller'], genreMap['crime']],
      categories: [catMap['trending-now'], catMap['top-picks']],
      contentLang: 'en',
      releaseYear: 2024,
      duration: 0,
      rating: 'U/A 13+',
      posterUrl: 'https://picsum.photos/seed/series1/300/450',
      backdropUrl: 'https://picsum.photos/seed/series1bg/1280/720',
      streaming: { hlsUrl: '', subtitles: [] },
      cast: ['Rami Malek', 'Ana de Armas'],
      seasons: [
        {
          seasonNumber: 1,
          title: 'Season 1',
          episodes: [
            { episodeNumber: 1, title: 'Zero Day', description: 'The team is assembled.', duration: 52, hlsUrl: '', thumbnailUrl: '' },
            { episodeNumber: 2, title: 'Firewall', description: 'First major breach detected.', duration: 48, hlsUrl: '', thumbnailUrl: '' },
            { episodeNumber: 3, title: 'Backdoor', description: 'A mole is suspected.', duration: 55, hlsUrl: '', thumbnailUrl: '' },
          ],
        },
      ],
      status: 'published',
      viewCount: 32000,
    },
    {
      type: 'series',
      title: 'The Dynasty',
      description: 'Three generations of a powerful Indian business family navigate wealth, betrayal, and ambition in modern-day Delhi.',
      genres: [genreMap['drama'], genreMap['crime']],
      categories: [catMap['popular'], catMap['new-releases']],
      contentLang: 'hi',
      releaseYear: 2024,
      duration: 0,
      rating: 'A',
      posterUrl: 'https://picsum.photos/seed/series2/300/450',
      backdropUrl: 'https://picsum.photos/seed/series2bg/1280/720',
      streaming: { hlsUrl: '', subtitles: [{ lang: 'en', url: '' }] },
      cast: ['Nawazuddin Siddiqui', 'Radhika Apte'],
      seasons: [
        {
          seasonNumber: 1,
          title: 'Season 1',
          episodes: [
            { episodeNumber: 1, title: 'The Empire', description: 'Meet the Malhotra family.', duration: 58, hlsUrl: '', thumbnailUrl: '' },
            { episodeNumber: 2, title: 'Blood Money', description: 'Old secrets surface.', duration: 54, hlsUrl: '', thumbnailUrl: '' },
          ],
        },
      ],
      status: 'published',
      viewCount: 28000,
    },
    {
      type: 'series',
      title: 'Laugh Track',
      description: 'A struggling stand-up comedian in New York navigates the cutthroat world of comedy while dealing with a dysfunctional family.',
      genres: [genreMap['comedy'], genreMap['drama']],
      categories: [catMap['popular'], catMap['watch-again']],
      contentLang: 'en',
      releaseYear: 2023,
      duration: 0,
      rating: 'U/A 13+',
      posterUrl: 'https://picsum.photos/seed/series3/300/450',
      backdropUrl: 'https://picsum.photos/seed/series3bg/1280/720',
      streaming: { hlsUrl: '', subtitles: [] },
      cast: ['Kumail Nanjiani', 'Maya Rudolph'],
      seasons: [
        {
          seasonNumber: 1,
          title: 'Season 1',
          episodes: [
            { episodeNumber: 1, title: 'Open Mic Night', description: 'Dave bombs his first set.', duration: 30, hlsUrl: '', thumbnailUrl: '' },
            { episodeNumber: 2, title: 'The Heckler', description: 'A viral moment changes everything.', duration: 28, hlsUrl: '', thumbnailUrl: '' },
            { episodeNumber: 3, title: 'Netflix & Steal', description: 'Accused of joke theft.', duration: 32, hlsUrl: '', thumbnailUrl: '' },
          ],
        },
      ],
      status: 'published',
      viewCount: 19500,
    },
  ];

  const contents = await Content.insertMany([...sampleMovies, ...sampleSeries]);
  console.log(`✓ ${contents.length} content items created`);

  // Create a test admin user
  const existingAdmin = await User.findOne({ phone: '+911234567890' });
  if (!existingAdmin) {
    const admin = await User.create({
      phone: '+911234567890',
      name: 'Admin',
      role: 'admin',
      subscriptionStatus: 'active',
    });
    await Profile.create({
      userId: admin._id,
      name: 'Admin',
      ratingCeiling: 'A',
    });
    console.log('✓ Admin user created (phone: +911234567890, OTP: 123456)');
  }

  console.log('\n✓ Seed complete!');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
