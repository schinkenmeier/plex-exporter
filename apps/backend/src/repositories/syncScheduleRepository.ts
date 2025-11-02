import { eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../db/connection.js';
import { syncSchedules, type InsertSyncSchedule, type SyncSchedule } from '../db/schema.js';

export class SyncScheduleRepository {
  constructor(private readonly db: DrizzleDatabase) {}

  /**
   * Create a new sync schedule
   */
  create(input: InsertSyncSchedule): SyncSchedule {
    const result = this.db
      .insert(syncSchedules)
      .values({
        jobType: input.jobType as 'tautulli_sync' | 'cover_update',
        cronExpression: input.cronExpression,
        enabled: input.enabled ?? true,
        lastRunAt: input.lastRunAt ?? null,
        nextRunAt: input.nextRunAt ?? null,
      })
      .returning()
      .get();

    return result;
  }

  /**
   * Get all sync schedules
   */
  listAll(): SyncSchedule[] {
    return this.db.select().from(syncSchedules).all();
  }

  /**
   * Get enabled sync schedules only
   */
  listEnabled(): SyncSchedule[] {
    return this.db.select().from(syncSchedules).where(eq(syncSchedules.enabled, true)).all();
  }

  /**
   * Get a sync schedule by ID
   */
  getById(id: string): SyncSchedule | null {
    const result = this.db.select().from(syncSchedules).where(eq(syncSchedules.id, id)).get();
    return result ?? null;
  }

  /**
   * Get sync schedule by job type
   */
  getByJobType(jobType: 'tautulli_sync' | 'cover_update'): SyncSchedule | null {
    const result = this.db
      .select()
      .from(syncSchedules)
      .where(eq(syncSchedules.jobType, jobType))
      .get();
    return result ?? null;
  }

  /**
   * Update a sync schedule
   */
  update(id: string, input: Partial<InsertSyncSchedule>): SyncSchedule | null {
    const updateData: Record<string, unknown> = {};
    if (input.jobType !== undefined) updateData.jobType = input.jobType;
    if (input.cronExpression !== undefined) updateData.cronExpression = input.cronExpression;
    if (input.enabled !== undefined) updateData.enabled = input.enabled;
    if (input.lastRunAt !== undefined) updateData.lastRunAt = input.lastRunAt;
    if (input.nextRunAt !== undefined) updateData.nextRunAt = input.nextRunAt;

    const result = this.db
      .update(syncSchedules)
      .set(updateData)
      .where(eq(syncSchedules.id, id))
      .returning()
      .get();

    return result ?? null;
  }

  /**
   * Update last run timestamp and calculate next run
   */
  updateLastRun(id: string, lastRunAt: string, nextRunAt: string): void {
    this.db
      .update(syncSchedules)
      .set({
        lastRunAt,
        nextRunAt,
        
      })
      .where(eq(syncSchedules.id, id))
      .run();
  }

  /**
   * Enable or disable a schedule
   */
  setEnabled(id: string, enabled: boolean): void {
    this.db
      .update(syncSchedules)
      .set({
        enabled,
        
      })
      .where(eq(syncSchedules.id, id))
      .run();
  }

  /**
   * Delete a sync schedule
   */
  delete(id: string): boolean {
    const result = this.db.delete(syncSchedules).where(eq(syncSchedules.id, id)).run();
    return result.changes > 0;
  }

  /**
   * Delete all sync schedules
   */
  deleteAll(): void {
    this.db.delete(syncSchedules).run();
  }

  /**
   * Upsert a sync schedule by job type
   */
  upsert(jobType: 'tautulli_sync' | 'cover_update', input: InsertSyncSchedule): SyncSchedule {
    const existing = this.getByJobType(jobType);

    if (existing) {
      const updated = this.update(existing.id, input);
      if (!updated) {
        throw new Error(`Failed to update sync schedule for job type: ${jobType}`);
      }
      return updated;
    }

    return this.create({ ...input, jobType });
  }
}
