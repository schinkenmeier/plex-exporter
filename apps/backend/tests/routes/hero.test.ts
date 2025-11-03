import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createHeroRouter } from '../../src/routes/hero.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

const createApp = (items: any[]) => {
  const heroPipeline = {
    getPool: vi.fn(async () => ({
      kind: 'movies',
      items,
      updatedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
      slotSummary: {},
      matchesPolicy: true,
      fromCache: false,
      meta: {},
    })),
    setTmdbService: vi.fn(),
  };

  const app = express();
  app.use('/hero', createHeroRouter({ heroPipeline }));
  app.use(errorHandler);
  return { app, heroPipeline };
};

describe('hero routes', () => {
  it('returns proxied Tautulli thumbnails without double wrapping the URL', async () => {
    const proxiedPath = '/api/thumbnails/tautulli/library/metadata/123/thumb/456';
    const { app } = createApp([
      {
        id: '1',
        type: 'movie',
        title: 'Proxy Item',
        poster: proxiedPath,
        backdrops: [proxiedPath],
      },
    ]);

    const response = await request(app).get('/hero/movies');

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    const { poster, backdrops } = response.body.items[0];
    expect(poster).toMatch(/^http:\/\/127\.0\.0\.1(?::\d+)?\//);
    expect(poster.endsWith(proxiedPath)).toBe(true);
    expect(backdrops).toHaveLength(1);
    expect(backdrops[0].endsWith(proxiedPath)).toBe(true);
    expect(backdrops[0]).toMatch(/^http:\/\/127\.0\.0\.1(?::\d+)?\//);
    expect(backdrops[0]).not.toContain('%2Fapi%2Fthumbnails');
  });

  it('converts local artwork paths using the media type', async () => {
    const { app } = createApp([
      {
        id: '1',
        type: 'tv',
        title: 'Local Item',
        poster: 'season/1/poster.jpg',
        backdrops: ['backdrops/1.jpg'],
      },
    ]);

    const response = await request(app).get('/hero/series');

    expect(response.status).toBe(200);
    const { poster, backdrops } = response.body.items[0];
    expect(poster).toMatch(/^http:\/\/127\.0\.0\.1(?::\d+)?\/api\/thumbnails\/series\//);
    expect(poster.endsWith('series/season/1/poster.jpg')).toBe(true);
    expect(backdrops[0]).toMatch(
      /^http:\/\/127\.0\.0\.1(?::\d+)?\/api\/thumbnails\/series\//,
    );
    expect(backdrops[0].endsWith('series/backdrops/1.jpg')).toBe(true);
  });

  it('converts cover paths via the covers endpoint', async () => {
    const { app } = createApp([
      {
        id: '1',
        type: 'movie',
        title: 'Cover Item',
        poster: 'covers/movie/123/poster.jpg',
        backdrops: ['covers/movie/123/backdrop.jpg'],
      },
    ]);

    const response = await request(app).get('/hero/movies');

    expect(response.status).toBe(200);
    const { poster, backdrops } = response.body.items[0];
    expect(poster).toMatch(/^http:\/\/127\.0\.0\.1(?::\d+)?\/api\/thumbnails\/covers\//);
    expect(poster.endsWith('covers/movie/123/poster.jpg')).toBe(true);
    expect(backdrops).toHaveLength(1);
    expect(backdrops[0]).toMatch(/^http:\/\/127\.0\.0\.1(?::\d+)?\/api\/thumbnails\/covers\//);
    expect(backdrops[0].endsWith('covers/movie/123/backdrop.jpg')).toBe(true);
  });
});
