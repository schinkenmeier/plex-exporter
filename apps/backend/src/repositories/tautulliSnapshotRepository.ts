import { desc, eq, inArray } from 'drizzle-orm';
import type { DrizzleDatabase } from '../db/index.js';
import { tautulliSnapshots } from '../db/schema.js';

type SnapshotRow = typeof tautulliSnapshots.$inferSelect;

const DEFAULT_MAX_SNAPSHOTS = 50;

interface SnapshotRepositoryOptions {
  maxSnapshots?: number;
}

export interface TautulliSnapshotRecord<TPayload = unknown> {
  id: number;
  capturedAt: string;
  payload: TPayload;
}

export class TautulliSnapshotRepository {
  private maxSnapshots: number;

  constructor(private readonly db: DrizzleDatabase, options: SnapshotRepositoryOptions = {}) {
    this.maxSnapshots = this.normalizeLimit(options.maxSnapshots);
  }

  private normalizeLimit(limit?: number): number {
    if (!Number.isFinite(limit ?? NaN)) {
      return DEFAULT_MAX_SNAPSHOTS;
    }
    return Math.max(0, Math.trunc(limit as number));
  }

  private mapRow<TPayload>(row: SnapshotRow): TautulliSnapshotRecord<TPayload> {
    return {
      id: row.id,
      capturedAt: row.capturedAt,
      payload: JSON.parse(row.payload) as TPayload,
    };
  }

  recordSnapshot<TPayload>(payload: TPayload): TautulliSnapshotRecord<TPayload> {
    const payloadJson = JSON.stringify(payload);
    const [row] = this.db
      .insert(tautulliSnapshots)
      .values({ payload: payloadJson })
      .returning()
      .all();

    if (!row) {
      throw new Error('Failed to insert Tautulli snapshot.');
    }

    this.enforceRetention();

    return this.mapRow<TPayload>(row);
  }

  getById<TPayload>(id: number): TautulliSnapshotRecord<TPayload> | null {
    const rows = this.db
      .select()
      .from(tautulliSnapshots)
      .where(eq(tautulliSnapshots.id, id))
      .limit(1)
      .all();

    return rows[0] ? this.mapRow<TPayload>(rows[0]) : null;
  }

  listLatest<TPayload>(limit: number): TautulliSnapshotRecord<TPayload>[] {
    const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 1;
    return this.db
      .select()
      .from(tautulliSnapshots)
      .orderBy(desc(tautulliSnapshots.capturedAt))
      .limit(safeLimit)
      .all()
      .map((row) => this.mapRow<TPayload>(row));
  }

  getMaxSnapshots(): number {
    return this.maxSnapshots;
  }

  setMaxSnapshots(limit: number): void {
    this.maxSnapshots = this.normalizeLimit(limit);
  }

  enforceRetention(): void {
    if (this.maxSnapshots > 0) {
      this.pruneSnapshots();
    }
  }

  private pruneSnapshots(): void {
    const excessRows = this.db
      .select({ id: tautulliSnapshots.id })
      .from(tautulliSnapshots)
      .orderBy(desc(tautulliSnapshots.capturedAt), desc(tautulliSnapshots.id))
      .offset(this.maxSnapshots)
      .all();

    if (!excessRows.length) {
      return;
    }

    const idsToDelete = excessRows.map((row) => row.id);
    this.db
      .delete(tautulliSnapshots)
      .where(inArray(tautulliSnapshots.id, idsToDelete))
      .run();
  }
}

export default TautulliSnapshotRepository;
