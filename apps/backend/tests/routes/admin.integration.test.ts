import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAdminRouter } from '../../src/routes/admin.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import MediaRepository from '../../src/repositories/mediaRepository.js';
import ThumbnailRepository from '../../src/repositories/thumbnailRepository.js';
import SeasonRepository from '../../src/repositories/seasonRepository.js';
import CastRepository from '../../src/repositories/castRepository.js';
import SettingsRepository from '../../src/repositories/settingsRepository.js';
import { TautulliConfigRepository } from '../../src/repositories/tautulliConfigRepository.js';
import WatchlistRequestRepository from '../../src/repositories/watchlistRequestRepository.js';
import type { AppConfig } from '../../src/config/index.js';
import type { TmdbManager } from '../../src/services/tmdbManager.js';
import type { MailSender } from '../../src/services/resendService.js';
import type { HeroPipelineService } from '../../src/services/heroPipeline.js';
import { watchlistEmailService } from '../../src/services/watchlistEmailService.js';
import { logBuffer } from '../../src/services/logBuffer.js';
import { createTestDatabase, type TestDatabaseHandle } from '../helpers/testDatabase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminUiFixture = path.resolve(__dirname, '..', '..', '..', 'frontend', 'public');

describe('Admin router integration', () => {
  let dbHandle: TestDatabaseHandle;
  let settingsRepository: SettingsRepository;
  let tautulliConfigRepository: TautulliConfigRepository;
  let watchlistRequestRepository: WatchlistRequestRepository;
  let refreshTautulliIntegration: ReturnType<typeof vi.fn>;
  let activeResendService: MailSender | null;
  let refreshResendIntegration: ReturnType<typeof vi.fn>;
  let app: express.Express;
  let tmdbManager: TmdbManager;

  beforeEach(() => {
    dbHandle = createTestDatabase();
    settingsRepository = new SettingsRepository(dbHandle.drizzle);
    tautulliConfigRepository = new TautulliConfigRepository(dbHandle.drizzle);
    watchlistRequestRepository = new WatchlistRequestRepository(dbHandle.drizzle);
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
      runtime: { env: 'test', adminUiMode: 'embedded' },
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
        watchlistRequestRepository,
        tmdbManager,
        heroPipeline,
        refreshTautulliIntegration,
        refreshResendIntegration,
        adminUiDir: adminUiFixture,
      }),
    );
    app.use(errorHandler);
  });

  afterEach(() => {
    watchlistEmailService.setMailSender(null);
    logBuffer.clear();
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
    expect(unavailableResponse.body.error).toEqual(expect.objectContaining({
      message: 'Resend service is not configured',
      statusCode: 503,
    }));
    expect(unavailableResponse.body.meta).toEqual(expect.objectContaining({
      path: '/admin/api/test/resend',
      method: 'POST',
    }));

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
      runtime: { env: 'test', adminUiMode: 'embedded' },
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
        watchlistRequestRepository,
        tmdbManager,
        heroPipeline,
        refreshTautulliIntegration,
        refreshResendIntegration: refreshEnvResendIntegration,
        adminUiDir: adminUiFixture,
      }),
    );
    envApp.use(errorHandler);

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
    expect(configResponse.body).toHaveProperty('tautulli');
    expect(configResponse.body.tautulli).toEqual(expect.objectContaining({
      enabled: false,
      source: 'unset',
      activeSource: 'unset',
      fromEnv: false,
      envOverride: false,
      saved: expect.any(Object),
    }));
    expect(configResponse.body.tmdb).toEqual(expect.objectContaining({
      enabled: false,
      fromEnv: false,
      fromDatabase: false,
      envOverride: false,
      saved: expect.any(Object),
    }));
    expect(configResponse.body.resend).toEqual(expect.objectContaining({
      enabled: false,
      source: 'unset',
      fromEnv: false,
      fromDatabase: false,
      envOverride: false,
      saved: expect.any(Object),
    }));
  });

  it('exposes and clears buffered logs', async () => {
    logBuffer.add({
      timestamp: '2026-01-01T00:00:00.000Z',
      level: 'info',
      message: 'first admin log',
    });
    logBuffer.add({
      timestamp: '2026-01-01T00:00:01.000Z',
      level: 'error',
      message: 'second admin log',
    });

    const filteredResponse = await request(app).get('/admin/api/logs?level=error&limit=10');
    expect(filteredResponse.status).toBe(200);
    expect(filteredResponse.body.logs).toHaveLength(1);
    expect(filteredResponse.body.logs[0].message).toBe('second admin log');
    expect(filteredResponse.body.stats.total).toBe(2);

    const clearResponse = await request(app).delete('/admin/api/logs');
    expect(clearResponse.status).toBe(200);
    expect(clearResponse.body).toEqual({ success: true, message: 'System logs cleared' });

    const emptyResponse = await request(app).get('/admin/api/logs');
    expect(emptyResponse.status).toBe(200);
    expect(emptyResponse.body.logs).toEqual([]);
    expect(emptyResponse.body.stats.total).toBe(0);
  });

  it('stores and clears the watchlist admin email', async () => {
    const initialResponse = await request(app).get('/admin/api/watchlist/admin-email');
    expect(initialResponse.status).toBe(200);
    expect(initialResponse.body).toEqual({
      success: true,
      adminEmail: null,
      updatedAt: null,
    });

    const saveResponse = await request(app)
      .put('/admin/api/watchlist/admin-email')
      .send({ adminEmail: 'watchlist-admin@example.test' });
    expect(saveResponse.status).toBe(200);
    expect(saveResponse.body).toEqual({
      success: true,
      message: 'Watchlist admin email updated successfully',
    });

    const configuredResponse = await request(app).get('/admin/api/watchlist/admin-email');
    expect(configuredResponse.status).toBe(200);
    expect(configuredResponse.body.adminEmail).toBe('watchlist-admin@example.test');
    expect(configuredResponse.body.updatedAt).toEqual(expect.any(Number));

    const clearResponse = await request(app).delete('/admin/api/watchlist/admin-email');
    expect(clearResponse.status).toBe(200);
    expect(clearResponse.body).toEqual({
      success: true,
      message: 'Watchlist admin email cleared successfully',
    });

    const clearedResponse = await request(app).get('/admin/api/watchlist/admin-email');
    expect(clearedResponse.status).toBe(200);
    expect(clearedResponse.body.adminEmail).toBeNull();
    expect(clearedResponse.body.updatedAt).toBeNull();
  });

  it('manages watchlist request lifecycle and sends replies', async () => {
    const requestRecord = watchlistRequestRepository.create({
      requesterEmail: 'user@example.test',
      items: [
        {
          title: 'Example Movie',
          type: 'movie',
          year: 2026,
          summary: 'Please add this',
          poster: null,
        },
      ],
      message: 'Danke',
    });

    const listResponse = await request(app).get('/admin/api/watchlist/requests');
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.requests).toHaveLength(1);
    expect(listResponse.body.requests[0]).toEqual(expect.objectContaining({
      id: requestRecord.id,
      requesterEmail: 'user@example.test',
      status: 'new',
    }));

    const filteredResponse = await request(app).get('/admin/api/watchlist/requests?status=done');
    expect(filteredResponse.status).toBe(200);
    expect(filteredResponse.body.requests).toEqual([]);

    const statusResponse = await request(app)
      .patch(`/admin/api/watchlist/requests/${requestRecord.id}/status`)
      .send({ status: 'in_progress' });
    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.request.status).toBe('in_progress');

    const noteResponse = await request(app)
      .patch(`/admin/api/watchlist/requests/${requestRecord.id}/note`)
      .send({ adminNote: 'Prüfen, ob verfügbar.' });
    expect(noteResponse.status).toBe(200);
    expect(noteResponse.body.request.adminNote).toBe('Prüfen, ob verfügbar.');

    const sender: MailSender = {
      sendMail: vi.fn(async payload => ({
        id: 'reply-email-1',
        from: 'plex@example.test',
        to: Array.isArray(payload.to) ? payload.to : [payload.to],
        created_at: '2026-05-30T00:00:00.000Z',
      })),
    };
    watchlistEmailService.setMailSender(sender);

    const replyResponse = await request(app)
      .post(`/admin/api/watchlist/requests/${requestRecord.id}/reply`)
      .send({
        subject: 'Kann ich machen',
        message: 'Ist in Arbeit.',
        status: 'done',
      });
    expect(replyResponse.status).toBe(200);
    expect(replyResponse.body.emailId).toBe('reply-email-1');
    expect(replyResponse.body.request.status).toBe('done');
    expect(replyResponse.body.request.lastResponseEmailId).toBe('reply-email-1');
    expect(sender.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'user@example.test',
      subject: 'Kann ich machen',
      text: 'Ist in Arbeit.',
    }));

    const detailsResponse = await request(app).get(`/admin/api/watchlist/requests/${requestRecord.id}`);
    expect(detailsResponse.status).toBe(200);
    expect(detailsResponse.body.events.map((event: { type: string }) => event.type)).toEqual(
      expect.arrayContaining(['created', 'status_changed', 'note_updated', 'reply_sent']),
    );
  });

  it('tests database connectivity through the admin test endpoint', async () => {
    const response = await request(app).post('/admin/api/test/database');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: 'Database connection successful',
      recordCount: 0,
    });
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
      runtime: { env: 'test', adminUiMode: 'embedded' },
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
        watchlistRequestRepository,
        tmdbManager,
        heroPipeline,
        refreshTautulliIntegration,
        adminUiDir: adminUiFixture,
      }),
    );
    envApp.use(errorHandler);

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
