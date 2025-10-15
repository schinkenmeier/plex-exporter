import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TautulliSnapshotRepository from '../../src/repositories/tautulliSnapshotRepository.js';
import { createLibrariesRouter } from '../../src/routes/libraries.js';
import type { TautulliClient, TautulliLibrarySummary } from '../../src/services/tautulliService.js';
import { createTestDatabase, type TestDatabaseHandle } from '../helpers/testDatabase.js';

describe('libraries routes', () => {
  let dbHandle: TestDatabaseHandle;
  let snapshotRepository: TautulliSnapshotRepository;

  const createApp = (tautulliService: TautulliClient | null) => {
    const app = express();
    app.use(
      '/libraries',
      createLibrariesRouter({ tautulliService, snapshotRepository }),
    );
    return app;
  };

  beforeEach(() => {
    dbHandle = createTestDatabase();
    snapshotRepository = new TautulliSnapshotRepository(dbHandle.db);
  });

  afterEach(() => {
    dbHandle.cleanup();
  });

  it('responds with 503 when Tautulli is not configured', async () => {
    const app = createApp(null);

    const response = await request(app).get('/libraries');

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('Tautulli service is not configured.');
  });

  it('responds with 500 when the snapshot repository is missing', async () => {
    const libraries: TautulliLibrarySummary[] = [
      { section_id: 1, section_name: 'Movies', friendly_name: 'Movies' },
    ];
    const getLibraries = vi.fn(async () => libraries);

    const app = express();
    app.use(
      '/libraries',
      createLibrariesRouter({ tautulliService: { getLibraries }, snapshotRepository: null }),
    );

    const response = await request(app).get('/libraries');

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Snapshot repository is not configured.');
  });

  it('returns libraries from the Tautulli service', async () => {
    const libraries: TautulliLibrarySummary[] = [
      { section_id: 1, section_name: 'Movies', friendly_name: 'Movies' },
    ];
    const getLibraries = vi.fn(async () => libraries);

    const app = createApp({ getLibraries });

    const response = await request(app).get('/libraries');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ libraries });
    expect(getLibraries).toHaveBeenCalledTimes(1);

    const [snapshot] = snapshotRepository.listLatest<{ libraries: TautulliLibrarySummary[] }>(1);
    expect(snapshot.payload.libraries).toEqual(libraries);
  });

  it('handles errors from the Tautulli service', async () => {
    const getLibraries = vi.fn(async () => {
      throw new Error('Tautulli unavailable');
    });

    const app = createApp({ getLibraries });

    const response = await request(app).get('/libraries');

    expect(response.status).toBe(502);
    expect(response.body.error).toBe('Tautulli unavailable');
    expect(getLibraries).toHaveBeenCalledTimes(1);
  });
});
