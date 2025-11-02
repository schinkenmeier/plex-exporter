import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { createV1Router } from './v1.js';
import { initializeDrizzleDatabase } from '../db/index.js';
import MediaRepository from '../repositories/mediaRepository.js';
import ThumbnailRepository from '../repositories/thumbnailRepository.js';
import SeasonRepository from '../repositories/seasonRepository.js';
import CastRepository from '../repositories/castRepository.js';
import { seasons, episodes, castMembers, mediaCast } from '../db/schema.js';
import type { SqliteDatabase, DrizzleDatabase } from '../db/index.js';

describe('V1 API Routes', () => {
  let app: Express;
  let sqliteDb: SqliteDatabase;
  let drizzleDb: DrizzleDatabase;
  let mediaRepository: MediaRepository;
  let thumbnailRepository: ThumbnailRepository;
  let seasonRepository: SeasonRepository;
  let castRepository: CastRepository;

  beforeAll(() => {
    // Create in-memory test database
    const dbBundle = initializeDrizzleDatabase({ filePath: ':memory:' });
    sqliteDb = dbBundle.sqlite;
    drizzleDb = dbBundle.db;
    mediaRepository = new MediaRepository(drizzleDb);
    thumbnailRepository = new ThumbnailRepository(drizzleDb);
    seasonRepository = new SeasonRepository(drizzleDb);
    castRepository = new CastRepository(drizzleDb);

    // Insert test data
    const movie = mediaRepository.create({
      plexId: '1',
      title: 'Test Movie',
      year: 2020,
      guid: 'imdb://tt1234567',
      summary: 'A test movie summary',
      mediaType: 'movie',
      plexAddedAt: null,
      plexUpdatedAt: null,
      genres: ['Action', 'Drama'],
      directors: ['Test Director'],
      countries: ['USA'],
      collections: null,
      rating: null,
      audienceRating: 8.5,
      contentRating: 'PG-13',
      studio: 'Test Studio',
      tagline: 'A test tagline',
      duration: 7200000,
      originallyAvailableAt: '2020-01-01',
    });

    const series = mediaRepository.create({
      plexId: '2',
      title: 'Test Series',
      year: 2021,
      guid: 'imdb://tt7654321',
      summary: 'A test series summary',
      mediaType: 'tv',
      plexAddedAt: null,
      plexUpdatedAt: null,
      genres: ['Comedy'],
      directors: null,
      countries: ['UK'],
      collections: null,
      rating: null,
      audienceRating: 9.0,
      contentRating: 'TV-MA',
      studio: null,
      tagline: null,
      duration: null,
      originallyAvailableAt: null,
    });

    const [season1] = drizzleDb
      .insert(seasons)
      .values([
        {
          mediaItemId: series.id,
          tautulliId: 'season-2-1',
          seasonNumber: 1,
          title: 'Season 1',
          summary: 'Season one summary',
          poster: null,
          episodeCount: 2,
        },
      ])
      .returning()
      .all();

    drizzleDb
      .insert(episodes)
      .values([
        {
          seasonId: season1.id,
          tautulliId: 'episode-2-1-1',
          episodeNumber: 1,
          title: 'Pilot',
          summary: 'Episode one summary',
          duration: 1800000,
          rating: '8.0',
          airDate: '2021-01-01',
          thumb: null,
        },
        {
          seasonId: season1.id,
          tautulliId: 'episode-2-1-2',
          episodeNumber: 2,
          title: 'Second Episode',
          summary: 'Episode two summary',
          duration: 1850000,
          rating: '8.3',
          airDate: '2021-01-08',
          thumb: null,
        },
      ])
      .run();

    const [castMember] = drizzleDb
      .insert(castMembers)
      .values([
        {
          name: 'Lead Actor',
          role: 'Actor',
          photo: null,
        },
      ])
      .returning()
      .all();

    drizzleDb
      .insert(mediaCast)
      .values([
        {
          mediaItemId: series.id,
          castMemberId: castMember.id,
          character: 'Main Character',
          order: 1,
        },
      ])
      .run();

    drizzleDb
      .insert(mediaCast)
      .values([
        {
          mediaItemId: movie.id,
          castMemberId: castMember.id,
          character: 'Hero',
          order: 1,
        },
      ])
      .run();

    // Create Express app with v1 router
    app = express();
    app.use(express.json());
    app.use(
      '/api/v1',
      createV1Router({
        mediaRepository,
        thumbnailRepository,
        seasonRepository,
        castRepository,
      }),
    );
  });

  afterAll(() => {
    sqliteDb.close();
  });

  describe('GET /api/v1/stats', () => {
    it('should return statistics', async () => {
      const response = await request(app).get('/api/v1/stats');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        totalMovies: 1,
        totalSeries: 1,
        totalItems: 2,
      });
    });

    it('should include cache headers', async () => {
      const response = await request(app).get('/api/v1/stats');

      expect(response.headers['x-cache']).toBeDefined();
      expect(response.headers['cache-control']).toBeDefined();
    });
  });

  describe('GET /api/v1/movies', () => {
    it('should return list of movies', async () => {
      const response = await request(app).get('/api/v1/movies');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(1);
      expect(response.body[0]).toMatchObject({
        ratingKey: '1',
        title: 'Test Movie',
        year: 2020,
        mediaType: 'movie',
      });
    });

    it('should include extended metadata', async () => {
      const response = await request(app).get('/api/v1/movies');

      expect(response.body[0].genres).toEqual(['Action', 'Drama']);
      expect(response.body[0].directors).toEqual(['Test Director']);
      expect(response.body[0].audienceRating).toBe(8.5);
    });
  });

  describe('GET /api/v1/movies/:id', () => {
    it('should return movie by ID', async () => {
    const response = await request(app).get('/api/v1/movies/1');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ratingKey: '1',
      title: 'Test Movie',
      year: 2020,
      mediaType: 'movie',
    });
    expect(Array.isArray(response.body.cast)).toBe(true);
    expect(response.body.cast.length).toBeGreaterThan(0);
    expect(response.body.cast[0]).toMatchObject({
      name: 'Lead Actor',
      character: 'Hero',
    });
    });

    it('should return 404 for non-existent movie', async () => {
      const response = await request(app).get('/api/v1/movies/999');

      expect(response.status).toBe(404);
      // Error handler returns structured error response
      expect(response.body).toBeDefined();
    });
  });

  describe('GET /api/v1/series', () => {
    it('should return list of series', async () => {
      const response = await request(app).get('/api/v1/series');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(1);
      expect(response.body[0]).toMatchObject({
        ratingKey: '2',
        title: 'Test Series',
        year: 2021,
        mediaType: 'tv',
      });
    });
  });

  describe('GET /api/v1/series/:id', () => {
    it('should return series by ID', async () => {
    const response = await request(app).get('/api/v1/series/2');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ratingKey: '2',
      title: 'Test Series',
      year: 2021,
      mediaType: 'tv',
    });
    expect(Array.isArray(response.body.seasons)).toBe(true);
    expect(response.body.seasons.length).toBe(1);
    expect(response.body.seasons[0]).toMatchObject({
      ratingKey: 'season-2-1',
      seasonNumber: 1,
      episodeCount: 2,
    });
    expect(Array.isArray(response.body.seasons[0].episodes)).toBe(true);
    expect(response.body.seasons[0].episodes[0]).toMatchObject({
      ratingKey: 'episode-2-1-1',
      episodeNumber: 1,
      title: 'Pilot',
    });
    expect(Array.isArray(response.body.cast)).toBe(true);
    expect(response.body.cast.length).toBe(1);
    expect(response.body.cast[0]).toMatchObject({
      name: 'Lead Actor',
      character: 'Main Character',
    });
    });

    it('should return 404 for non-existent series', async () => {
      const response = await request(app).get('/api/v1/series/999');

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/v1/filter', () => {
    it('should filter by media type', async () => {
      const response = await request(app)
        .get('/api/v1/filter')
        .query({ type: 'movie' });

      expect(response.status).toBe(200);
      expect(response.body.pagination.total).toBe(1);
      expect(response.body.items[0].mediaType).toBe('movie');
    });

    it('should filter by year', async () => {
      const response = await request(app)
        .get('/api/v1/filter')
        .query({ year: 2020 });

      expect(response.status).toBe(200);
      expect(response.body.pagination.total).toBe(1);
      expect(response.body.items[0].year).toBe(2020);
    });

    it('should filter by year range', async () => {
      const response = await request(app)
        .get('/api/v1/filter')
        .query({ yearFrom: 2020, yearTo: 2021 });

      expect(response.status).toBe(200);
      expect(response.body.pagination.total).toBe(2);
    });

    it('should apply limit and offset', async () => {
      const response = await request(app)
        .get('/api/v1/filter')
        .query({ limit: 1, offset: 0 });

      expect(response.status).toBe(200);
      expect(response.body.pagination.limit).toBe(1);
      expect(response.body.pagination.offset).toBe(0);
      expect(response.body.items.length).toBe(1);
    });

    it('should reject invalid limit', async () => {
      const response = await request(app)
        .get('/api/v1/filter')
        .query({ limit: 999999 });

      expect(response.status).toBe(500); // Zod validation error caught by error handler
    });

    it('should sort results', async () => {
      const response = await request(app)
        .get('/api/v1/filter')
        .query({ sortBy: 'year', sortOrder: 'desc' });

      expect(response.status).toBe(200);
      expect(response.body.items[0].year).toBeGreaterThanOrEqual(
        response.body.items[response.body.items.length - 1].year
      );
    });
  });

  describe('GET /api/v1/search', () => {
    it('should search by title', async () => {
      const response = await request(app)
        .get('/api/v1/search')
        .query({ q: 'Test Movie' });

      expect(response.status).toBe(200);
      expect(response.body.query).toBe('Test Movie');
      expect(response.body.total).toBeGreaterThan(0);
      expect(response.body.results[0].title).toContain('Test Movie');
    });

    it('should search with type filter', async () => {
      const response = await request(app)
        .get('/api/v1/search')
        .query({ q: 'Test', type: 'tv' });

      expect(response.status).toBe(200);
      expect(response.body.results.every((r: any) => r.mediaType === 'tv')).toBe(true);
    });

    it('should require query parameter', async () => {
      const response = await request(app).get('/api/v1/search');

      expect(response.status).toBe(500); // Zod validation error
    });

    it('should respect limit parameter', async () => {
      const response = await request(app)
        .get('/api/v1/search')
        .query({ q: 'Test', limit: 1 });

      expect(response.status).toBe(200);
      expect(response.body.results.length).toBeLessThanOrEqual(1);
    });
  });

  describe('GET /api/v1/recent', () => {
    it('should return recent media', async () => {
      const response = await request(app).get('/api/v1/recent');

      expect(response.status).toBe(200);
      expect(response.body.count).toBeDefined();
      expect(Array.isArray(response.body.items)).toBe(true);
    });

    it('should filter by type', async () => {
      const response = await request(app)
        .get('/api/v1/recent')
        .query({ type: 'movie' });

      expect(response.status).toBe(200);
      expect(response.body.items.every((r: any) => r.mediaType === 'movie')).toBe(true);
    });

    it('should respect limit parameter', async () => {
      const response = await request(app)
        .get('/api/v1/recent')
        .query({ limit: 1 });

      expect(response.status).toBe(200);
      expect(response.body.items.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Rate Limiting', () => {
    it('should include rate limit headers', async () => {
      const response = await request(app).get('/api/v1/stats');

      expect(response.headers['ratelimit-limit']).toBeDefined();
      expect(response.headers['ratelimit-remaining']).toBeDefined();
      expect(response.headers['ratelimit-reset']).toBeDefined();
    });
  });

  describe('Caching', () => {
    it('should include cache headers', async () => {
      const response = await request(app).get('/api/v1/movies/1');

      // Should have X-Cache header (either HIT or MISS)
      expect(response.headers['x-cache']).toBeDefined();
      expect(['HIT', 'MISS']).toContain(response.headers['x-cache']);
    });

    it('should cache different endpoints separately', async () => {
      const response1 = await request(app).get('/api/v1/movies');
      const response2 = await request(app).get('/api/v1/series');

      // Both should have cache headers
      expect(response1.headers['x-cache']).toBeDefined();
      expect(response2.headers['x-cache']).toBeDefined();
    });
  });
});
