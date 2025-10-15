import type Database from 'better-sqlite3';
import type { SqliteDatabase } from '../db/connection.js';

interface MediaRow {
  id: number;
  plex_id: string;
  title: string;
  library_section_id: number | null;
  media_type: string | null;
  year: number | null;
  guid: string | null;
  summary: string | null;
  plex_added_at: string | null;
  plex_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MediaRecord {
  id: number;
  plexId: string;
  title: string;
  librarySectionId: number | null;
  mediaType: string | null;
  year: number | null;
  guid: string | null;
  summary: string | null;
  plexAddedAt: string | null;
  plexUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MediaCreateInput {
  plexId: string;
  title: string;
  librarySectionId?: number | null;
  mediaType?: string | null;
  year?: number | null;
  guid?: string | null;
  summary?: string | null;
  plexAddedAt?: string | null;
  plexUpdatedAt?: string | null;
}

export interface MediaUpdateInput {
  plexId?: string;
  title?: string;
  librarySectionId?: number | null;
  mediaType?: string | null;
  year?: number | null;
  guid?: string | null;
  summary?: string | null;
  plexAddedAt?: string | null;
  plexUpdatedAt?: string | null;
}

const mapRowToRecord = (row: MediaRow): MediaRecord => ({
  id: row.id,
  plexId: row.plex_id,
  title: row.title,
  librarySectionId: row.library_section_id,
  mediaType: row.media_type,
  year: row.year,
  guid: row.guid,
  summary: row.summary,
  plexAddedAt: row.plex_added_at,
  plexUpdatedAt: row.plex_updated_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toNullable = <T>(value: T | null | undefined): T | null =>
  value === undefined ? null : value;

type Statement<Params extends unknown[] = unknown[], Result = unknown> = Database.Statement<Params, Result>;

export class MediaRepository {
  private readonly insertStmt: Statement;
  private readonly getByIdStmt: Statement<[number], MediaRow>;
  private readonly getByPlexIdStmt: Statement<[string], MediaRow>;
  private readonly listStmt: Statement<[], MediaRow>;
  private readonly deleteStmt: Statement<[number]>;

  constructor(private readonly db: SqliteDatabase) {
    this.insertStmt = this.db.prepare(`
      INSERT INTO media_metadata (
        plex_id,
        title,
        library_section_id,
        media_type,
        year,
        guid,
        summary,
        plex_added_at,
        plex_updated_at
      ) VALUES (@plexId, @title, @librarySectionId, @mediaType, @year, @guid, @summary, @plexAddedAt, @plexUpdatedAt)
    `);

    this.getByIdStmt = this.db.prepare<[number], MediaRow>(
      'SELECT * FROM media_metadata WHERE id = ?',
    );
    this.getByPlexIdStmt = this.db.prepare<[string], MediaRow>(
      'SELECT * FROM media_metadata WHERE plex_id = ?',
    );
    this.listStmt = this.db.prepare<[], MediaRow>(
      'SELECT * FROM media_metadata ORDER BY title COLLATE NOCASE ASC',
    );
    this.deleteStmt = this.db.prepare<[number]>(
      'DELETE FROM media_metadata WHERE id = ?',
    );
  }

  create(input: MediaCreateInput): MediaRecord {
    const info = this.insertStmt.run({
      plexId: input.plexId,
      title: input.title,
      librarySectionId: toNullable(input.librarySectionId),
      mediaType: toNullable(input.mediaType),
      year: toNullable(input.year),
      guid: toNullable(input.guid),
      summary: toNullable(input.summary),
      plexAddedAt: toNullable(input.plexAddedAt),
      plexUpdatedAt: toNullable(input.plexUpdatedAt),
    });

    const record = this.getById(Number(info.lastInsertRowid));

    if (!record) {
      throw new Error('Failed to fetch media record after insertion.');
    }

    return record;
  }

  getById(id: number): MediaRecord | null {
    const row = this.getByIdStmt.get(id);
    return row ? mapRowToRecord(row) : null;
  }

  getByPlexId(plexId: string): MediaRecord | null {
    const row = this.getByPlexIdStmt.get(plexId);
    return row ? mapRowToRecord(row) : null;
  }

  listAll(): MediaRecord[] {
    const rows = this.listStmt.all();
    return rows.map((row) => mapRowToRecord(row));
  }

  update(id: number, input: MediaUpdateInput): MediaRecord | null {
    const assignments: string[] = [];
    const params: Record<string, unknown> = { id };

    if (input.plexId !== undefined) {
      assignments.push('plex_id = @plexId');
      params.plexId = input.plexId;
    }

    if (input.title !== undefined) {
      assignments.push('title = @title');
      params.title = input.title;
    }

    if (input.librarySectionId !== undefined) {
      assignments.push('library_section_id = @librarySectionId');
      params.librarySectionId = toNullable(input.librarySectionId);
    }

    if (input.mediaType !== undefined) {
      assignments.push('media_type = @mediaType');
      params.mediaType = toNullable(input.mediaType);
    }

    if (input.year !== undefined) {
      assignments.push('year = @year');
      params.year = toNullable(input.year);
    }

    if (input.guid !== undefined) {
      assignments.push('guid = @guid');
      params.guid = toNullable(input.guid);
    }

    if (input.summary !== undefined) {
      assignments.push('summary = @summary');
      params.summary = toNullable(input.summary);
    }

    if (input.plexAddedAt !== undefined) {
      assignments.push('plex_added_at = @plexAddedAt');
      params.plexAddedAt = toNullable(input.plexAddedAt);
    }

    if (input.plexUpdatedAt !== undefined) {
      assignments.push('plex_updated_at = @plexUpdatedAt');
      params.plexUpdatedAt = toNullable(input.plexUpdatedAt);
    }

    if (assignments.length === 0) {
      return this.getById(id);
    }

    assignments.push("updated_at = datetime('now')");

    const updateStmt = this.db.prepare(
      `UPDATE media_metadata SET ${assignments.join(', ')} WHERE id = @id`,
    );

    updateStmt.run(params);

    return this.getById(id);
  }

  delete(id: number): boolean {
    const result = this.deleteStmt.run(id);
    return result.changes > 0;
  }

  /**
   * Bulk insert multiple media items in a single transaction
   * Much faster than inserting one by one
   */
  bulkInsert(items: MediaCreateInput[]): number {
    if (items.length === 0) return 0;

    const insertMany = this.db.transaction((mediaItems: MediaCreateInput[]) => {
      for (const item of mediaItems) {
        this.insertStmt.run({
          plexId: item.plexId,
          title: item.title,
          librarySectionId: toNullable(item.librarySectionId),
          mediaType: toNullable(item.mediaType),
          year: toNullable(item.year),
          guid: toNullable(item.guid),
          summary: toNullable(item.summary),
          plexAddedAt: toNullable(item.plexAddedAt),
          plexUpdatedAt: toNullable(item.plexUpdatedAt),
        });
      }
    });

    insertMany(items);
    return items.length;
  }
}

export default MediaRepository;
