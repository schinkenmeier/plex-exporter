import express from 'express';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, promises as fsPromises } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_PAGE_SIZE } from '@plex-exporter/shared';

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

  it('serves cached search results unless changed or forced', async () => {
    writeJson('movies/movies.json', [
      { title: 'Cache Test Movie', ratingKey: 1 },
    ]);

    const app = createApp();
    const readFileSpy = vi.spyOn(fsPromises, 'readFile');

    const first = await request(app)
      .get('/api/exports/search')
      .query({ kind: 'movie', includeFacets: '0', includeItems: '1' });

    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(1);
    expect(first.body.items[0]).toMatchObject({ title: 'Cache Test Movie', ratingKey: '1' });
    expect(first.body.page).toBe(1);
    expect(first.body.pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(first.body.total).toBe(1);
    expect(readFileSpy.mock.calls.length).toBeGreaterThan(0);

    readFileSpy.mockClear();
    const second = await request(app)
      .get('/api/exports/search')
      .query({ kind: 'movie', includeFacets: '0', includeItems: '1' });

    expect(second.status).toBe(200);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.items[0]).toMatchObject({ title: 'Cache Test Movie', ratingKey: '1' });
    expect(second.body.page).toBe(1);
    expect(second.body.pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(second.body.total).toBe(1);
    expect(readFileSpy).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 20));
    writeJson('movies/movies.json', [
      { title: 'Updated Movie', ratingKey: 2 },
    ]);

    readFileSpy.mockClear();
    const third = await request(app)
      .get('/api/exports/search')
      .query({ kind: 'movie', includeFacets: '0', includeItems: '1' });

    expect(third.status).toBe(200);
    expect(third.body.items[0]).toMatchObject({ title: 'Updated Movie', ratingKey: '2' });
    expect(third.body.total).toBe(1);
    expect(readFileSpy).toHaveBeenCalledTimes(1);

    readFileSpy.mockClear();
    const fourth = await request(app)
      .get('/api/exports/search')
      .query({ kind: 'movie', includeFacets: '0', includeItems: '1', force: '1' });

    expect(fourth.status).toBe(200);
    expect(fourth.body.items[0]).toMatchObject({ title: 'Updated Movie', ratingKey: '2' });
    expect(fourth.body.total).toBe(1);
    expect(readFileSpy).toHaveBeenCalledTimes(1);

    readFileSpy.mockRestore();
  });

  it('supports page and pageSize query parameters for search pagination', async () => {
    writeJson('movies/movies.json', [
      { title: 'Alpha', ratingKey: 1 },
      { title: 'Beta', ratingKey: 2 },
      { title: 'Gamma', ratingKey: 3 },
      { title: 'Delta', ratingKey: 4 },
    ]);

    const app = createApp();
    const response = await request(app)
      .get('/api/exports/search')
      .query({
        kind: 'movie',
        includeFacets: '0',
        includeItems: '1',
        page: '2',
        pageSize: '2',
      });

    expect(response.status).toBe(200);
    expect(response.body.page).toBe(2);
    expect(response.body.pageSize).toBe(2);
    expect(response.body.total).toBe(4);
    expect(response.body.items).toHaveLength(2);
    expect(response.body.items.map((item: { title: string }) => item.title)).toEqual(['Delta', 'Gamma']);
  });

  it('allows offset/limit pagination parameters and validates inputs', async () => {
    writeJson('movies/movies.json', [
      { title: 'Alpha', ratingKey: 1 },
      { title: 'Beta', ratingKey: 2 },
      { title: 'Gamma', ratingKey: 3 },
    ]);

    const app = createApp();
    const response = await request(app)
      .get('/api/exports/search')
      .query({
        kind: 'movie',
        includeFacets: '0',
        includeItems: '1',
        offset: '2',
        limit: '1',
      });

    expect(response.status).toBe(200);
    expect(response.body.page).toBe(3);
    expect(response.body.pageSize).toBe(1);
    expect(response.body.total).toBe(3);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({ title: 'Gamma' });

    const invalid = await request(app)
      .get('/api/exports/search')
      .query({
        kind: 'movie',
        includeFacets: '0',
        includeItems: '1',
        page: '0',
      });

    expect(invalid.status).toBe(400);
    expect(invalid.body.error.message).toBe('Invalid pagination parameter');
  });
});
