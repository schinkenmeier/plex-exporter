import cron, { type ScheduledTask } from 'node-cron';
import type { SyncScheduleRepository } from '../repositories/syncScheduleRepository.js';
import type { TautulliSyncService } from './tautulliSyncService.js';
import type { SyncCoordinator } from './syncCoordinator.js';
import type { HeroPipelineService } from './heroPipeline.js';
import { invalidateHeroPoolsForSyncStats } from './heroInvalidation.js';
import logger from './logger.js';

export interface SchedulerConfig {
  enabled?: boolean;
  timezone?: string;
}

type JobHandler = () => Promise<boolean>;

export class SchedulerService {
  private tasks: Map<string, ScheduledTask> = new Map();
  private isRunning = false;

  constructor(
    private readonly config: SchedulerConfig,
    private readonly syncScheduleRepo: SyncScheduleRepository,
    private readonly tautulliSyncService: TautulliSyncService,
    private readonly syncCoordinator?: SyncCoordinator,
    private readonly heroPipeline?: HeroPipelineService | null,
  ) {}

  /**
   * Start the scheduler and load all enabled schedules
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Scheduler already running', { namespace: 'scheduler' });
      return;
    }

    if (this.config.enabled === false) {
      logger.info('Scheduler is disabled', { namespace: 'scheduler' });
      return;
    }

    this.isRunning = true;
    this.loadSchedules();
    logger.info('Scheduler started', { namespace: 'scheduler' });
  }

  /**
   * Stop the scheduler and cancel all tasks
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    for (const [id, task] of this.tasks.entries()) {
      task.stop();
      this.tasks.delete(id);
    }

    this.isRunning = false;
    logger.info('Scheduler stopped', { namespace: 'scheduler' });
  }

  /**
   * Load all enabled schedules from database
   */
  private loadSchedules(): void {
    const schedules = this.syncScheduleRepo.listEnabled();

    for (const schedule of schedules) {
      try {
        this.scheduleJob(
          schedule.id,
          schedule.cronExpression,
          schedule.jobType,
        );
      } catch (error) {
        logger.error('Failed to schedule job', { namespace: 'scheduler', scheduleId: schedule.id, error });
      }
    }

    logger.info('Loaded scheduled jobs', { namespace: 'scheduler', count: schedules.length });
  }

  /**
   * Schedule a job with a cron expression
   */
  private scheduleJob(
    id: string,
    cronExpression: string,
    jobType: 'tautulli_sync' | 'cover_update',
  ): void {
    // Validate cron expression
    if (!cron.validate(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }

    // Stop existing task if any
    const existingTask = this.tasks.get(id);
    if (existingTask) {
      existingTask.stop();
    }

    // Create job handler based on job type
    const handler = this.createJobHandler(jobType);

    // Schedule the task
    const task = cron.schedule(
      cronExpression,
      async () => {
        logger.info('Running scheduled job', { namespace: 'scheduler', jobType, id });
        const startTime = Date.now();

        try {
          const didRun = await handler();

          if (!didRun) {
            logger.info('Skipped scheduled job because another sync is active', { namespace: 'scheduler', jobType, id });
            return;
          }

          // Update last run and next run times
          const lastRunAt = new Date().toISOString();
          this.syncScheduleRepo.updateLastRun(id, lastRunAt, null);

          const duration = Date.now() - startTime;
          logger.info('Completed scheduled job', { namespace: 'scheduler', jobType, id, durationMs: duration });
        } catch (error) {
          logger.error('Failed to execute scheduled job', { namespace: 'scheduler', jobType, id, error });
        }
      },
      {
        timezone: this.config.timezone ?? 'Europe/Berlin',
      },
    );

    this.tasks.set(id, task);
    logger.info('Scheduled job', { namespace: 'scheduler', jobType, id, cronExpression });
  }

  /**
   * Create a job handler based on job type
   */
  private createJobHandler(jobType: 'tautulli_sync' | 'cover_update'): JobHandler {
    switch (jobType) {
      case 'tautulli_sync':
        return async () => {
          const options = {
            incremental: true,
            enrichWithTmdb: true,
            syncCovers: false, // Don't sync covers during automatic sync
            refreshMediaInfo: true,
          };

          const coordinator = this.syncCoordinator;
          if (!coordinator) {
            const stats = await this.tautulliSyncService.syncAll(options);
            logger.info('Scheduled sync completed', {
              namespace: 'scheduler',
              totalCreated: stats.totalCreated,
              totalUpdated: stats.totalUpdated,
              totalDeleted: stats.totalDeleted,
              totalErrors: stats.totalErrors,
            });
            invalidateHeroPoolsForSyncStats(this.heroPipeline, stats, 'scheduled-tautulli-sync');
            return true;
          }

          const startResult = coordinator.start('scheduler', options, async ({ onProgress, onLog }) => {
            onLog('info', 'Scheduled sync started');

            return this.tautulliSyncService.syncAll(
              options,
              (progress) => {
                const progressMessage =
                  `[Sync] ${progress.phase}: ${progress.current}/${progress.total} (${progress.percentage}%)`;
                logger.debug('Scheduled sync progress', { namespace: 'scheduler', progress });
                onProgress(progress);
                onLog('debug', progressMessage);
              },
            );
          });

          if (startResult.status === 'busy') {
            const activeRun = startResult.activeRun;
            const message = 'Scheduled sync skipped because another sync is currently running';
            logger.warn(message, activeRun ? { activeRunId: activeRun.runId, source: activeRun.source } : undefined);
            return false;
          }

          if (startResult.status === 'shutting_down') {
            logger.warn('Scheduled sync skipped because shutdown is in progress', { namespace: 'scheduler' });
            return false;
          }

          const result = await startResult.promise;
          if (result.status === 'failed') {
            logger.error('Scheduled sync failed', { namespace: 'scheduler', error: result.error });
            throw new Error(result.error);
          }

          logger.info('Scheduled sync completed', {
            namespace: 'scheduler',
            totalCreated: result.stats.totalCreated,
            totalUpdated: result.stats.totalUpdated,
            totalDeleted: result.stats.totalDeleted,
            totalErrors: result.stats.totalErrors,
          });
          invalidateHeroPoolsForSyncStats(this.heroPipeline, result.stats, 'scheduled-tautulli-sync');
          return true;
        };

      case 'cover_update':
        return async () => {
          // This will be implemented later for batch cover updates
          logger.info('Cover update job not yet implemented', { namespace: 'scheduler' });
          return false;
        };

      default:
        throw new Error(`Unknown job type: ${jobType}`);
    }
  }

  /**
   * Reload all schedules (useful after schedule changes)
   */
  reload(): void {
    logger.info('Reloading schedules', { namespace: 'scheduler' });
    this.stop();
    this.start();
  }

  /**
   * Add or update a schedule
   */
  updateSchedule(
    id: string,
    cronExpression: string,
    jobType: 'tautulli_sync' | 'cover_update',
  ): void {
    if (!this.isRunning) {
      throw new Error('Scheduler is not running');
    }

    this.scheduleJob(id, cronExpression, jobType);
  }

  /**
   * Remove a schedule
   */
  removeSchedule(id: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.stop();
      this.tasks.delete(id);
      logger.info('Removed schedule', { namespace: 'scheduler', id });
    }
  }

  /**
   * Get all active task IDs
   */
  getActiveTasks(): string[] {
    return Array.from(this.tasks.keys());
  }

  /**
   * Check if scheduler is running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}
