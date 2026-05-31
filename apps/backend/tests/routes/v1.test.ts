import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import MediaRepository from '../../src/repositories/mediaRepository.js';
import ThumbnailRepository from '../../src/repositories/thumbnailRepository.js';
import SeasonRepository from '../../src/repositories/seasonRepository.js';
import CastRepository from '../../src/repositories/castRepository.js';
import { clearV1CatalogCaches, createV1ApiCaches, createV1Router, type V1ApiCaches } from '../../src/routes/v1.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { TmdbRateLimitError } from '../../src/services/tmdbService.js';
import { createTestDatabase, type TestDatabaseHandle } from '../helpers/testDatabase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const createApp = (
  mediaRepository: MediaRepository,
  thumbnailRepository: ThumbnailRepository,
  seasonRepository: SeasonRepository,
  castRepository: CastRepository,
  caches?: V1ApiCaches,
  options: Partial<Parameters<typeof createV1Router>[0]> = {},
) => {
  const app = express();
  app.use(
    '/api/v1',
    createV1Router({
      mediaRepository,
      thumbnailRepository,
      seasonRepository,
      castRepository,
      caches,
      ...options,
    }),
  );
  app.use(errorHandler);
  return app;
};

describe('v1 routes', () => {
  let dbHandle: TestDatabaseHandle;
  let mediaRepository: MediaRepository;
  let thumbnailRepository: ThumbnailRepository;
  let seasonRepository: SeasonRepository;
  let castRepository: CastRepository;
  let app: express.Express;

  beforeEach(() => {
    dbHandle = createTestDatabase();
    mediaRepository = new MediaRepository(dbHandle.drizzle);
    thumbnailRepository = new ThumbnailRepository(dbHandle.drizzle);
    seasonRepository = new SeasonRepository(dbHandle.drizzle);
    castRepository = new CastRepository(dbHandle.drizzle);
    app = createApp(mediaRepository, thumbnailRepository, seasonRepository, castRepository);
  });

  afterEach(() => {
    dbHandle.cleanup();
  });

  it('lists movies using the provided repositories', async () => {
    const movie = mediaRepository.create({
      plexId: 'movie-1',
      title: 'Injected Movie',
      mediaType: 'movie',
      year: 2024,
      summary: 'A movie stored through injected repositories.',
    });
    thumbnailRepository.create({ mediaId: movie.id, path: '/thumbs/movie-1.jpg' });

    const show = mediaRepository.create({
      plexId: 'show-1',
      title: 'Injected Series',
      mediaType: 'tv',
    });
    thumbnailRepository.create({ mediaId: show.id, path: '/thumbs/show-1.jpg' });

    const response = await request(app).get('/api/v1/movies');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      expect.objectContaining({
        ratingKey: 'movie-1',
        title: 'Injected Movie',
      }),
    ]);
    expect(response.body[0].thumbFile).toMatch(
      /^https?:\/\/.+\/api\/thumbnails\/movies\/%2Fthumbs%2Fmovie-1\.jpg$/,
    );
  });

  it('returns movie details with thumbnails from injected repositories', async () => {
    const movie = mediaRepository.create({
      plexId: 'movie-2',
      title: 'Detailed Movie',
      mediaType: 'movie',
      genres: ['Drama'],
      directors: ['Director A'],
      writers: ['Writer A'],
      languages: ['German'],
      originalLanguage: 'de',
      trailerYoutubeId: 'trailer-a',
      trailerSite: 'YouTube',
      trailerName: 'Trailer A',
      trailerUrl: 'https://www.youtube-nocookie.com/embed/trailer-a',
    });
    thumbnailRepository.create({ mediaId: movie.id, path: '/thumbs/movie-2-a.jpg' });
    thumbnailRepository.create({ mediaId: movie.id, path: '/thumbs/movie-2-b.jpg' });

    const response = await request(app).get(`/api/v1/movies/${movie.plexId}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ratingKey: 'movie-2',
      title: 'Detailed Movie',
      genres: ['Drama'],
      directors: ['Director A'],
      writers: ['Writer A'],
      languages: ['German'],
      originalLanguage: 'de',
      trailerYoutubeId: 'trailer-a',
      trailerSite: 'YouTube',
      trailerName: 'Trailer A',
      trailerUrl: 'https://www.youtube-nocookie.com/embed/trailer-a',
      thumbnails: ['/thumbs/movie-2-a.jpg', '/thumbs/movie-2-b.jpg'],
      cast: [],
    });
  });

  it('reports media statistics based on injected repositories', async () => {
    mediaRepository.create({ plexId: 'movie-3', title: 'Stat Movie', mediaType: 'movie', duration: 60000 });
    mediaRepository.create({ plexId: 'show-2', title: 'Stat Show', mediaType: 'tv' });

    const response = await request(app).get('/api/v1/stats');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      totalMovies: 1,
      totalSeries: 1,
      totalItems: 2,
      totalRuntime: 60000,
      totalEpisodes: 0,
      newItems: expect.any(Number),
      movies: {
        total: 1,
        runtime: 60000,
        newItems: expect.any(Number),
      },
      series: {
        total: 1,
        runtime: 0,
        episodes: 0,
        newItems: expect.any(Number),
      },
    });
  });

  it('returns seasons and episodes with Tautulli proxy thumbnails', async () => {
    const series = mediaRepository.create({
      plexId: 'show-proxy-1',
      title: 'Proxy Series',
      mediaType: 'tv',
    });

    const season = seasonRepository.create({
      mediaItemId: series.id,
      tautulliId: 'season-proxy-1',
      seasonNumber: 1,
      title: 'Season 1',
      poster: 'https://tautulli.example.com/library/metadata/111/thumb/222?width=320',
    });

    seasonRepository.createEpisode({
      seasonId: season.id,
      tautulliId: 'episode-proxy-1',
      episodeNumber: 1,
      title: 'Episode 1',
      thumb: '/library/metadata/333/thumb/444',
    });

    const response = await request(app).get(`/api/v1/series/${series.plexId}`);

    expect(response.status).toBe(200);
    expect(response.body.seasons).toHaveLength(1);
    expect(response.body.seasons[0].poster).toContain(
      '/api/thumbnails/tautulli/library/metadata/111/thumb/222',
    );
    expect(response.body.seasons[0].episodes).toHaveLength(1);
    expect(response.body.seasons[0].episodes[0].thumb).toContain(
      '/api/thumbnails/tautulli/library/metadata/333/thumb/444',
    );
  });

  it('returns filter results using the canonical items and pagination envelope', async () => {
    mediaRepository.create({
      plexId: 'movie-filter-1',
      title: 'Filter Movie',
      mediaType: 'movie',
      studio: 'Filter Studio',
      languages: ['German'],
      originalLanguage: 'de',
      rating: 9,
    });
    mediaRepository.create({
      plexId: 'show-filter-1',
      title: 'Filter Show',
      mediaType: 'tv',
      studio: 'Other Studio',
      languages: ['English'],
      originalLanguage: 'en',
      rating: 7,
    });

    const response = await request(app).get('/api/v1/filter?type=movie&studio=Filter%20Studio&language=German&sortBy=rating&sortOrder=desc&limit=10&offset=0');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      pagination: {
        total: 1,
        limit: 10,
        offset: 0,
        hasMore: false,
      },
    });
    expect(response.body.items).toEqual([
      expect.objectContaining({
        ratingKey: 'movie-filter-1',
        title: 'Filter Movie',
      }),
    ]);
    expect(response.body.facets.studios).toEqual(expect.arrayContaining(['Filter Studio', 'Other Studio']));
    expect(response.body.facets.languages).toEqual(expect.arrayContaining(['German', 'English', 'de', 'en']));
  });

  it('keeps search response compatibility while exposing items and pagination', async () => {
    mediaRepository.create({
      plexId: 'movie-search-1',
      title: 'Searchable Movie',
      mediaType: 'movie',
      writers: ['Metadata Writer'],
    });

    const response = await request(app).get('/api/v1/search?q=Metadata%20Writer&limit=5');

    expect(response.status).toBe(200);
    expect(response.body.query).toBe('Metadata Writer');
    expect(response.body.total).toBe(1);
    expect(response.body.results).toEqual(response.body.items);
    expect(response.body.pagination).toEqual({
      total: 1,
      limit: 5,
      offset: 0,
      hasMore: false,
    });
  });

  it('keeps recent response compatibility while exposing pagination', async () => {
    mediaRepository.create({
      plexId: 'movie-recent-1',
      title: 'Recent Movie',
      mediaType: 'movie',
      plexAddedAt: '2026-01-01T00:00:00Z',
    });
    mediaRepository.create({
      plexId: 'movie-recent-2',
      title: 'Older Recent Movie',
      mediaType: 'movie',
      plexAddedAt: '2025-12-01T00:00:00Z',
    });

    const response = await request(app).get('/api/v1/recent?limit=1&type=movie');

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(1);
    expect(response.body.items).toEqual([
      expect.objectContaining({
        ratingKey: 'movie-recent-1',
        title: 'Recent Movie',
      }),
    ]);
    expect(response.body.pagination).toEqual({
      total: 2,
      limit: 1,
      offset: 0,
      hasMore: true,
    });
  });

  it('normalizes local cover paths to consumable thumbnail URLs', async () => {
    mediaRepository.create({
      plexId: 'movie-cover-1',
      title: 'Local Cover Movie',
      mediaType: 'movie',
      poster: 'covers/movie/movie-cover-1/poster.jpg',
      backdrop: 'covers/movie/movie-cover-1/backdrop.jpg',
    });

    const response = await request(app).get('/api/v1/movies/movie-cover-1');

    expect(response.status).toBe(200);
    expect(response.body.poster).toMatch(
      /^https?:\/\/.+\/api\/thumbnails\/covers\/movie\/movie-cover-1\/poster\.jpg$/,
    );
    expect(response.body.backdrop).toMatch(
      /^https?:\/\/.+\/api\/thumbnails\/covers\/movie\/movie-cover-1\/backdrop\.jpg$/,
    );
  });

  it('serves fresh catalog data after v1 catalog caches are invalidated', async () => {
    const caches = createV1ApiCaches();
    const cacheApp = createApp(
      mediaRepository,
      thumbnailRepository,
      seasonRepository,
      castRepository,
      caches,
    );
    const movie = mediaRepository.create({
      plexId: 'movie-cache-1',
      title: 'Cached Before Sync',
      mediaType: 'movie',
    });

    const firstResponse = await request(cacheApp).get('/api/v1/movies').set('Host', 'catalog.test');
    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body.some((item: any) => item.title === 'Cached Before Sync')).toBe(true);

    mediaRepository.update(movie.id, { title: 'Fresh After Sync' });

    const staleResponse = await request(cacheApp).get('/api/v1/movies').set('Host', 'catalog.test');
    expect(staleResponse.headers['x-cache']).toBe('HIT');
    expect(staleResponse.body.some((item: any) => item.title === 'Cached Before Sync')).toBe(true);

    clearV1CatalogCaches(caches);

    const freshResponse = await request(cacheApp).get('/api/v1/movies').set('Host', 'catalog.test');
    expect(freshResponse.headers['x-cache']).toBe('MISS');
    expect(freshResponse.body.some((item: any) => item.title === 'Fresh After Sync')).toBe(true);
  });

  it('does not cache TMDB error responses and allows a later success', async () => {
    const caches = createV1ApiCaches();
    let tmdbService: any = null;
    const tmdbApp = createApp(
      mediaRepository,
      thumbnailRepository,
      seasonRepository,
      castRepository,
      caches,
      { getTmdbService: () => tmdbService },
    );

    const unavailableResponse = await request(tmdbApp)
      .get('/api/v1/tmdb/movie/123')
      .set('Host', 'tmdb-cache.test');
    expect(unavailableResponse.status).toBe(503);
    expect(unavailableResponse.headers['x-cache']).toBe('MISS');
    expect(unavailableResponse.body.error.message).toBe('TMDB integration not configured');

    tmdbService = {
      isEnabled: () => true,
      fetchDetails: async () => ({ id: 123, title: 'Runtime TMDB' }),
    };

    const successResponse = await request(tmdbApp)
      .get('/api/v1/tmdb/movie/123')
      .set('Host', 'tmdb-cache.test');
    expect(successResponse.status).toBe(200);
    expect(successResponse.headers['x-cache']).toBe('MISS');
    expect(successResponse.body).toEqual({ id: 123, title: 'Runtime TMDB' });

    const cachedSuccessResponse = await request(tmdbApp)
      .get('/api/v1/tmdb/movie/123')
      .set('Host', 'tmdb-cache.test');
    expect(cachedSuccessResponse.status).toBe(200);
    expect(cachedSuccessResponse.headers['x-cache']).toBe('HIT');
  });

  it('keeps TMDB rate-limit compatibility fields while using the error envelope', async () => {
    const tmdbApp = createApp(
      mediaRepository,
      thumbnailRepository,
      seasonRepository,
      castRepository,
      createV1ApiCaches(),
      {
        getTmdbService: () => ({
          isEnabled: () => true,
          fetchDetails: async () => {
            throw new TmdbRateLimitError('limit reached', {
              retryAfterMs: 1234,
              until: 1780000000000,
            });
          },
        }) as any,
      },
    );

    const response = await request(tmdbApp).get('/api/v1/tmdb/movie/123');

    expect(response.status).toBe(429);
    expect(response.body.error).toMatchObject({
      message: 'TMDB rate limit reached',
      statusCode: 429,
      details: {
        retryAfterMs: 1234,
        until: 1780000000000,
      },
    });
    expect(response.body.retryAfterMs).toBe(1234);
    expect(response.body.until).toBe(1780000000000);
  });

  it('documents the canonical v1 response shapes in OpenAPI', () => {
    const swaggerPath = path.resolve(__dirname, '../../src/config/swagger.yaml');
    const document = yaml.parse(fs.readFileSync(swaggerPath, 'utf8'));

    const statsProperties = document.components.schemas.Stats.properties;
    expect(Object.keys(statsProperties)).toEqual([
      'totalMovies',
      'totalSeries',
      'totalItems',
      'totalRuntime',
      'totalEpisodes',
      'newItems',
      'movies',
      'series',
    ]);

    const filterProperties =
      document.paths['/api/v1/filter'].get.responses['200'].content['application/json'].schema.properties;
    expect(filterProperties).toHaveProperty('items');
    expect(filterProperties).toHaveProperty('pagination');
    expect(filterProperties).not.toHaveProperty('results');

    const searchProperties = document.components.schemas.SearchResults.properties;
    expect(searchProperties).toHaveProperty('results');
    expect(searchProperties).toHaveProperty('items');
    expect(searchProperties).toHaveProperty('pagination');

    const recentProperties =
      document.paths['/api/v1/recent'].get.responses['200'].content['application/json'].schema.properties;
    expect(recentProperties).toHaveProperty('items');
    expect(recentProperties).toHaveProperty('count');
    expect(recentProperties).toHaveProperty('pagination');
  });
});
