import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import MediaRepository from '../../src/repositories/mediaRepository.js';
import { heroPools } from '../../src/db/schema.js';
import { createHeroPipelineService } from '../../src/services/heroPipeline.js';
import type { TmdbHeroDetails, TmdbService } from '../../src/services/tmdbService.js';
import { createTestDatabase, type TestDatabaseHandle } from '../helpers/testDatabase.js';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

const createDeferred = <T>(): Deferred<T> => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
};

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

  it('invalidates stored hero pools by expiring rows without replacing history', async () => {
    const now = Date.now();
    const movieHistory = JSON.stringify([{ id: 'movie-1', ts: now - 1_000 }]);
    const seriesHistory = JSON.stringify([{ id: 'series-1', ts: now - 2_000 }]);
    const moviePayload = JSON.stringify({ kind: 'movies', items: [] });
    const seriesPayload = JSON.stringify({ kind: 'series', items: [] });

    dbHandle.drizzle.insert(heroPools).values([
      {
        kind: 'movies',
        policyHash: 'movie-policy',
        payload: moviePayload,
        history: movieHistory,
        expiresAt: now + 60_000,
        updatedAt: now - 60_000,
      },
      {
        kind: 'series',
        policyHash: 'series-policy',
        payload: seriesPayload,
        history: seriesHistory,
        expiresAt: now + 60_000,
        updatedAt: now - 60_000,
      },
    ]).run();

    const service = createHeroPipelineService({
      drizzleDatabase: dbHandle.drizzle,
      mediaRepository,
      tmdbService: null,
      policyPath,
    });

    const expired = service.invalidate('movies', 'test');

    expect(expired).toBe(1);

    const movieRow = dbHandle.drizzle
      .select()
      .from(heroPools)
      .where(eq(heroPools.kind, 'movies'))
      .limit(1)
      .all()[0];
    const seriesRow = dbHandle.drizzle
      .select()
      .from(heroPools)
      .where(eq(heroPools.kind, 'series'))
      .limit(1)
      .all()[0];

    expect(movieRow.expiresAt).toBeLessThanOrEqual(Date.now());
    expect(movieRow.history).toBe(movieHistory);
    expect(movieRow.payload).toBe(moviePayload);
    expect(seriesRow.expiresAt).toBe(now + 60_000);
    expect(seriesRow.history).toBe(seriesHistory);
  });

  it('does not attach a forced build to a non-forced in-flight build', async () => {
    const oneItemPolicy = {
      poolSizeMovies: 1,
      poolSizeSeries: 1,
      slots: {
        new: { quota: 0 },
        topRated: { quota: 0 },
        oldButGold: { quota: 0 },
        random: { quota: 1 },
      },
    };
    fs.writeFileSync(policyPath, JSON.stringify(oneItemPolicy), 'utf8');

    mediaRepository.create({
      plexId: 'movie-1',
      title: 'Movie One',
      mediaType: 'movie',
      plexAddedAt: new Date().toISOString(),
      rating: 8.5,
      tmdbId: 100,
    });

    const calls: Array<{ deferred: Deferred<TmdbHeroDetails | null> }> = [];
    const tmdbService: TmdbService = {
      isEnabled: () => true,
      fetchDetails: vi.fn(() => {
        const deferred = createDeferred<TmdbHeroDetails | null>();
        calls.push({ deferred });
        return deferred.promise;
      }),
      fetchDetailsByImdb: vi.fn(async () => null),
      getRateLimitState: () => ({
        active: false,
        until: 0,
        retryAfterMs: 0,
        lastStatus: null,
        strikes: 0,
      }),
      getPosterUrl: vi.fn(() => null),
      searchMovie: vi.fn(async () => []),
      searchTv: vi.fn(async () => []),
      fetchSeasonEpisodes: vi.fn(async () => []),
    };

    const service = createHeroPipelineService({
      drizzleDatabase: dbHandle.drizzle,
      mediaRepository,
      tmdbService,
      policyPath,
    });

    const normalBuild = service.getPool('movies');
    await vi.waitFor(() => {
      expect(calls).toHaveLength(1);
    });

    const forcedBuild = service.getPool('movies', { force: true });
    await vi.waitFor(() => {
      expect(calls).toHaveLength(2);
    });

    calls[0].deferred.resolve(null);
    calls[1].deferred.resolve(null);

    const [normalPool, forcedPool] = await Promise.all([normalBuild, forcedBuild]);

    expect(normalPool.fromCache).toBe(false);
    expect(forcedPool.fromCache).toBe(false);
    expect(tmdbService.fetchDetails).toHaveBeenCalledTimes(2);
  });

  it('reports policy diagnostics and derives matchesPolicy from them', async () => {
    const threeItemPolicy = {
      poolSizeMovies: 3,
      poolSizeSeries: 1,
      slots: {
        new: { quota: 0 },
        topRated: { quota: 0 },
        oldButGold: { quota: 0 },
        random: { quota: 1 },
      },
    };
    fs.writeFileSync(policyPath, JSON.stringify(threeItemPolicy), 'utf8');

    mediaRepository.create({
      plexId: 'movie-1',
      title: 'Movie One',
      mediaType: 'movie',
      plexAddedAt: new Date().toISOString(),
      rating: 8.5,
    });

    const service = createHeroPipelineService({
      drizzleDatabase: dbHandle.drizzle,
      mediaRepository,
      tmdbService: null,
      policyPath,
    });

    const pool = await service.getPool('movies', { force: true });

    expect(pool.items).toHaveLength(1);
    expect(pool.matchesPolicy).toBe(false);
    expect(pool.policyDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'pool-size-mismatch',
          matchesPolicy: false,
          expected: 3,
          actual: 1,
        }),
      ]),
    );
  });
});
