import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requestLogger } from '../../src/middleware/errorHandler.js';
import logger from '../../src/services/logger.js';

describe('requestLogger middleware', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  it('logs request completion for successful routes', async () => {
    const app = express();
    app.use(requestLogger);
    app.get('/api/example', (_req, res) => {
      res.json({ ok: true });
    });

    const response = await request(app).get('/api/example');

    expect(response.status).toBe(200);
    expect(infoSpy).toHaveBeenCalledWith(
      'Request completed',
      expect.objectContaining({
        method: 'GET',
        path: '/api/example',
        statusCode: 200,
      }),
    );
  });

  it('redacts sensitive query parameters in logged request paths', async () => {
    const app = express();
    app.use(requestLogger);
    app.get('/api/example', (_req, res) => {
      res.json({ ok: true });
    });

    const response = await request(app).get('/api/example?apiKey=secret&q=visible');

    expect(response.status).toBe(200);
    expect(infoSpy).toHaveBeenCalledWith(
      'Request completed',
      expect.objectContaining({
        method: 'GET',
        path: expect.stringContaining('apiKey='),
        statusCode: 200,
      }),
    );
    expect(infoSpy.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        path: expect.not.stringContaining('secret'),
      }),
    );
    expect(infoSpy.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        path: expect.stringContaining('q=visible'),
      }),
    );
  });

  it('redacts multiple sensitive query parameter variants in logged request paths', async () => {
    const app = express();
    app.use(requestLogger);
    app.get('/api/example', (_req, res) => {
      res.json({ ok: true });
    });

    const response = await request(app).get(
      '/api/example?token=top-secret&authorization=Bearer%20top-secret&password=top-secret&safe=visible',
    );

    expect(response.status).toBe(200);
    const context = infoSpy.mock.calls[0]?.[1];
    expect(context).toEqual(
      expect.objectContaining({
        method: 'GET',
        statusCode: 200,
        path: expect.stringContaining('safe=visible'),
      }),
    );
    expect(context).toEqual(
      expect.objectContaining({
        path: expect.not.stringContaining('top-secret'),
      }),
    );
    expect(context).toEqual(
      expect.objectContaining({
        path: expect.stringContaining('token='),
      }),
    );
    expect(context).toEqual(
      expect.objectContaining({
        path: expect.stringContaining('authorization='),
      }),
    );
    expect(context).toEqual(
      expect.objectContaining({
        path: expect.stringContaining('password='),
      }),
    );
  });

  it('skips successful noisy polling and health routes', async () => {
    const app = express();
    app.use(requestLogger);
    app.get('/health', (_req, res) => {
      res.json({ status: 'ok' });
    });
    app.get('/dist/main.js', (_req, res) => {
      res.type('application/javascript').send('export default {}');
    });
    app.get('/admin/api/logs', (_req, res) => {
      res.json({ logs: [] });
    });
    app.get('/admin/api/tautulli/sync/live/state', (_req, res) => {
      res.json({ activeRun: null });
    });
    app.get('/admin/api/tautulli/sync/live/stream', (_req, res) => {
      res.type('text/event-stream').send('event: ping\n\n');
    });

    await request(app).get('/health');
    await request(app).get('/dist/main.js?cacheBust=1');
    await request(app).get('/admin/api/logs?limit=100');
    await request(app).get('/admin/api/tautulli/sync/live/state');
    await request(app).get('/admin/api/tautulli/sync/live/stream');

    expect(infoSpy).not.toHaveBeenCalled();
  });

  it('still logs failed noisy routes', async () => {
    const app = express();
    app.use(requestLogger);
    app.get('/health', (_req, res) => {
      res.status(500).json({ status: 'error' });
    });
    app.get('/dist/main.js', (_req, res) => {
      res.sendStatus(404);
    });
    app.get('/admin/api/tautulli/sync/live/stream', (_req, res) => {
      res.sendStatus(503);
    });

    const healthResponse = await request(app).get('/health');
    const distResponse = await request(app).get('/dist/main.js');
    const streamResponse = await request(app).get('/admin/api/tautulli/sync/live/stream');

    expect(healthResponse.status).toBe(500);
    expect(distResponse.status).toBe(404);
    expect(streamResponse.status).toBe(503);
    expect(infoSpy).toHaveBeenCalledWith(
      'Request completed',
      expect.objectContaining({
        method: 'GET',
        path: '/health',
        statusCode: 500,
      }),
    );
    expect(infoSpy).toHaveBeenCalledWith(
      'Request completed',
      expect.objectContaining({
        method: 'GET',
        path: '/dist/main.js',
        statusCode: 404,
      }),
    );
    expect(infoSpy).toHaveBeenCalledWith(
      'Request completed',
      expect.objectContaining({
        method: 'GET',
        path: '/admin/api/tautulli/sync/live/stream',
        statusCode: 503,
      }),
    );
  });
});
