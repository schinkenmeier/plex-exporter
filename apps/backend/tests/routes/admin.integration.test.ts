import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAdminRouter } from '../../src/routes/admin.js';
import MediaRepository from '../../src/repositories/mediaRepository.js';
import ThumbnailRepository from '../../src/repositories/thumbnailRepository.js';
import SeasonRepository from '../../src/repositories/seasonRepository.js';
import CastRepository from '../../src/repositories/castRepository.js';
import SettingsRepository from '../../src/repositories/settingsRepository.js';
import type { AppConfig } from '../../src/config/index.js';
import type { TmdbManager } from '../../src/services/tmdbManager.js';
import type { HeroPipelineService } from '../../src/services/heroPipeline.js';
import { createTestDatabase, type TestDatabaseHandle } from '../helpers/testDatabase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminUiFixture = path.resolve(__dirname, '..', '..', '..', 'frontend', 'public');

describe('Admin router integration', () => {
  let dbHandle: TestDatabaseHandle;
  let settingsRepository: SettingsRepository;
  let app: express.Express;
  let tmdbManager: TmdbManager;

  beforeEach(() => {
    dbHandle = createTestDatabase();
    settingsRepository = new SettingsRepository(dbHandle.drizzle);

    const testConfig: AppConfig = {
      runtime: { env: 'test' },
      server: { port: 0 },
      auth: null,
      database: { sqlitePath: dbHandle.filePath },
      hero: { policyPath: null },
      tautulli: null,
      tmdb: null,
      admin: null,
      resend: null,
    };

    const mediaRepository = new MediaRepository(dbHandle.drizzle);
    const thumbnailRepository = new ThumbnailRepository(dbHandle.drizzle);
    const seasonRepository = new SeasonRepository(dbHandle.drizzle);
    const castRepository = new CastRepository(dbHandle.drizzle);
    const heroPipeline: HeroPipelineService = {
      getPool: vi.fn(),
      setTmdbService: vi.fn(),
    };

    let tmdbStatus = {
      hasToken: false,
      source: 'unset',
      updatedAt: null,
      tokenPreview: null,
      fromEnv: false,
      fromDatabase: false,
    };

    tmdbManager = {
      getService: vi.fn(() => null),
      getStatus: vi.fn(() => tmdbStatus),
      setDatabaseToken: vi.fn((token: string | null) => {
        if (token) {
          tmdbStatus = {
            hasToken: true,
            source: 'database',
            updatedAt: Date.now(),
            tokenPreview: `${token.slice(0, 4)}…`,
            fromEnv: false,
            fromDatabase: true,
          };
        } else {
          tmdbStatus = {
            hasToken: false,
            source: 'unset',
            updatedAt: null,
            tokenPreview: null,
            fromEnv: false,
            fromDatabase: false,
          };
        }
        return null;
      }),
      testToken: vi.fn(async (token?: string | null) => ({
        success: true as const,
        status: 200,
        message: `tested ${token ?? '[stored]'}`,
        tokenPreview: 'test…token',
        rateLimitRemaining: 10,
      })),
    };

    app = express();
    app.use(express.json());
    app.use(
      '/admin',
      createAdminRouter({
        config: testConfig,
        mediaRepository,
        thumbnailRepository,
        resendService: null,
        tautulliService: null,
        seasonRepository,
        castRepository,
        drizzleDatabase: dbHandle.drizzle,
        settingsRepository,
        tmdbManager,
        heroPipeline,
        adminUiDir: adminUiFixture,
      }),
    );
  });

  afterEach(() => {
    dbHandle.cleanup();
    vi.restoreAllMocks();
  });

  it('lists tables and pages database query results', async () => {
    dbHandle.sqlite.exec(`
      CREATE TABLE sample_table (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      INSERT INTO sample_table (name, created_at) VALUES
        ('Alpha', '2024-01-01T00:00:00Z'),
        ('Beta', '2024-01-02T00:00:00Z'),
        ('Gamma', '2024-01-03T00:00:00Z');
    `);

    const tables = await request(app).get('/admin/api/db/tables');

    expect(tables.status).toBe(200);
    expect(tables.body.tables.some((table: { name: string }) => table.name === 'sample_table')).toBe(true);

    const firstPage = await request(app)
      .post('/admin/api/db/query')
      .send({ table: 'sample_table', limit: 2, offset: 0, orderBy: 'id', direction: 'ASC' });

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.rows).toHaveLength(2);
    expect(firstPage.body.pagination.hasMore).toBe(true);

    const searchResponse = await request(app)
      .post('/admin/api/db/query')
      .send({ table: 'sample_table', search: 'Gamma', limit: 10 });

    expect(searchResponse.status).toBe(200);
    expect(searchResponse.body.rows).toHaveLength(1);
    expect(searchResponse.body.rows[0].name).toBe('Gamma');
  });

  it('stores a TMDb token and executes token tests', async () => {
    const saveResponse = await request(app)
      .post('/admin/api/tmdb')
      .send({ token: 'test-token-123' });

    expect(saveResponse.status).toBe(200);
    expect(tmdbManager.setDatabaseToken).toHaveBeenCalledWith('test-token-123', expect.any(Object));

    const statusResponse = await request(app).get('/admin/api/tmdb');
    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.enabled).toBe(true);
    expect(statusResponse.body.fromDatabase).toBe(true);

    const testResponse = await request(app)
      .post('/admin/api/test/tmdb')
      .send({ token: 'manual-token' });
    expect(testResponse.status).toBe(200);
    expect(tmdbManager.testToken).toHaveBeenCalledWith('manual-token');
  });

  it('exposes status, stats and config endpoints', async () => {
    const statusResponse = await request(app).get('/admin/api/status');
    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body).toHaveProperty('system');

    const statsResponse = await request(app).get('/admin/api/stats');
    expect(statsResponse.status).toBe(200);
    expect(statsResponse.body).toHaveProperty('media');

    const configResponse = await request(app).get('/admin/api/config');
    expect(configResponse.status).toBe(200);
    expect(configResponse.body).toHaveProperty('runtime');
  });
});
