import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MediaRepository } from '../../src/repositories/mediaRepository.js';
import { createHeroPipelineService } from '../../src/services/heroPipeline.js';
import { createTestDatabase, type TestDatabaseHandle } from '../helpers/testDatabase.js';

describe('hero pipeline service', () => {
  let dbHandle: TestDatabaseHandle;
  let mediaRepository: MediaRepository;
  let tempPolicyDir: string;
  let policyPath: string;

  beforeEach(() => {
    dbHandle = createTestDatabase();
    mediaRepository = new MediaRepository(dbHandle.db);

    tempPolicyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hero-policy-test-'));
    policyPath = path.join(tempPolicyDir, 'policy.json');
    const policy = {
      poolSizeMovies: 2,
      poolSizeSeries: 1,
      slots: {
        new: { quota: 0 },
        topRated: { quota: 0 },
        oldButGold: { quota: 0 },
        random: { quota: 1 },
      },
    };
    fs.writeFileSync(policyPath, JSON.stringify(policy), 'utf8');
  });

  afterEach(() => {
    dbHandle.cleanup();
    fs.rmSync(tempPolicyDir, { recursive: true, force: true });
  });

  it('reuses stored history when forcing a rebuild', async () => {
    const nowIso = new Date().toISOString();
    mediaRepository.create({
      plexId: 'movie-1',
      title: 'Movie One',
      mediaType: 'movie',
      plexAddedAt: nowIso,
      rating: 8.5,
    });
    mediaRepository.create({
      plexId: 'movie-2',
      title: 'Movie Two',
      mediaType: 'movie',
      plexAddedAt: nowIso,
      rating: 7.3,
    });
    mediaRepository.create({
      plexId: 'movie-3',
      title: 'Movie Three',
      mediaType: 'movie',
      plexAddedAt: nowIso,
      rating: 6.8,
    });

    const now = Date.now();
    dbHandle.db
      .prepare(
        `REPLACE INTO hero_pools (kind, policy_hash, payload, history, expires_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'movies',
        'legacy-policy',
        JSON.stringify({}),
        JSON.stringify([
          { id: 'movie-1', ts: now - 1_000 },
          { id: 'movie-9', ts: now - 2_000 },
        ]),
        now + 60_000,
        now - 60_000,
      );

    const service = createHeroPipelineService({
      database: dbHandle.db,
      mediaRepository,
      tmdbService: null,
      policyPath,
    });

    const pool = await service.getPool('movies', { force: true });

    expect(pool.fromCache).toBe(false);
    expect(pool.items).toHaveLength(2);

    const selectedIds = pool.items.map((item) => item.poolId || item.id);
    expect(selectedIds).not.toContain('movie-1');
  });
});
