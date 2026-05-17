import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createThumbnailRouter } from '../../src/routes/thumbnails.js';

describe('thumbnail routes', () => {
  let tempDir: string;
  let app: express.Express;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plex-exporter-thumbnails-test-'));
    fs.mkdirSync(path.join(tempDir, 'movies', 'nested'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'series'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'covers', 'movie', '1'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'movies', 'nested', 'poster.jpg'), 'movie-poster');
    fs.writeFileSync(path.join(tempDir, 'series', 'poster.jpg'), 'series-poster');
    fs.writeFileSync(path.join(tempDir, 'covers', 'movie', '1', 'poster.jpg'), 'cover-poster');

    app = express();
    app.use('/thumbnails', createThumbnailRouter({ exportsBasePath: tempDir }));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('serves nested movie thumbnails with Express 5 compatible routes', async () => {
    const response = await request(app).get('/thumbnails/movies/nested/poster.jpg');

    expect(response.status).toBe(200);
    expect(response.body.toString('utf8')).toBe('movie-poster');
  });

  it('serves cover thumbnails and rejects traversal attempts', async () => {
    const coverResponse = await request(app).get('/thumbnails/covers/movie/1/poster.jpg');
    expect(coverResponse.status).toBe(200);
    expect(coverResponse.body.toString('utf8')).toBe('cover-poster');

    const traversalResponse = await request(app).get('/thumbnails/covers/%2e%2e%5Csecret.jpg');
    expect(traversalResponse.status).toBe(400);
  });
});
