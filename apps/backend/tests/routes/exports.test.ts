import express from 'express';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createExportsRouter } from '../../src/routes/exports.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

describe('exports routes', () => {
  let fixturesDir: string;

  const createApp = (root = fixturesDir) => {
    const app = express();
    app.use('/api/exports', createExportsRouter({ exportsPath: root }));
    app.use(errorHandler);
    return app;
  };

  const writeJson = (relativePath: string, data: unknown) => {
    const target = path.join(fixturesDir, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, JSON.stringify(data), 'utf-8');
  };

  beforeEach(() => {
    fixturesDir = mkdtempSync(path.join(os.tmpdir(), 'exports-route-'));
  });

  afterEach(() => {
    rmSync(fixturesDir, { recursive: true, force: true });
  });

  it('normalizes movie thumbnails and sets cache headers', async () => {
    writeJson('movies/movies.json', [
      { title: 'Test Movie', ratingKey: 123, thumbFile: 'poster.jpg', genres: ['Action'] },
    ]);

    const app = createApp();
    const response = await request(app).get('/api/exports/movies');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=300');
    expect(response.headers.etag).toBeDefined();
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body[0]).toMatchObject({
      title: 'Test Movie',
      ratingKey: '123',
      thumb: 'data/exports/movies/poster.jpg',
      thumbFile: 'data/exports/movies/poster.jpg',
    });
  });

  it('uses hero bag fallback for movies when export file is missing', async () => {
    writeJson('__PLEX_EXPORTER__/bag.json', {
      movies: [
        {
          title: 'Bag Movie',
          ratingKey: 'bag-1',
          thumb: './movies/bag-poster.jpg',
        },
      ],
    });

    const app = createApp();
    const response = await request(app).get('/api/exports/movies');

    expect(response.status).toBe(200);
    expect(response.body[0]).toMatchObject({
      title: 'Bag Movie',
      ratingKey: 'bag-1',
      thumbFile: 'data/exports/movies/bag-poster.jpg',
    });
  });

  it('responds with 500 when movie export validation fails', async () => {
    writeJson('movies/movies.json', [{ ratingKey: 456 }]);

    const app = createApp();
    const response = await request(app).get('/api/exports/movies');

    expect(response.status).toBe(500);
    expect(response.body.error.message).toBe('Invalid movies export data');
  });

  it('falls back to hero bag for series details and sets cache headers', async () => {
    writeJson('__PLEX_EXPORTER__/bag.json', {
      seriesDetails: {
        bagshow: {
          title: 'Bag Show',
          ratingKey: 'bagshow',
          seasons: [
            {
              title: 'Season 1',
              ratingKey: 'season-1',
              episodes: [
                { title: 'Episode 1', ratingKey: 'ep-1', thumbFile: 'episodes/ep1.jpg' },
              ],
            },
          ],
        },
      },
    });

    const app = createApp();
    const response = await request(app).get('/api/exports/series/bagshow/details');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=600');
    expect(response.body).toMatchObject({
      title: 'Bag Show',
      ratingKey: 'bagshow',
      seasons: [
        {
          episodes: [
            {
              thumbFile: 'data/exports/series/episodes/ep1.jpg',
            },
          ],
        },
      ],
    });
  });

  it('returns 404 when series details cannot be found', async () => {
    const app = createApp();
    const response = await request(app).get('/api/exports/series/unknown/details');

    expect(response.status).toBe(404);
    expect(response.body.error.message).toBe('Series details not found');
  });
});
