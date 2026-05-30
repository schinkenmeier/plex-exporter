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
import { TautulliConfigRepository } from '../../src/repositories/tautulliConfigRepository.js';
import type { AppConfig } from '../../src/config/index.js';
import type { TmdbManager } from '../../src/services/tmdbManager.js';
import type { MailSender } from '../../src/services/resendService.js';
import type { HeroPipelineService } from '../../src/services/heroPipeline.js';
import { createTestDatabase, type TestDatabaseHandle } from '../helpers/testDatabase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminUiFixture = path.resolve(__dirname, '..', '..', '..', 'frontend', 'public');

describe('Admin router integration', () => {
  let dbHandle: TestDatabaseHandle;
  let settingsRepository: SettingsRepository;
  let tautulliConfigRepository: TautulliConfigRepository;
  let refreshTautulliIntegration: ReturnType<typeof vi.fn>;
  let activeResendService: MailSender | null;
  let refreshResendIntegration: ReturnType<typeof vi.fn>;
  let app: express.Express;
  let tmdbManager: TmdbManager;

  beforeEach(() => {
    dbHandle = createTestDatabase();
    settingsRepository = new SettingsRepository(dbHandle.drizzle);
    tautulliConfigRepository = new TautulliConfigRepository(dbHandle.drizzle);
    refreshTautulliIntegration = vi.fn();
    activeResendService = null;
    refreshResendIntegration = vi.fn(() => {
      const apiKey = settingsRepository.get('resend.apiKey')?.value;
      const fromEmail = settingsRepository.get('resend.fromEmail')?.value;
      activeResendService = apiKey && fromEmail
        ? {
            sendMail: vi.fn(async payload => ({
              id: `sent-${Array.isArray(payload.to) ? payload.to[0] : payload.to}`,
              from: fromEmail,
              to: Array.isArray(payload.to) ? payload.to : [payload.to],
              created_at: new Date().toISOString(),
            })),
          }
        : null;
      return activeResendService;
    });

    const testConfig: AppConfig = {
      runtime: { env: 'test' },
      server: { port: 0 },
      auth: null,
      database: { sqlitePath: dbHandle.filePath },
      hero: { policyPath: null },
      scheduler: { timezone: 'Europe/Berlin' },
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
      invalidate: vi.fn(),
      setTmdbService: vi.fn(),
    };

    let tmdbStatus = {
      hasToken: false,
      source: 'unset',
      updatedAt: null,
      tokenPreview: null,
      fromEnv: false,
      fromDatabase: false,
      envOverride: false,
      saved: {
        tokenPreview: null,
        updatedAt: null,
      },
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
            envOverride: false,
            saved: {
              tokenPreview: `${token.slice(0, 4)}…`,
              updatedAt: Date.now(),
            },
          };
        } else {
          tmdbStatus = {
            hasToken: false,
            source: 'unset',
            updatedAt: null,
            tokenPreview: null,
            fromEnv: false,
            fromDatabase: false,
            envOverride: false,
            saved: {
              tokenPreview: null,
              updatedAt: null,
            },
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
        getResendService: () => activeResendService,
        tautulliService: null,
        seasonRepository,
        castRepository,
        drizzleDatabase: dbHandle.drizzle,
        settingsRepository,
        tautulliConfigRepository,
        tmdbManager,
        heroPipeline,
        refreshTautulliIntegration,
        refreshResendIntegration,
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

  it('refreshes the active Resend sender when settings are saved and cleared', async () => {
    const unavailableResponse = await request(app)
      .post('/admin/api/test/resend')
      .send({ to: 'before@example.test' });
    expect(unavailableResponse.status).toBe(503);

    const saveResponse = await request(app)
      .put('/admin/api/resend/settings')
      .send({
        apiKey: 're_db_token',
        fromEmail: 'plex@example.test',
      });

    expect(saveResponse.status).toBe(200);
    expect(refreshResendIntegration).toHaveBeenCalledTimes(1);
    expect(saveResponse.body.enabled).toBe(true);
    expect(saveResponse.body.status.source).toBe('database');

    const sendResponse = await request(app)
      .post('/admin/api/test/resend')
      .send({ to: 'after@example.test' });

    expect(sendResponse.status).toBe(200);
    expect(sendResponse.body.from).toBe('plex@example.test');
    expect(activeResendService?.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'after@example.test',
    }));

    const deleteResponse = await request(app).delete('/admin/api/resend/settings');
    expect(deleteResponse.status).toBe(200);
    expect(refreshResendIntegration).toHaveBeenCalledTimes(2);
    expect(deleteResponse.body.enabled).toBe(false);
    expect(deleteResponse.body.status.source).toBe('unset');

    const disabledResponse = await request(app)
      .post('/admin/api/test/resend')
      .send({ to: 'after-clear@example.test' });
    expect(disabledResponse.status).toBe(503);
  });

  it('keeps environment Resend configuration active when database settings are saved or cleared', async () => {
    const envConfig: AppConfig = {
      runtime: { env: 'test' },
      server: { port: 0 },
      auth: null,
      database: { sqlitePath: dbHandle.filePath },
      hero: { policyPath: null },
      scheduler: { timezone: 'Europe/Berlin' },
      tautulli: null,
      tmdb: null,
      admin: null,
      resend: {
        apiKey: 're_env_token',
        fromEmail: 'env@example.test',
      },
    };
    const mediaRepository = new MediaRepository(dbHandle.drizzle);
    const thumbnailRepository = new ThumbnailRepository(dbHandle.drizzle);
    const seasonRepository = new SeasonRepository(dbHandle.drizzle);
    const castRepository = new CastRepository(dbHandle.drizzle);
    const heroPipeline: HeroPipelineService = {
      getPool: vi.fn(),
      invalidate: vi.fn(),
      setTmdbService: vi.fn(),
    };
    let envResendService: MailSender | null = {
      sendMail: vi.fn(async payload => ({
        id: 'env-sent',
        from: 'env@example.test',
        to: Array.isArray(payload.to) ? payload.to : [payload.to],
        created_at: new Date().toISOString(),
      })),
    };
    const refreshEnvResendIntegration = vi.fn(() => {
      envResendService = envConfig.resend
        ? {
            sendMail: vi.fn(async payload => ({
              id: 'env-sent',
              from: envConfig.resend?.fromEmail,
              to: Array.isArray(payload.to) ? payload.to : [payload.to],
              created_at: new Date().toISOString(),
            })),
          }
        : null;
      return envResendService;
    });
    const envApp = express();
    envApp.use(express.json());
    envApp.use(
      '/admin',
      createAdminRouter({
        config: envConfig,
        mediaRepository,
        thumbnailRepository,
        resendService: envResendService,
        getResendService: () => envResendService,
        tautulliService: null,
        seasonRepository,
        castRepository,
        drizzleDatabase: dbHandle.drizzle,
        settingsRepository,
        tautulliConfigRepository,
        tmdbManager,
        heroPipeline,
        refreshTautulliIntegration,
        refreshResendIntegration: refreshEnvResendIntegration,
        adminUiDir: adminUiFixture,
      }),
    );

    const saveResponse = await request(envApp)
      .put('/admin/api/resend/settings')
      .send({
        apiKey: 're_db_token',
        fromEmail: 'db@example.test',
      });

    expect(saveResponse.status).toBe(200);
    expect(saveResponse.body.status.source).toBe('environment');
    expect(saveResponse.body.status.envOverride).toBe(true);
    expect(saveResponse.body.message).toMatch(/Environment configuration remains active/);

    const sendResponse = await request(envApp)
      .post('/admin/api/test/resend')
      .send({ to: 'recipient@example.test' });
    expect(sendResponse.status).toBe(200);
    expect(sendResponse.body.from).toBe('env@example.test');

    const deleteResponse = await request(envApp).delete('/admin/api/resend/settings');
    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.enabled).toBe(true);
    expect(deleteResponse.body.status.source).toBe('environment');
    expect(deleteResponse.body.message).toMatch(/Environment configuration remains active/);
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

  it('delegates legacy Tautulli settings endpoint to canonical config table', async () => {
    const saveResponse = await request(app)
      .put('/admin/api/tautulli/settings')
      .send({
        url: 'https://tautulli.example.test/api/v2',
        apiKey: 'tautulli-secret',
      });

    expect(saveResponse.status).toBe(200);
    expect(saveResponse.body.message).not.toMatch(/restart/i);
    expect(refreshTautulliIntegration).toHaveBeenCalledWith({
      baseUrl: 'https://tautulli.example.test',
      apiKey: 'tautulli-secret',
    });

    expect(settingsRepository.get('tautulli.url')).toBeNull();
    expect(settingsRepository.get('tautulli.apiKey')).toBeNull();

    const stored = tautulliConfigRepository.get();
    expect(stored?.tautulliUrl).toBe('https://tautulli.example.test');
    expect(stored?.apiKey).toBe('tautulli-secret');

    const getResponse = await request(app).get('/admin/api/tautulli/settings');
    expect(getResponse.status).toBe(200);
    expect(getResponse.body.source).toBe('tautulli_config');
    expect(getResponse.body.settings.url).toBe('https://tautulli.example.test');

    const deleteResponse = await request(app).delete('/admin/api/tautulli/settings');
    expect(deleteResponse.status).toBe(200);
    expect(tautulliConfigRepository.get()).toBeUndefined();
    expect(refreshTautulliIntegration).toHaveBeenCalledTimes(2);
  });

  it('reports environment Tautulli configuration as the active source when DB settings are saved', async () => {
    const envConfig: AppConfig = {
      runtime: { env: 'test' },
      server: { port: 0 },
      auth: null,
      database: { sqlitePath: dbHandle.filePath },
      hero: { policyPath: null },
      scheduler: { timezone: 'Europe/Berlin' },
      tautulli: {
        url: 'https://env-tautulli.example.test',
        apiKey: 'env-secret',
      },
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
      invalidate: vi.fn(),
      setTmdbService: vi.fn(),
    };
    const envApp = express();
    envApp.use(express.json());
    envApp.use(
      '/admin',
      createAdminRouter({
        config: envConfig,
        mediaRepository,
        thumbnailRepository,
        resendService: null,
        tautulliService: null,
        seasonRepository,
        castRepository,
        drizzleDatabase: dbHandle.drizzle,
        settingsRepository,
        tautulliConfigRepository,
        tmdbManager,
        heroPipeline,
        refreshTautulliIntegration,
        adminUiDir: adminUiFixture,
      }),
    );

    const saveResponse = await request(envApp)
      .put('/admin/api/tautulli/settings')
      .send({
        url: 'https://db-tautulli.example.test',
        apiKey: 'db-secret',
      });

    expect(saveResponse.status).toBe(200);
    expect(saveResponse.body.activeSource).toBe('env');
    expect(saveResponse.body.envOverride).toBe(true);
    expect(saveResponse.body.message).toMatch(/Environment configuration remains active/);

    const configResponse = await request(envApp).get('/admin/api/config');
    expect(configResponse.status).toBe(200);
    expect(configResponse.body.tautulli.activeSource).toBe('env');
    expect(configResponse.body.tautulli.envOverride).toBe(true);
    expect(configResponse.body.tautulli.saved.source).toBe('tautulli_config');
  });
});
