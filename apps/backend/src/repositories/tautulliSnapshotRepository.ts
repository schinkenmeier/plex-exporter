import { desc, eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../db/index.js';
import { tautulliSnapshots } from '../db/schema.js';

type SnapshotRow = typeof tautulliSnapshots.$inferSelect;

export interface TautulliSnapshotRecord<TPayload = unknown> {
  id: number;
  capturedAt: string;
  payload: TPayload;
}

export class TautulliSnapshotRepository {
  constructor(private readonly db: DrizzleDatabase) {}

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
}

export default TautulliSnapshotRepository;
