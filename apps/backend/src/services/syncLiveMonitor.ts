import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

import type { SyncOptions, SyncProgress, SyncStats } from './tautulliSyncService.js';

export type SyncRunSource = 'manual' | 'scheduler';
export type SyncRunStatus = 'running' | 'completed' | 'failed';
export type SyncLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface SyncRunOptions {
  incremental: boolean;
  enrichWithTmdb: boolean;
  syncCovers: boolean;
  refreshMediaInfo: boolean;
}

export interface ActiveSyncRun {
  runId: string;
  source: SyncRunSource;
  status: 'running';
  startedAt: string;
  options: SyncRunOptions;
}

export interface CompletedSyncRun {
  runId: string;
  source: SyncRunSource;
  status: 'completed' | 'failed';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  options: SyncRunOptions;
  stats: SyncStats | null;
  error: string | null;
}

export interface SyncLiveEventMap {
  run_started: {
    run: ActiveSyncRun;
  };
  progress: {
    progress: SyncProgress;
  };
  log: {
    level: SyncLogLevel;
    message: string;
    context?: Record<string, unknown>;
  };
  run_completed: {
    run: CompletedSyncRun;
  };
  run_failed: {
    run: CompletedSyncRun;
  };
}

export type SyncLiveEventType = keyof SyncLiveEventMap;

export interface SyncLiveEvent<T extends SyncLiveEventType = SyncLiveEventType> {
  id: string;
  timestamp: string;
  type: T;
  runId: string | null;
  payload: SyncLiveEventMap[T];
}

export interface SyncLiveStateSnapshot {
  activeRun: ActiveSyncRun | null;
  lastRun: CompletedSyncRun | null;
  events: SyncLiveEvent[];
}

type SyncLiveSubscriber = (event: SyncLiveEvent) => void;

const DEFAULT_BUFFER_SIZE = 400;

const normalizeOptions = (options: SyncOptions = {}): SyncRunOptions => ({
  incremental: options.incremental ?? false,
  enrichWithTmdb: options.enrichWithTmdb ?? true,
  syncCovers: options.syncCovers ?? true,
  refreshMediaInfo: options.refreshMediaInfo ?? true,
});

export class SyncLiveMonitor {
  private readonly emitter = new EventEmitter();
  private readonly maxBufferSize: number;
  private activeRun: ActiveSyncRun | null = null;
  private lastRun: CompletedSyncRun | null = null;
  private eventBuffer: SyncLiveEvent[] = [];

  constructor(maxBufferSize = DEFAULT_BUFFER_SIZE) {
    this.maxBufferSize = maxBufferSize;
  }

  tryStartRun(source: SyncRunSource, options: SyncOptions = {}): ActiveSyncRun | null {
    if (this.activeRun) {
      return null;
    }

    this.eventBuffer = [];
    const run: ActiveSyncRun = {
      runId: randomUUID(),
      source,
      status: 'running',
      startedAt: new Date().toISOString(),
      options: normalizeOptions(options),
    };
    this.activeRun = run;
    this.pushEvent('run_started', run.runId, { run });
    return run;
  }

  isRunActive(): boolean {
    return this.activeRun !== null;
  }

  getActiveRun(): ActiveSyncRun | null {
    return this.activeRun ? { ...this.activeRun } : null;
  }

  getStateSnapshot(): SyncLiveStateSnapshot {
    return {
      activeRun: this.activeRun ? { ...this.activeRun } : null,
      lastRun: this.lastRun ? { ...this.lastRun } : null,
      events: [...this.eventBuffer],
    };
  }

  onProgress(runId: string, progress: SyncProgress): void {
    if (!this.activeRun || this.activeRun.runId !== runId) {
      return;
    }
    this.pushEvent('progress', runId, { progress });
  }

  onLog(
    runId: string | null,
    level: SyncLogLevel,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    this.pushEvent('log', runId, { level, message, context });
  }

  completeRun(runId: string, stats: SyncStats): CompletedSyncRun | null {
    if (!this.activeRun || this.activeRun.runId !== runId) {
      return null;
    }

    const finishedAt = new Date().toISOString();
    const completedRun: CompletedSyncRun = {
      runId,
      source: this.activeRun.source,
      status: 'completed',
      startedAt: this.activeRun.startedAt,
      finishedAt,
      durationMs: new Date(finishedAt).getTime() - new Date(this.activeRun.startedAt).getTime(),
      options: this.activeRun.options,
      stats,
      error: null,
    };

    this.lastRun = completedRun;
    this.activeRun = null;
    this.pushEvent('run_completed', runId, { run: completedRun });
    return completedRun;
  }

  failRun(runId: string, errorMessage: string): CompletedSyncRun | null {
    if (!this.activeRun || this.activeRun.runId !== runId) {
      return null;
    }

    const finishedAt = new Date().toISOString();
    const failedRun: CompletedSyncRun = {
      runId,
      source: this.activeRun.source,
      status: 'failed',
      startedAt: this.activeRun.startedAt,
      finishedAt,
      durationMs: new Date(finishedAt).getTime() - new Date(this.activeRun.startedAt).getTime(),
      options: this.activeRun.options,
      stats: null,
      error: errorMessage,
    };

    this.lastRun = failedRun;
    this.activeRun = null;
    this.pushEvent('run_failed', runId, { run: failedRun });
    return failedRun;
  }

  subscribe(listener: SyncLiveSubscriber): () => void {
    this.emitter.on('event', listener);
    return () => {
      this.emitter.off('event', listener);
    };
  }

  private pushEvent<T extends SyncLiveEventType>(
    type: T,
    runId: string | null,
    payload: SyncLiveEventMap[T],
  ): void {
    const event: SyncLiveEvent<T> = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      type,
      runId,
      payload,
    };

    this.eventBuffer.push(event);
    if (this.eventBuffer.length > this.maxBufferSize) {
      this.eventBuffer.shift();
    }
    this.emitter.emit('event', event);
  }
}

