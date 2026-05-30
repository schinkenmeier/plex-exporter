import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('proxies Tautulli thumbnails through the public service method', async () => {
    const fetchLibraryImage = vi.fn().mockResolvedValue({
      data: Buffer.from('proxied-image'),
      headers: { 'content-type': 'image/png' },
    });
    const proxyApp = express();
    proxyApp.use(
      '/thumbnails',
      createThumbnailRouter({
        exportsBasePath: tempDir,
        tautulliService: { fetchLibraryImage } as any,
      }),
    );

    const response = await request(proxyApp).get('/thumbnails/tautulli/library/metadata/123/thumb/456');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('image/png');
    expect(response.body.toString('utf8')).toBe('proxied-image');
    expect(fetchLibraryImage).toHaveBeenCalledWith('123', 'thumb', '456');
  });

  it('validates Tautulli proxy parameters and reports upstream failures', async () => {
    const fetchLibraryImage = vi.fn().mockRejectedValue(new Error('upstream failed'));
    const proxyApp = express();
    proxyApp.use(
      '/thumbnails',
      createThumbnailRouter({
        exportsBasePath: tempDir,
        tautulliService: { fetchLibraryImage } as any,
      }),
    );

    const invalidResponse = await request(proxyApp).get('/thumbnails/tautulli/library/metadata/123/banner/456');
    expect(invalidResponse.status).toBe(400);
    expect(fetchLibraryImage).not.toHaveBeenCalled();

    const upstreamResponse = await request(proxyApp).get('/thumbnails/tautulli/library/metadata/123/art/456');
    expect(upstreamResponse.status).toBe(502);
    expect(upstreamResponse.body.error).toBe('Failed to fetch image from Tautulli');
  });

  it('keeps the Tautulli proxy available without a local exports path', async () => {
    const missingRoot = path.join(tempDir, 'missing-root');
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(missingRoot);
    const fetchLibraryImage = vi.fn().mockResolvedValue({
      data: Buffer.from('proxied-without-local-path'),
      headers: { 'content-type': 'image/jpeg' },
    });
    const proxyApp = express();
    proxyApp.use(
      '/thumbnails',
      createThumbnailRouter({
        exportsBasePath: missingRoot,
        tautulliService: { fetchLibraryImage } as any,
      }),
    );

    const proxyResponse = await request(proxyApp).get('/thumbnails/tautulli/library/metadata/123/thumb/456');
    expect(proxyResponse.status).toBe(200);
    expect(proxyResponse.body.toString('utf8')).toBe('proxied-without-local-path');

    const localResponse = await request(proxyApp).get('/thumbnails/movies/poster.jpg');
    expect(localResponse.status).toBe(503);

    cwdSpy.mockRestore();
  });
});
