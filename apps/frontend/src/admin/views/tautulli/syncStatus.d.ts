import type { SyncLiveCompletedRun, SyncRunStatus } from '../../core/api.ts';

export function formatSyncRunStatus(status: SyncRunStatus, degraded?: boolean): string;
export function getSyncRunStatusClass(status: SyncRunStatus, degraded?: boolean): string;
export function formatSyncRunSummary(stats: SyncLiveCompletedRun['stats']): string;
export function formatSyncRunDegradedMessage(run: SyncLiveCompletedRun | null): string;
