import type { SqliteDatabase } from '../db/connection.js';

interface ThumbnailRow {
  id: number;
  media_id: number;
  path: string;
  created_at: string;
}

export interface ThumbnailRecord {
  id: number;
  mediaId: number;
  path: string;
  createdAt: string;
}

export interface ThumbnailCreateInput {
  mediaId: number;
  path: string;
}

const mapRowToRecord = (row: ThumbnailRow): ThumbnailRecord => ({
  id: row.id,
  mediaId: row.media_id,
  path: row.path,
  createdAt: row.created_at,
});

export class ThumbnailRepository {
  private readonly insertStmt: ReturnType<SqliteDatabase['prepare']>;
  private readonly listByMediaStmt: ReturnType<SqliteDatabase['prepare']>;
  private readonly deleteByIdStmt: ReturnType<SqliteDatabase['prepare']>;
  private readonly deleteByMediaStmt: ReturnType<SqliteDatabase['prepare']>;
  private readonly getByIdStmt: ReturnType<SqliteDatabase['prepare']>;

  constructor(private readonly db: SqliteDatabase) {
    this.insertStmt = this.db.prepare(`
      INSERT INTO thumbnails (media_id, path) VALUES (@mediaId, @path)
    `);

    this.listByMediaStmt = this.db.prepare(
      'SELECT * FROM thumbnails WHERE media_id = ? ORDER BY created_at ASC',
    );

    this.deleteByIdStmt = this.db.prepare('DELETE FROM thumbnails WHERE id = ?');
    this.deleteByMediaStmt = this.db.prepare('DELETE FROM thumbnails WHERE media_id = ?');
    this.getByIdStmt = this.db.prepare('SELECT * FROM thumbnails WHERE id = ?');
  }

  create(input: ThumbnailCreateInput): ThumbnailRecord {
    const info = this.insertStmt.run({
      mediaId: input.mediaId,
      path: input.path,
    });

    const record = this.getById(Number(info.lastInsertRowid));

    if (!record) {
      throw new Error('Failed to fetch thumbnail record after insertion.');
    }

    return record;
  }

  getById(id: number): ThumbnailRecord | null {
    const row = this.getByIdStmt.get(id) as ThumbnailRow | undefined;
    return row ? mapRowToRecord(row) : null;
  }

  listByMediaId(mediaId: number): ThumbnailRecord[] {
    const rows = this.listByMediaStmt.all(mediaId) as ThumbnailRow[];
    return rows.map((row) => mapRowToRecord(row));
  }

  deleteById(id: number): boolean {
    const result = this.deleteByIdStmt.run(id);
    return result.changes > 0;
  }

  replaceForMedia(mediaId: number, paths: string[]): ThumbnailRecord[] {
    const run = this.db.transaction((thumbnailPaths: string[]) => {
      this.deleteByMediaStmt.run(mediaId);

      for (const thumbnailPath of thumbnailPaths) {
        this.insertStmt.run({ mediaId, path: thumbnailPath });
      }
    });

    run(paths);

    return this.listByMediaId(mediaId);
  }
}

export default ThumbnailRepository;
