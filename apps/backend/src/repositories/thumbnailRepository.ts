import { asc, eq, inArray } from 'drizzle-orm';
import type { DrizzleDatabase } from '../db/index.js';
import { mediaThumbnails } from '../db/schema.js';

type ThumbnailRow = typeof mediaThumbnails.$inferSelect;

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
  mediaId: row.mediaItemId,
  path: row.path,
  createdAt: row.createdAt,
});

export class ThumbnailRepository {
  constructor(private readonly db: DrizzleDatabase) {}

  create(input: ThumbnailCreateInput): ThumbnailRecord {
    const [row] = this.db
      .insert(mediaThumbnails)
      .values({ mediaItemId: input.mediaId, path: input.path })
      .returning()
      .all();

    if (!row) {
      throw new Error('Failed to insert media thumbnail.');
    }

    return mapRowToRecord(row);
  }

  getById(id: number): ThumbnailRecord | null {
    const rows = this.db
      .select()
      .from(mediaThumbnails)
      .where(eq(mediaThumbnails.id, id))
      .limit(1)
      .all();
    return rows[0] ? mapRowToRecord(rows[0]) : null;
  }

  listByMediaId(mediaId: number): ThumbnailRecord[] {
    return this.db
      .select()
      .from(mediaThumbnails)
      .where(eq(mediaThumbnails.mediaItemId, mediaId))
      .orderBy(asc(mediaThumbnails.createdAt))
      .all()
      .map(mapRowToRecord);
  }

  deleteById(id: number): boolean {
    const result = this.db.delete(mediaThumbnails).where(eq(mediaThumbnails.id, id)).run();
    return result.changes > 0;
  }

  replaceForMedia(mediaId: number, paths: string[]): ThumbnailRecord[] {
    return this.db.transaction((tx) => {
      tx.delete(mediaThumbnails).where(eq(mediaThumbnails.mediaItemId, mediaId)).run();

      if (paths.length > 0) {
        tx.insert(mediaThumbnails)
          .values(
            paths.map((thumbnailPath) => ({
              mediaItemId: mediaId,
              path: thumbnailPath,
            })),
          )
          .run();
      }

      return tx
        .select()
        .from(mediaThumbnails)
        .where(eq(mediaThumbnails.mediaItemId, mediaId))
        .orderBy(asc(mediaThumbnails.createdAt))
        .all()
        .map(mapRowToRecord);
    });
  }

  /**
   * Bulk load thumbnails for multiple media IDs
   * Returns a Map of mediaId -> thumbnails[]
   * Much more efficient than calling listByMediaId() for each item
   */
  listByMediaIds(mediaIds: number[]): Map<number, ThumbnailRecord[]> {
    if (mediaIds.length === 0) {
      return new Map();
    }

    const rows = this.db
      .select()
      .from(mediaThumbnails)
      .where(inArray(mediaThumbnails.mediaItemId, mediaIds))
      .orderBy(asc(mediaThumbnails.mediaItemId), asc(mediaThumbnails.createdAt))
      .all();

    const grouped = new Map<number, ThumbnailRecord[]>();
    for (const row of rows) {
      const record = mapRowToRecord(row);
      const existing = grouped.get(record.mediaId) || [];
      existing.push(record);
      grouped.set(record.mediaId, existing);
    }

    return grouped;
  }
}

export default ThumbnailRepository;
