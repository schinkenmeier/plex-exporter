import { and, asc, desc, eq, like, or, sql } from 'drizzle-orm';
import type { DrizzleDatabase } from '../db/index.js';
import { mediaItems } from '../db/schema.js';

type MediaRow = typeof mediaItems.$inferSelect;
type MediaInsert = typeof mediaItems.$inferInsert;

const escapeJsonLike = (value: string) => value.replace(/"/g, '""');

const normalizeMediaType = (value?: string | null): 'movie' | 'tv' => {
  if (value === 'tv' || value === 'show') {
    return 'tv';
  }
  return 'movie';
};

const mapRowToRecord = (row: MediaRow): MediaRecord => ({
  id: row.id,
  plexId: row.tautulliId,
  title: row.title,
  sortTitle: row.sortTitle ?? null,
  librarySectionId: row.librarySectionId ?? null,
  mediaType: row.type,
  year: row.year ?? null,
  guid: row.guid ?? null,
  summary: row.summary ?? null,
  plexAddedAt: row.plexAddedAt ?? null,
  plexUpdatedAt: row.plexUpdatedAt ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  genres: row.genres ?? null,
  directors: row.directors ?? null,
  writers: row.writers ?? null,
  countries: row.countries ?? null,
  collections: row.collections ?? null,
  rating: row.rating ?? null,
  audienceRating: row.audienceRating ?? null,
  contentRating: row.contentRating ?? null,
  studio: row.studio ?? null,
  tagline: row.tagline ?? null,
  duration: row.duration ?? null,
  addedAt: row.addedAt ?? null,
  originallyAvailableAt: row.originallyAvailableAt ?? null,
  poster: row.poster ?? null,
  backdrop: row.backdrop ?? null,
});

const prepareInsert = (input: MediaCreateInput): MediaInsert => ({
  tautulliId: input.plexId,
  title: input.title,
  sortTitle: input.sortTitle ?? null,
  librarySectionId: input.librarySectionId ?? null,
  type: normalizeMediaType(input.mediaType),
  year: input.year ?? null,
  guid: input.guid ?? null,
  summary: input.summary ?? null,
  plexAddedAt: input.plexAddedAt ?? null,
  plexUpdatedAt: input.plexUpdatedAt ?? null,
  lastSyncedAt: input.lastSyncedAt ?? null,
  poster: input.poster ?? null,
  backdrop: input.backdrop ?? null,
  genres: input.genres ?? null,
  directors: input.directors ?? null,
  writers: input.writers ?? null,
  countries: input.countries ?? null,
  collections: input.collections ?? null,
  rating: input.rating ?? null,
  audienceRating: input.audienceRating ?? null,
  contentRating: input.contentRating ?? null,
  studio: input.studio ?? null,
  tagline: input.tagline ?? null,
  duration: input.duration ?? null,
  addedAt: input.addedAt ?? null,
  originallyAvailableAt: input.originallyAvailableAt ?? null,
});

const buildSortExpressions = (
  sortBy: MediaFilterOptions['sortBy'],
  sortOrder: 'asc' | 'desc',
) => {
  switch (sortBy) {
    case 'year':
      return [
        sortOrder === 'desc' ? desc(mediaItems.year) : asc(mediaItems.year),
        asc(mediaItems.title),
      ];
    case 'added':
      return [
        sortOrder === 'desc' ? desc(mediaItems.plexAddedAt) : asc(mediaItems.plexAddedAt),
        asc(mediaItems.title),
      ];
    case 'updated':
      return [
        sortOrder === 'desc' ? desc(mediaItems.updatedAt) : asc(mediaItems.updatedAt),
        asc(mediaItems.title),
      ];
    case 'title':
    default:
      return [sortOrder === 'desc' ? desc(mediaItems.title) : asc(mediaItems.title)];
  }
};

export interface MediaRecord {
  id: number;
  plexId: string;
  title: string;
  sortTitle: string | null;
  librarySectionId: number | null;
  mediaType: 'movie' | 'tv';
  year: number | null;
  guid: string | null;
  summary: string | null;
  plexAddedAt: string | null;
  plexUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  genres: string[] | null;
  directors: string[] | null;
  writers: string[] | null;
  countries: string[] | null;
  collections: string[] | null;
  rating: number | null;
  audienceRating: number | null;
  contentRating: string | null;
  studio: string | null;
  tagline: string | null;
  duration: number | null;
  addedAt: string | null;
  originallyAvailableAt: string | null;
  poster: string | null;
  backdrop: string | null;
}

export interface MediaCreateInput {
  plexId: string;
  title: string;
  sortTitle?: string | null;
  librarySectionId?: number | null;
  mediaType?: 'movie' | 'tv';
  year?: number | null;
  guid?: string | null;
  summary?: string | null;
  plexAddedAt?: string | null;
  plexUpdatedAt?: string | null;
  poster?: string | null;
  lastSyncedAt?: string | null;
  backdrop?: string | null;
  genres?: string[] | null;
  directors?: string[] | null;
  writers?: string[] | null;
  countries?: string[] | null;
  collections?: string[] | null;
  rating?: number | null;
  audienceRating?: number | null;
  contentRating?: string | null;
  studio?: string | null;
  tagline?: string | null;
  duration?: number | null;
  addedAt?: string | null;
  originallyAvailableAt?: string | null;
}

export interface MediaUpdateInput extends Partial<MediaCreateInput> {}

export interface MediaFilterOptions {
  mediaType?: 'movie' | 'tv' | null;
  librarySectionId?: number | null;
  year?: number | null;
  yearFrom?: number | null;
  yearTo?: number | null;
  search?: string | null;
  genres?: string[] | null;
  collection?: string | null;
  onlyNew?: boolean | null;
  newDays?: number | null;
  limit?: number;
  offset?: number;
  sortBy?: 'title' | 'year' | 'added' | 'updated';
  sortOrder?: 'asc' | 'desc';
}

export class MediaRepository {
  constructor(private readonly db: DrizzleDatabase) {}

  create(input: MediaCreateInput): MediaRecord {
    const inserted = this.db
      .insert(mediaItems)
      .values([prepareInsert(input)])
      .returning()
      .all();

    const row = inserted[0];
    if (!row) {
      throw new Error('Failed to insert media item.');
    }

    return mapRowToRecord(row);
  }

  getById(id: number): MediaRecord | null {
    const rows = this.db.select().from(mediaItems).where(eq(mediaItems.id, id)).limit(1).all();
    return rows[0] ? mapRowToRecord(rows[0]) : null;
  }

  getByPlexId(plexId: string): MediaRecord | null {
    const rows = this.db
      .select()
      .from(mediaItems)
      .where(eq(mediaItems.tautulliId, plexId))
      .limit(1)
      .all();
    return rows[0] ? mapRowToRecord(rows[0]) : null;
  }

  listAll(): MediaRecord[] {
    const rows = this.db.select().from(mediaItems).orderBy(asc(mediaItems.title)).all();
    return rows.map(mapRowToRecord);
  }

  update(id: number, input: MediaUpdateInput): MediaRecord | null {
    const existing = this.getById(id);
    if (!existing) {
      return null;
    }

    const changes: Partial<MediaInsert> = {};

    if (input.plexId !== undefined) changes.tautulliId = input.plexId;
    if (input.title !== undefined) changes.title = input.title;
    if (input.sortTitle !== undefined) changes.sortTitle = input.sortTitle ?? null;
    if (input.librarySectionId !== undefined) changes.librarySectionId = input.librarySectionId ?? null;
    if (input.mediaType !== undefined) changes.type = normalizeMediaType(input.mediaType);
    if (input.year !== undefined) changes.year = input.year ?? null;
    if (input.guid !== undefined) changes.guid = input.guid ?? null;
    if (input.summary !== undefined) changes.summary = input.summary ?? null;
    if (input.plexAddedAt !== undefined) changes.plexAddedAt = input.plexAddedAt ?? null;
    if (input.plexUpdatedAt !== undefined) changes.plexUpdatedAt = input.plexUpdatedAt ?? null;
    if (input.lastSyncedAt !== undefined) changes.lastSyncedAt = input.lastSyncedAt ?? null;
    if (input.poster !== undefined) changes.poster = input.poster ?? null;
    if (input.backdrop !== undefined) changes.backdrop = input.backdrop ?? null;
    if (input.genres !== undefined) changes.genres = input.genres ?? null;
    if (input.directors !== undefined) changes.directors = input.directors ?? null;
    if (input.writers !== undefined) changes.writers = input.writers ?? null;
    if (input.countries !== undefined) changes.countries = input.countries ?? null;
    if (input.collections !== undefined) changes.collections = input.collections ?? null;
    if (input.rating !== undefined) changes.rating = input.rating ?? null;
    if (input.audienceRating !== undefined) changes.audienceRating = input.audienceRating ?? null;
    if (input.contentRating !== undefined) changes.contentRating = input.contentRating ?? null;
    if (input.studio !== undefined) changes.studio = input.studio ?? null;
    if (input.tagline !== undefined) changes.tagline = input.tagline ?? null;
    if (input.duration !== undefined) changes.duration = input.duration ?? null;
    if (input.addedAt !== undefined) changes.addedAt = input.addedAt ?? null;
    if (input.originallyAvailableAt !== undefined) {
      changes.originallyAvailableAt = input.originallyAvailableAt ?? null;
    }

    if (Object.keys(changes).length === 0) {
      return existing;
    }

    this.db
      .update(mediaItems)
      .set({ ...changes, updatedAt: sql`datetime('now')` })
      .where(eq(mediaItems.id, id))
      .run();

    return this.getById(id);
  }

  delete(id: number): boolean {
    const result = this.db.delete(mediaItems).where(eq(mediaItems.id, id)).run();
    return result.changes > 0;
  }

  bulkInsert(items: MediaCreateInput[]): number {
    if (items.length === 0) {
      return 0;
    }

    this.db.transaction((tx) => {
      tx.insert(mediaItems)
        .values(items.map((item) => prepareInsert(item)))
        .run();
    });

    return items.length;
  }

  filter(options: MediaFilterOptions = {}): MediaRecord[] {
    const conditions = [];

    if (options.mediaType) {
      conditions.push(eq(mediaItems.type, options.mediaType));
    }
    if (options.librarySectionId !== undefined && options.librarySectionId !== null) {
      conditions.push(eq(mediaItems.librarySectionId, options.librarySectionId));
    }
    if (options.year !== undefined && options.year !== null) {
      conditions.push(eq(mediaItems.year, options.year));
    }
    if (options.yearFrom !== undefined && options.yearFrom !== null) {
      conditions.push(sql`${mediaItems.year} >= ${options.yearFrom}`);
    }
    if (options.yearTo !== undefined && options.yearTo !== null) {
      conditions.push(sql`${mediaItems.year} <= ${options.yearTo}`);
    }
    if (options.search) {
      const searchValue = `%${options.search}%`;
      conditions.push(
        or(like(mediaItems.title, searchValue), like(mediaItems.summary, searchValue)),
      );
    }
    if (options.genres && options.genres.length) {
      for (const genreRaw of options.genres) {
        const trimmed = typeof genreRaw === 'string' ? genreRaw.trim() : '';
        if (!trimmed) continue;
        const pattern = `%\"${escapeJsonLike(trimmed)}\"%`;
        conditions.push(sql`coalesce(${mediaItems.genres}, '') LIKE ${pattern}`);
      }
    }
    if (options.collection) {
      const trimmed = options.collection.trim();
      if (trimmed) {
        const pattern = `%\"${escapeJsonLike(trimmed)}\"%`;
        conditions.push(sql`coalesce(${mediaItems.collections}, '') LIKE ${pattern}`);
      }
    }
    if (options.onlyNew) {
      const windowDays =
        options.newDays != null && Number.isFinite(options.newDays) && options.newDays > 0
          ? Math.floor(options.newDays)
          : 30;
      conditions.push(sql`julianday(${mediaItems.addedAt}) >= julianday('now') - ${windowDays}`);
    }

    const condition =
      conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : and(...conditions);

    const sortOrder = options.sortOrder === 'desc' ? 'desc' : 'asc';
    const orderExpressions = buildSortExpressions(options.sortBy, sortOrder);

    const limit = options.limit && options.limit > 0 ? options.limit : 50;
    const offset = options.offset && options.offset > 0 ? options.offset : 0;

    const baseSelect = this.db.select().from(mediaItems);
    const filtered = condition ? baseSelect.where(condition) : baseSelect;
    const ordered =
      orderExpressions.length > 0 ? filtered.orderBy(...orderExpressions) : filtered;

    return ordered
      .limit(limit)
      .offset(offset)
      .all()
      .map(mapRowToRecord);
  }

  count(options: MediaFilterOptions = {}): number {
    const conditions = [];

    if (options.mediaType) {
      conditions.push(eq(mediaItems.type, options.mediaType));
    }
    if (options.year !== undefined && options.year !== null) {
      conditions.push(eq(mediaItems.year, options.year));
    }
    if (options.yearFrom !== undefined && options.yearFrom !== null) {
      conditions.push(sql`${mediaItems.year} >= ${options.yearFrom}`);
    }
    if (options.yearTo !== undefined && options.yearTo !== null) {
      conditions.push(sql`${mediaItems.year} <= ${options.yearTo}`);
    }
    if (options.search) {
      const searchValue = `%${options.search}%`;
      conditions.push(
        or(like(mediaItems.title, searchValue), like(mediaItems.summary, searchValue)),
      );
    }
    if (options.genres && options.genres.length) {
      for (const genreRaw of options.genres) {
        const trimmed = typeof genreRaw === 'string' ? genreRaw.trim() : '';
        if (!trimmed) continue;
        const pattern = `%\"${escapeJsonLike(trimmed)}\"%`;
        conditions.push(sql`coalesce(${mediaItems.genres}, '') LIKE ${pattern}`);
      }
    }
    if (options.collection) {
      const trimmed = options.collection.trim();
      if (trimmed) {
        const pattern = `%\"${escapeJsonLike(trimmed)}\"%`;
        conditions.push(sql`coalesce(${mediaItems.collections}, '') LIKE ${pattern}`);
      }
    }
    if (options.onlyNew) {
      const windowDays =
        options.newDays != null && Number.isFinite(options.newDays) && options.newDays > 0
          ? Math.floor(options.newDays)
          : 30;
      conditions.push(sql`julianday(${mediaItems.addedAt}) >= julianday('now') - ${windowDays}`);
    }

    const condition =
      conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : and(...conditions);

    const baseSelect = this.db.select({ count: sql<number>`count(*)` }).from(mediaItems);
    const result = condition ? baseSelect.where(condition).get() : baseSelect.get();
    return result?.count ?? 0;
  }

  getRecent(limit = 20, mediaType?: 'movie' | 'tv'): MediaRecord[] {
    const baseSelect = this.db.select().from(mediaItems);
    const filtered = mediaType ? baseSelect.where(eq(mediaItems.type, mediaType)) : baseSelect;
    const rows = filtered
      .orderBy(desc(mediaItems.plexAddedAt), desc(mediaItems.createdAt))
      .limit(limit)
      .all();

    return rows.map(mapRowToRecord);
  }
}

export default MediaRepository;
