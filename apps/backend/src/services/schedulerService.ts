import cron, { type ScheduledTask } from 'node-cron';
import type { SyncScheduleRepository } from '../repositories/syncScheduleRepository.js';
import type { TautulliSyncService } from './tautulliSyncService.js';

export interface SchedulerConfig {
  enabled?: boolean;
}

type JobHandler = () => Promise<void>;

export class SchedulerService {
  private tasks: Map<string, ScheduledTask> = new Map();
  private isRunning = false;

  constructor(
    private readonly config: SchedulerConfig,
    private readonly syncScheduleRepo: SyncScheduleRepository,
    private readonly tautulliSyncService: TautulliSyncService,
  ) {}

  /**
   * Start the scheduler and load all enabled schedules
   */
  start(): void {
    if (this.isRunning) {
      console.warn('Scheduler already running');
      return;
    }

    if (this.config.enabled === false) {
      console.log('Scheduler is disabled');
      return;
    }

    this.isRunning = true;
    this.loadSchedules();
    console.log('Scheduler started');
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
    console.log('Scheduler stopped');
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
        console.error(`Failed to schedule job ${schedule.id}:`, error);
      }
    }

    console.log(`Loaded ${schedules.length} scheduled jobs`);
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
        console.log(`Running scheduled job: ${jobType} (${id})`);
        const startTime = Date.now();

        try {
          await handler();

          // Update last run and next run times
          const lastRunAt = new Date().toISOString();
          const nextRunAt = this.calculateNextRun(cronExpression);

          this.syncScheduleRepo.updateLastRun(id, lastRunAt, nextRunAt);

          const duration = Date.now() - startTime;
          console.log(`Completed scheduled job: ${jobType} (${id}) in ${duration}ms`);
        } catch (error) {
          console.error(`Failed to execute scheduled job ${jobType} (${id}):`, error);
        }
      },
      {
        
        timezone: 'Europe/Berlin', // Adjust to your timezone
      },
    );

    this.tasks.set(id, task);
    console.log(`Scheduled job: ${jobType} (${id}) with cron: ${cronExpression}`);
  }

  /**
   * Create a job handler based on job type
   */
  private createJobHandler(jobType: 'tautulli_sync' | 'cover_update'): JobHandler {
    switch (jobType) {
      case 'tautulli_sync':
        return async () => {
          await this.tautulliSyncService.syncAll(
            {
              incremental: true,
              enrichWithTmdb: true,
              syncCovers: false, // Don't sync covers during automatic sync
            },
            (progress) => {
              console.log(
                `[Sync] ${progress.phase}: ${progress.current}/${progress.total} (${progress.percentage}%)`,
              );
            },
          );
        };

      case 'cover_update':
        return async () => {
          // This will be implemented later for batch cover updates
          console.log('Cover update job not yet implemented');
        };

      default:
        throw new Error(`Unknown job type: ${jobType}`);
    }
  }

  /**
   * Calculate the next run time based on cron expression
   */
  private calculateNextRun(cronExpression: string): string {
    // Simple calculation - this could be improved with a proper cron parser
    // For now, just add 24 hours if it's a daily cron
    const now = new Date();

    // Basic parsing for common patterns
    if (cronExpression.startsWith('0 ')) {
      // Daily at specific hour
      const [, hour] = cronExpression.split(' ');
      const hourNum = parseInt(hour, 10);

      const next = new Date(now);
      next.setHours(hourNum, 0, 0, 0);

      // If the time has already passed today, schedule for tomorrow
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }

      return next.toISOString();
    }

    // Default: add 24 hours
    const next = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return next.toISOString();
  }

  /**
   * Reload all schedules (useful after schedule changes)
   */
  reload(): void {
    console.log('Reloading schedules...');
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
      console.log(`Removed schedule: ${id}`);
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
