import { describe, expect, it } from 'vitest';

import { SyncLiveMonitor } from '../../src/services/syncLiveMonitor.js';

describe('SyncLiveMonitor', () => {
  it('starts and completes a run while storing events', () => {
    const monitor = new SyncLiveMonitor(10);
    const run = monitor.tryStartRun('manual', {
      incremental: false,
      enrichWithTmdb: true,
      syncCovers: true,
      refreshMediaInfo: true,
    });

    expect(run).toBeTruthy();
    expect(monitor.isRunActive()).toBe(true);

    monitor.onProgress(run!.runId, {
      phase: 'Processing items',
      current: 5,
      total: 10,
      percentage: 50,
    });

    monitor.onLog(run!.runId, 'info', 'Progress checkpoint reached');

    const completed = monitor.completeRun(run!.runId, {
      totalCreated: 3,
      totalUpdated: 2,
      totalDeleted: 1,
      totalSkipped: 0,
      totalErrors: 0,
      results: [],
      startTime: Date.now() - 200,
      endTime: Date.now(),
      duration: 200,
    });

    expect(completed?.status).toBe('completed');
    const snapshot = monitor.getStateSnapshot();
    expect(snapshot.activeRun).toBeNull();
    expect(snapshot.lastRun?.status).toBe('completed');
    expect(snapshot.events.length).toBeGreaterThan(0);
  });

  it('blocks concurrent start attempts', () => {
    const monitor = new SyncLiveMonitor();
    const first = monitor.tryStartRun('manual', { incremental: false });
    const second = monitor.tryStartRun('scheduler', { incremental: true });

    expect(first).toBeTruthy();
    expect(second).toBeNull();
  });
});

