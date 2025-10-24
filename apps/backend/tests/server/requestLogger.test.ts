import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createServer } from '../../src/createServer.js';
import type { AppConfig } from '../../src/config/index.js';
import logger from '../../src/services/logger.js';

describe('requestLogger middleware', () => {
  const baseConfig: AppConfig = {
    runtime: { env: 'test' },
    server: { port: 0 },
    auth: null,
    database: { sqlitePath: ':memory:' },
    smtp: null,
    tautulli: null,
  };

  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  it('logs request completion for successful routes', async () => {
    const app = createServer(baseConfig);

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(infoSpy).toHaveBeenCalledWith(
      'Request completed',
      expect.objectContaining({
        method: 'GET',
        path: '/health',
        statusCode: 200,
      }),
    );
  });
});
