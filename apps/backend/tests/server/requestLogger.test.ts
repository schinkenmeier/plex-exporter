import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createServer } from '../../src/server.js';
import type { AppConfig } from '../../src/config/index.js';
import type MediaRepository from '../../src/repositories/mediaRepository.js';
import type ThumbnailRepository from '../../src/repositories/thumbnailRepository.js';
import type TautulliSnapshotRepository from '../../src/repositories/tautulliSnapshotRepository.js';
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

  const createDependencies = () => ({
    smtpService: null,
    tautulliService: null,
    database: null,
    mediaRepository: {} as unknown as MediaRepository,
    thumbnailRepository: {} as unknown as ThumbnailRepository,
    tautulliSnapshotRepository: {} as unknown as TautulliSnapshotRepository,
  });

  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  it('logs request completion for successful routes', async () => {
    const app = createServer(baseConfig, createDependencies());

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
