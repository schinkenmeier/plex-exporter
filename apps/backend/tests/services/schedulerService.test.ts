import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SyncScheduleRepository } from '../../src/repositories/syncScheduleRepository.js';
import { SchedulerService } from '../../src/services/schedulerService.js';
import type { TautulliSyncService } from '../../src/services/tautulliSyncService.js';

const cronMocks = vi.hoisted(() => ({
  schedule: vi.fn(),
  validate: vi.fn(),
}));

vi.mock('node-cron', () => ({
  default: cronMocks,
}));

const createStats = () => ({
  totalCreated: 0,
  totalUpdated: 0,
  totalDeleted: 0,
  totalSkipped: 0,
  totalErrors: 0,
  results: [],
  startTime: Date.now(),
  endTime: Date.now(),
  duration: 0,
});

describe('SchedulerService', () => {
  beforeEach(() => {
    cronMocks.validate.mockReturnValue(true);
    cronMocks.schedule.mockReturnValue({ stop: vi.fn() });
  });

  it('uses the configured timezone and avoids guessing nextRunAt', async () => {
    const syncScheduleRepo = {
      listEnabled: vi.fn(() => [{
        id: 'schedule-1',
        cronExpression: '*/15 * * * *',
        jobType: 'tautulli_sync',
      }]),
      updateLastRun: vi.fn(),
    } as unknown as SyncScheduleRepository;
    const tautulliSyncService = {
      syncAll: vi.fn(async () => createStats()),
    } as unknown as TautulliSyncService;
    const invalidateCatalogCaches = vi.fn();

    const scheduler = new SchedulerService(
      { enabled: true, timezone: 'UTC' },
      syncScheduleRepo,
      tautulliSyncService,
      undefined,
      undefined,
      invalidateCatalogCaches,
    );

    scheduler.start();

    expect(cronMocks.schedule).toHaveBeenCalledWith(
      '*/15 * * * *',
      expect.any(Function),
      { timezone: 'UTC' },
    );

    const handler = cronMocks.schedule.mock.calls[0]?.[1];
    expect(handler).toBeTypeOf('function');
    await handler();

    expect(syncScheduleRepo.updateLastRun).toHaveBeenCalledWith(
      'schedule-1',
      expect.any(String),
      null,
    );
    expect(invalidateCatalogCaches).toHaveBeenCalledWith('scheduled-tautulli-sync');
  });
});
