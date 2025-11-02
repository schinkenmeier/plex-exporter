import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import MediaRepository from '../../src/repositories/mediaRepository.js';
import ThumbnailRepository from '../../src/repositories/thumbnailRepository.js';
import SeasonRepository from '../../src/repositories/seasonRepository.js';
import CastRepository from '../../src/repositories/castRepository.js';
import { createV1Router } from '../../src/routes/v1.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { createTestDatabase, type TestDatabaseHandle } from '../helpers/testDatabase.js';

const createApp = (
  mediaRepository: MediaRepository,
  thumbnailRepository: ThumbnailRepository,
  seasonRepository: SeasonRepository,
  castRepository: CastRepository,
) => {
  const app = express();
  app.use(
    '/api/v1',
    createV1Router({ mediaRepository, thumbnailRepository, seasonRepository, castRepository }),
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
      thumbnails: ['/thumbs/movie-2-a.jpg', '/thumbs/movie-2-b.jpg'],
      cast: [],
    });
  });

  it('reports media statistics based on injected repositories', async () => {
    mediaRepository.create({ plexId: 'movie-3', title: 'Stat Movie', mediaType: 'movie' });
    mediaRepository.create({ plexId: 'show-2', title: 'Stat Show', mediaType: 'tv' });

    const response = await request(app).get('/api/v1/stats');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      totalMovies: 1,
      totalSeries: 1,
      totalItems: 2,
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
});
