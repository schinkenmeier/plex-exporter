import { describe, expect, it } from 'vitest';

import { SyncCoordinator } from '../../src/services/syncCoordinator.js';
import { SyncLiveMonitor } from '../../src/services/syncLiveMonitor.js';
import type { SyncStats } from '../../src/services/tautulliSyncService.js';

const createStats = (overrides: Partial<SyncStats> = {}): SyncStats => ({
  totalCreated: 0,
  totalUpdated: 0,
  totalDeleted: 0,
  totalSkipped: 0,
  totalErrors: 0,
  results: [],
  startTime: Date.now(),
  endTime: Date.now(),
  duration: 0,
  ...overrides,
});

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('SyncCoordinator', () => {
  it('starts one run, blocks a concurrent run, and clears active state after completion', async () => {
    const monitor = new SyncLiveMonitor();
    const coordinator = new SyncCoordinator(monitor);
    const deferred = createDeferred<SyncStats>();

    const first = coordinator.start('manual', { incremental: false }, () => deferred.promise);
    expect(first.status).toBe('started');

    const second = coordinator.start('scheduler', { incremental: true }, async () => createStats());
    expect(second.status).toBe('busy');
    if (second.status === 'busy') {
      expect(second.activeRun?.source).toBe('manual');
    }

    deferred.resolve(createStats({ totalCreated: 1 }));

    if (first.status === 'started') {
      const result = await first.promise;
      expect(result.status).toBe('completed');
    }

    expect(coordinator.getActiveRun()).toBeNull();
    expect(monitor.getStateSnapshot().lastRun?.status).toBe('completed');
  });

  it('marks failed runs and does not reject the tracked promise', async () => {
    const monitor = new SyncLiveMonitor();
    const coordinator = new SyncCoordinator(monitor);

    const started = coordinator.start('manual', {}, async () => {
      throw new Error('sync failed');
    });

    expect(started.status).toBe('started');
    if (started.status === 'started') {
      const result = await started.promise;
      expect(result.status).toBe('failed');
      expect(result.error).toBe('sync failed');
    }

    expect(monitor.getStateSnapshot().lastRun?.status).toBe('failed');
  });

  it('waits for an active run during shutdown and rejects new starts', async () => {
    const monitor = new SyncLiveMonitor();
    const coordinator = new SyncCoordinator(monitor);
    const deferred = createDeferred<SyncStats>();

    const started = coordinator.start('manual', {}, () => deferred.promise);
    expect(started.status).toBe('started');

    const shutdown = coordinator.shutdown({ timeoutMs: 1_000 });
    const blocked = coordinator.start('manual', {}, async () => createStats());
    expect(blocked.status).toBe('shutting_down');

    deferred.resolve(createStats());

    await expect(shutdown).resolves.toEqual({ drained: true, activeRun: null });
  });
});
