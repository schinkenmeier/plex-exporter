import type { ActiveSyncRun, SyncLiveMonitor, SyncRunSource, SyncLogLevel } from './syncLiveMonitor.js';
import type { SyncOptions, SyncProgress, SyncStats } from './tautulliSyncService.js';

export interface SyncCoordinatorContext {
  run: ActiveSyncRun;
  onProgress: (progress: SyncProgress) => void;
  onLog: (level: SyncLogLevel, message: string, context?: Record<string, unknown>) => void;
}

export type SyncCoordinatorRunner = (context: SyncCoordinatorContext) => Promise<SyncStats>;

export type SyncStartResult =
  | {
      status: 'started';
      run: ActiveSyncRun;
      promise: Promise<SyncCoordinatorRunResult>;
    }
  | {
      status: 'busy';
      activeRun: ActiveSyncRun | null;
    }
  | {
      status: 'shutting_down';
    };

export type SyncCoordinatorRunResult =
  | {
      status: 'completed';
      run: ActiveSyncRun;
      stats: SyncStats;
    }
  | {
      status: 'failed';
      run: ActiveSyncRun;
      error: string;
    };

export interface SyncCoordinatorShutdownResult {
  drained: boolean;
  activeRun: ActiveSyncRun | null;
}

export class SyncCoordinator {
  private active:
    | {
        run: ActiveSyncRun;
        promise: Promise<SyncCoordinatorRunResult>;
      }
    | null = null;

  private shuttingDown = false;

  constructor(private readonly syncLiveMonitor: SyncLiveMonitor) {}

  start(
    source: SyncRunSource,
    options: SyncOptions,
    runner: SyncCoordinatorRunner,
  ): SyncStartResult {
    if (this.shuttingDown) {
      return { status: 'shutting_down' };
    }

    if (this.active) {
      return { status: 'busy', activeRun: this.active.run };
    }

    const run = this.syncLiveMonitor.tryStartRun(source, options);
    if (!run) {
      return { status: 'busy', activeRun: this.syncLiveMonitor.getActiveRun() };
    }

    const promise = Promise.resolve()
      .then(() =>
        runner({
          run,
          onProgress: (progress) => this.syncLiveMonitor.onProgress(run.runId, progress),
          onLog: (level, message, context) => this.syncLiveMonitor.onLog(run.runId, level, message, context),
        }),
      )
      .then((stats): SyncCoordinatorRunResult => {
        this.syncLiveMonitor.completeRun(run.runId, stats);
        return { status: 'completed', run, stats };
      })
      .catch((error): SyncCoordinatorRunResult => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.syncLiveMonitor.failRun(run.runId, errorMessage);
        return { status: 'failed', run, error: errorMessage };
      })
      .finally(() => {
        if (this.active?.run.runId === run.runId) {
          this.active = null;
        }
      });

    this.active = { run, promise };
    return { status: 'started', run, promise };
  }

  getActiveRun(): ActiveSyncRun | null {
    return this.active ? { ...this.active.run } : null;
  }

  isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  async shutdown({ timeoutMs }: { timeoutMs: number }): Promise<SyncCoordinatorShutdownResult> {
    this.shuttingDown = true;

    if (!this.active) {
      return { drained: true, activeRun: null };
    }

    const activeRun = this.active.run;
    const timeout = new Promise<SyncCoordinatorShutdownResult>((resolve) => {
      setTimeout(() => resolve({ drained: false, activeRun }), Math.max(0, timeoutMs)).unref?.();
    });

    const drained = this.active.promise.then(() => ({
      drained: true,
      activeRun: null,
    }));

    return Promise.race([drained, timeout]);
  }
}

export default SyncCoordinator;
