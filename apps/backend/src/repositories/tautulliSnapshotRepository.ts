import type { SqliteDatabase } from '../db/connection.js';

interface SnapshotRow {
  id: number;
  captured_at: string;
  payload: string;
}

export interface TautulliSnapshotRecord<TPayload = unknown> {
  id: number;
  capturedAt: string;
  payload: TPayload;
}

export class TautulliSnapshotRepository {
  private readonly insertStmt: ReturnType<SqliteDatabase['prepare']>;
  private readonly getByIdStmt: ReturnType<SqliteDatabase['prepare']>;
  private readonly listStmt: ReturnType<SqliteDatabase['prepare']>;

  constructor(private readonly db: SqliteDatabase) {
    this.insertStmt = this.db.prepare(
      'INSERT INTO tautulli_snapshots (payload) VALUES (@payload)',
    );

    this.getByIdStmt = this.db.prepare('SELECT * FROM tautulli_snapshots WHERE id = ?');
    this.listStmt = this.db.prepare(
      'SELECT * FROM tautulli_snapshots ORDER BY captured_at DESC LIMIT ?',
    );
  }

  recordSnapshot<TPayload>(payload: TPayload): TautulliSnapshotRecord<TPayload> {
    const payloadJson = JSON.stringify(payload);
    const info = this.insertStmt.run({ payload: payloadJson });
    const record = this.getById(Number(info.lastInsertRowid)) as
      | TautulliSnapshotRecord<TPayload>
      | null;

    if (!record) {
      throw new Error('Failed to read snapshot after insertion.');
    }

    return record;
  }

  getById<TPayload>(id: number): TautulliSnapshotRecord<TPayload> | null {
    const row = this.getByIdStmt.get(id) as SnapshotRow | undefined;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      capturedAt: row.captured_at,
      payload: JSON.parse(row.payload) as TPayload,
    };
  }

  listLatest<TPayload>(limit: number): TautulliSnapshotRecord<TPayload>[] {
    const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 1;
    const rows = this.listStmt.all(safeLimit) as SnapshotRow[];
    return rows.map((row) => ({
      id: row.id,
      capturedAt: row.captured_at,
      payload: JSON.parse(row.payload) as TPayload,
    }));
  }
}

export default TautulliSnapshotRepository;
