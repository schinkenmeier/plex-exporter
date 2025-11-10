import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTautulliSyncRouter } from '../../src/routes/tautulliSync.js';
import LibrarySectionRepository from '../../src/repositories/librarySectionRepository.js';
import { SyncScheduleRepository } from '../../src/repositories/syncScheduleRepository.js';
import { TautulliConfigRepository } from '../../src/repositories/tautulliConfigRepository.js';
import SettingsRepository from '../../src/repositories/settingsRepository.js';
import TautulliSnapshotRepository from '../../src/repositories/tautulliSnapshotRepository.js';
import { createTestDatabase, type TestDatabaseHandle } from '../helpers/testDatabase.js';

describe('Tautulli sync integration', () => {
  let dbHandle: TestDatabaseHandle;
  let app: express.Express;
  let syncService: { syncAll: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    dbHandle = createTestDatabase();
    const librarySectionRepo = new LibrarySectionRepository(dbHandle.drizzle);
    const syncScheduleRepo = new SyncScheduleRepository(dbHandle.drizzle);
    const tautulliConfigRepo = new TautulliConfigRepository(dbHandle.drizzle);
    const settingsRepository = new SettingsRepository(dbHandle.drizzle);
    const snapshotRepository = new TautulliSnapshotRepository(dbHandle.drizzle);

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
        settingsRepository,
        tautulliSnapshotRepository: snapshotRepository,
      }),
    );
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
