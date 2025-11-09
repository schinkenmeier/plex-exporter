import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createTautulliSyncRouter,
  DEFAULT_SNAPSHOT_LIMIT,
  SNAPSHOT_LIMIT_SETTING_KEY,
} from '../../src/routes/tautulliSync.js';
import { createTestDatabase, type TestDatabaseHandle } from '../helpers/testDatabase.js';
import SettingsRepository from '../../src/repositories/settingsRepository.js';
import TautulliSnapshotRepository from '../../src/repositories/tautulliSnapshotRepository.js';

describe('Tautulli snapshot settings routes', () => {
  let dbHandle: TestDatabaseHandle;
  let settingsRepository: SettingsRepository;
  let snapshotRepository: TautulliSnapshotRepository;
  let app: express.Express;

  beforeEach(() => {
    dbHandle = createTestDatabase();
    settingsRepository = new SettingsRepository(dbHandle.drizzle);
    snapshotRepository = new TautulliSnapshotRepository(dbHandle.drizzle);

    app = express();
    app.use(express.json());
    app.use(
      '/admin/api/tautulli',
      createTautulliSyncRouter({
        getTautulliService: () => null,
        getTautulliSyncService: () => null,
        librarySectionRepo: {} as any,
        syncScheduleRepo: {} as any,
        tautulliConfigRepo: {} as any,
        getSchedulerService: () => null,
        refreshTautulliIntegration: () => {},
        settingsRepository,
        tautulliSnapshotRepository: snapshotRepository,
      }),
    );
  });

  afterEach(() => {
    dbHandle.cleanup();
  });

  it('returns the current snapshot settings with defaults', async () => {
    const response = await request(app).get('/admin/api/tautulli/snapshots/settings');

    expect(response.status).toBe(200);
    expect(response.body.maxSnapshots).toBe(DEFAULT_SNAPSHOT_LIMIT);
    expect(response.body.defaults).toMatchObject({
      fallback: DEFAULT_SNAPSHOT_LIMIT,
    });
  });

  it('stores a new snapshot limit and updates the repository', async () => {
    const response = await request(app)
      .post('/admin/api/tautulli/snapshots/settings')
      .send({ maxSnapshots: 25 });

    expect(response.status).toBe(200);
    expect(response.body.maxSnapshots).toBe(25);
    expect(snapshotRepository.getMaxSnapshots()).toBe(25);
    expect(settingsRepository.get(SNAPSHOT_LIMIT_SETTING_KEY)?.value).toBe('25');
  });
});
