import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import MediaRepository from '../../src/repositories/mediaRepository.js';
import { heroPools } from '../../src/db/schema.js';
import { createHeroPipelineService } from '../../src/services/heroPipeline.js';
import { createTestDatabase, type TestDatabaseHandle } from '../helpers/testDatabase.js';

describe('hero pipeline service', () => {
  let dbHandle: TestDatabaseHandle;
  let mediaRepository: MediaRepository;
  let tempPolicyDir: string;
  let policyPath: string;

  beforeEach(() => {
    dbHandle = createTestDatabase();
    mediaRepository = new MediaRepository(dbHandle.drizzle);

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
    const expiresAt = now + 60_000;
    const updatedAt = now - 60_000;
    const legacyPayload = JSON.stringify({});
    const legacyHistory = JSON.stringify([
      { id: 'movie-1', ts: now - 1_000 },
      { id: 'movie-9', ts: now - 2_000 },
    ]);

    dbHandle.drizzle
      .insert(heroPools)
      .values({
        kind: 'movies',
        policyHash: 'legacy-policy',
        payload: legacyPayload,
        history: legacyHistory,
        expiresAt,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: heroPools.kind,
        set: {
          policyHash: 'legacy-policy',
          payload: legacyPayload,
          history: legacyHistory,
          expiresAt,
          updatedAt,
        },
      })
      .run();

    const service = createHeroPipelineService({
      drizzleDatabase: dbHandle.drizzle,
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

  it('reloads the hero policy when the policy file changes', async () => {
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
      rating: 9.1,
    });

    const service = createHeroPipelineService({
      drizzleDatabase: dbHandle.drizzle,
      mediaRepository,
      tmdbService: null,
      policyPath,
    });

    const initialPool = await service.getPool('movies');
    expect(initialPool.items).toHaveLength(2);

    await new Promise((resolve) => setTimeout(resolve, 50));
    const updatedPolicy = {
      poolSizeMovies: 1,
      poolSizeSeries: 1,
      slots: {
        new: { quota: 0 },
        topRated: { quota: 0 },
        oldButGold: { quota: 0 },
        random: { quota: 1 },
      },
    };
    fs.writeFileSync(policyPath, JSON.stringify(updatedPolicy), 'utf8');

    const updatedPool = await service.getPool('movies');

    expect(updatedPool.items).toHaveLength(1);
    expect(updatedPool.policyHash).not.toBe(initialPool.policyHash);
    expect(updatedPool.fromCache).toBe(false);
  });
});
