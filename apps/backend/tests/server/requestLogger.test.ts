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

  it('skips successful noisy polling and health routes', async () => {
    const app = express();
    app.use(requestLogger);
    app.get('/health', (_req, res) => {
      res.json({ status: 'ok' });
    });
    app.get('/admin/api/logs', (_req, res) => {
      res.json({ logs: [] });
    });
    app.get('/admin/api/tautulli/sync/live/state', (_req, res) => {
      res.json({ activeRun: null });
    });

    await request(app).get('/health');
    await request(app).get('/admin/api/logs?limit=100');
    await request(app).get('/admin/api/tautulli/sync/live/state');

    expect(infoSpy).not.toHaveBeenCalled();
  });

  it('still logs failed noisy routes', async () => {
    const app = express();
    app.use(requestLogger);
    app.get('/health', (_req, res) => {
      res.status(500).json({ status: 'error' });
    });

    const response = await request(app).get('/health');

    expect(response.status).toBe(500);
    expect(infoSpy).toHaveBeenCalledWith(
      'Request completed',
      expect.objectContaining({
        method: 'GET',
        path: '/health',
        statusCode: 500,
      }),
    );
  });
});
