import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTautulliSyncRouter } from '../../src/routes/tautulliSync.js';
import { LibrarySectionRepository } from '../../src/repositories/librarySectionRepository.js';
import { SyncScheduleRepository } from '../../src/repositories/syncScheduleRepository.js';
import { TautulliConfigRepository } from '../../src/repositories/tautulliConfigRepository.js';
import SettingsRepository from '../../src/repositories/settingsRepository.js';
import TautulliSnapshotRepository from '../../src/repositories/tautulliSnapshotRepository.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { SyncLiveMonitor } from '../../src/services/syncLiveMonitor.js';
import { createTestDatabase, type TestDatabaseHandle } from '../helpers/testDatabase.js';

describe('Tautulli sync integration', () => {
  let dbHandle: TestDatabaseHandle;
  let app: express.Express;
  let syncService: { syncAll: ReturnType<typeof vi.fn> };
  let syncLiveMonitor: SyncLiveMonitor;
  let tautulliConfigRepo: TautulliConfigRepository;
  let settingsRepository: SettingsRepository;

  beforeEach(() => {
    dbHandle = createTestDatabase();
    const librarySectionRepo = new LibrarySectionRepository(dbHandle.drizzle);
    const syncScheduleRepo = new SyncScheduleRepository(dbHandle.drizzle);
    tautulliConfigRepo = new TautulliConfigRepository(dbHandle.drizzle);
    settingsRepository = new SettingsRepository(dbHandle.drizzle);
    const snapshotRepository = new TautulliSnapshotRepository(dbHandle.drizzle);
    syncLiveMonitor = new SyncLiveMonitor();

    syncService = {
      syncAll: vi.fn().mockResolvedValue({}),
    };

    const schedulerMock = {
      isActive: () => false,
      reload: vi.fn(),
    };

    app = express();
    app.use(express.json());
    app.use(
      '/admin/api/tautulli',
      createTautulliSyncRouter({
        getTautulliService: () => null,
        getTautulliSyncService: () => syncService as any,
        librarySectionRepo,
        syncScheduleRepo,
        tautulliConfigRepo,
        getSchedulerService: () => schedulerMock as any,
        refreshTautulliIntegration: () => {},
        getTautulliConfigStatus: () => ({
          configured: true,
          source: 'tautulli_config',
          activeSource: 'tautulli_config',
          fromEnv: false,
          envOverride: false,
          tautulliUrl: 'https://tautulli.example.test',
          hasApiKey: true,
          saved: {
            source: 'tautulli_config',
            tautulliUrl: 'https://tautulli.example.test',
            hasApiKey: true,
          },
        }),
        settingsRepository,
        tautulliSnapshotRepository: snapshotRepository,
        syncLiveMonitor,
      }),
    );
    app.use(errorHandler);
  });

  afterEach(() => {
    dbHandle.cleanup();
    vi.restoreAllMocks();
  });

  it('triggers a manual sync with provided options', async () => {
    const response = await request(app)
      .post('/admin/api/tautulli/sync/manual')
      .send({ incremental: true, syncCovers: false, enrichWithTmdb: false });

    expect(response.status).toBe(200);
    expect(syncService.syncAll).toHaveBeenCalledWith(
      expect.objectContaining({ incremental: true, syncCovers: false, enrichWithTmdb: false }),
      expect.any(Function),
    );
  });

  it('returns unified Tautulli configuration status', async () => {
    const response = await request(app).get('/admin/api/tautulli/config');

    expect(response.status).toBe(200);
    expect(response.body.configured).toBe(true);
    expect(response.body.activeSource).toBe('tautulli_config');
    expect(response.body.saved.source).toBe('tautulli_config');
  });

  it('clears legacy Tautulli settings when saving canonical config', async () => {
    settingsRepository.set('tautulli.url', 'https://legacy-tautulli.example.test');
    settingsRepository.set('tautulli.apiKey', 'legacy-secret');

    const response = await request(app)
      .post('/admin/api/tautulli/config')
      .send({
        tautulliUrl: 'https://canonical-tautulli.example.test/api/v2',
        apiKey: 'canonical-secret',
      });

    expect(response.status).toBe(200);
    expect(tautulliConfigRepo.get()?.tautulliUrl).toBe('https://canonical-tautulli.example.test');
    expect(settingsRepository.get('tautulli.url')).toBeNull();
    expect(settingsRepository.get('tautulli.apiKey')).toBeNull();
  });

  it('keeps legacy Tautulli settings when saving canonical config cannot refresh runtime', async () => {
    settingsRepository.set('tautulli.url', 'https://legacy-tautulli.example.test');
    settingsRepository.set('tautulli.apiKey', 'legacy-secret');

    const failingApp = express();
    failingApp.use(express.json());
    failingApp.use(
      '/admin/api/tautulli',
      createTautulliSyncRouter({
        getTautulliService: () => null,
        getTautulliSyncService: () => syncService as any,
        librarySectionRepo: new LibrarySectionRepository(dbHandle.drizzle),
        syncScheduleRepo: new SyncScheduleRepository(dbHandle.drizzle),
        tautulliConfigRepo,
        getSchedulerService: () => null,
        refreshTautulliIntegration: () => {
          throw new Error('refresh failed');
        },
        settingsRepository,
        tautulliSnapshotRepository: new TautulliSnapshotRepository(dbHandle.drizzle),
        syncLiveMonitor,
      }),
    );
    failingApp.use(errorHandler);

    const response = await request(failingApp)
      .post('/admin/api/tautulli/config')
      .send({
        tautulliUrl: 'https://canonical-tautulli.example.test',
        apiKey: 'canonical-secret',
      });

    expect(response.status).toBe(500);
    expect(tautulliConfigRepo.get()?.tautulliUrl).toBe('https://canonical-tautulli.example.test');
    expect(settingsRepository.get('tautulli.url')?.value).toBe('https://legacy-tautulli.example.test');
    expect(settingsRepository.get('tautulli.apiKey')?.value).toBe('legacy-secret');
  });

  it('tests the active runtime service when no form credentials are supplied', async () => {
    const getLibraries = vi.fn(async () => [
      { section_id: 1, section_name: 'Movies', friendly_name: 'Movies' },
    ]);
    const activeApp = express();
    activeApp.use(express.json());
    activeApp.use(
      '/admin/api/tautulli',
      createTautulliSyncRouter({
        getTautulliService: () => ({ getLibraries }) as any,
        getTautulliSyncService: () => syncService as any,
        librarySectionRepo: new LibrarySectionRepository(dbHandle.drizzle),
        syncScheduleRepo: new SyncScheduleRepository(dbHandle.drizzle),
        tautulliConfigRepo,
        getSchedulerService: () => null,
        refreshTautulliIntegration: vi.fn(),
        settingsRepository,
        tautulliSnapshotRepository: new TautulliSnapshotRepository(dbHandle.drizzle),
        syncLiveMonitor,
      }),
    );
    activeApp.use(errorHandler);

    const response = await request(activeApp).post('/admin/api/tautulli/config/test').send({});

    expect(response.status).toBe(200);
    expect(response.body.libraryCount).toBe(1);
    expect(getLibraries).toHaveBeenCalledTimes(1);
  });

  it('returns a clear error when testing without credentials and no config exists', async () => {
    const refreshTautulliIntegration = vi.fn();
    const unconfiguredApp = express();
    unconfiguredApp.use(express.json());
    unconfiguredApp.use(
      '/admin/api/tautulli',
      createTautulliSyncRouter({
        getTautulliService: () => null,
        getTautulliSyncService: () => syncService as any,
        librarySectionRepo: new LibrarySectionRepository(dbHandle.drizzle),
        syncScheduleRepo: new SyncScheduleRepository(dbHandle.drizzle),
        tautulliConfigRepo,
        getSchedulerService: () => null,
        refreshTautulliIntegration,
        settingsRepository,
        tautulliSnapshotRepository: new TautulliSnapshotRepository(dbHandle.drizzle),
        syncLiveMonitor,
      }),
    );
    unconfiguredApp.use(errorHandler);

    const response = await request(unconfiguredApp).post('/admin/api/tautulli/config/test').send({});

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe('No configuration provided and no active or saved configuration found');
    expect(refreshTautulliIntegration).not.toHaveBeenCalled();
  });

  it('blocks a second manual sync while one run is active and exposes live state', async () => {
    let resolveSync: ((value: unknown) => void) | null = null;
    syncService.syncAll.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSync = resolve;
        }),
    );

    const firstResponse = await request(app)
      .post('/admin/api/tautulli/sync/manual')
      .send({ incremental: false, syncCovers: true, enrichWithTmdb: true });

    expect(firstResponse.status).toBe(200);

    const secondResponse = await request(app)
      .post('/admin/api/tautulli/sync/manual')
      .send({ incremental: false, syncCovers: true, enrichWithTmdb: true });

    expect(secondResponse.status).toBe(409);

    const liveStateWhileRunning = await request(app).get('/admin/api/tautulli/sync/live/state');
    expect(liveStateWhileRunning.status).toBe(200);
    expect(liveStateWhileRunning.body.activeRun).toBeTruthy();
    expect(Array.isArray(liveStateWhileRunning.body.events)).toBe(true);

    resolveSync?.({
      totalCreated: 1,
      totalUpdated: 2,
      totalDeleted: 0,
      totalSkipped: 0,
      totalErrors: 0,
      results: [],
      startTime: Date.now() - 1000,
      endTime: Date.now(),
      duration: 1000,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const liveStateAfterRun = await request(app).get('/admin/api/tautulli/sync/live/state');
    expect(liveStateAfterRun.status).toBe(200);
    expect(liveStateAfterRun.body.activeRun).toBeNull();
    expect(liveStateAfterRun.body.lastRun?.status).toBe('completed');
  });

  it('exposes manual sync runs with item errors as completed with errors', async () => {
    syncService.syncAll.mockResolvedValue({
      totalCreated: 0,
      totalUpdated: 1,
      totalDeleted: 0,
      totalSkipped: 0,
      totalErrors: 1,
      results: [],
      startTime: Date.now() - 1000,
      endTime: Date.now(),
      duration: 1000,
    });

    const response = await request(app)
      .post('/admin/api/tautulli/sync/manual')
      .send({ incremental: false, syncCovers: true, enrichWithTmdb: true });

    expect(response.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const liveState = await request(app).get('/admin/api/tautulli/sync/live/state');
    expect(liveState.status).toBe(200);
    expect(liveState.body.lastRun?.status).toBe('completed_with_errors');
    expect(liveState.body.lastRun?.degraded).toBe(true);
  });

  it('creates and lists sync schedules', async () => {
    const createResponse = await request(app)
      .post('/admin/api/tautulli/sync/schedules')
      .send({ jobType: 'tautulli_sync', cronExpression: '0 6 * * *', enabled: true });

    expect(createResponse.status).toBe(200);

    const listResponse = await request(app).get('/admin/api/tautulli/sync/schedules');
    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body.schedules)).toBe(true);
    expect(listResponse.body.schedules.length).toBe(1);
    expect(listResponse.body.schedules[0].cronExpression).toBe('0 6 * * *');
  });
});
