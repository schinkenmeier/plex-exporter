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
  // Extended metadata
  genres: string | null;
  directors: string | null;
  countries: string | null;
  collections: string | null;
  rating: number | null;
  audience_rating: number | null;
  content_rating: string | null;
  studio: string | null;
  tagline: string | null;
  duration: number | null;
  originally_available_at: string | null;
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
  // Extended metadata
  genres: string[] | null;
  directors: string[] | null;
  countries: string[] | null;
  collections: string[] | null;
  rating: number | null;
  audienceRating: number | null;
  contentRating: string | null;
  studio: string | null;
  tagline: string | null;
  duration: number | null;
  originallyAvailableAt: string | null;
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
  // Extended metadata
  genres?: string[] | null;
  directors?: string[] | null;
  countries?: string[] | null;
  collections?: string[] | null;
  rating?: number | null;
  audienceRating?: number | null;
  contentRating?: string | null;
  studio?: string | null;
  tagline?: string | null;
  duration?: number | null;
  originallyAvailableAt?: string | null;
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
  // Extended metadata
  genres?: string[] | null;
  directors?: string[] | null;
  countries?: string[] | null;
  collections?: string[] | null;
  rating?: number | null;
  audienceRating?: number | null;
  contentRating?: string | null;
  studio?: string | null;
  tagline?: string | null;
  duration?: number | null;
  originallyAvailableAt?: string | null;
}

export interface MediaFilterOptions {
  mediaType?: 'movie' | 'tv' | null;
  year?: number | null;
  yearFrom?: number | null;
  yearTo?: number | null;
  search?: string | null;
  limit?: number;
  offset?: number;
  sortBy?: 'title' | 'year' | 'added' | 'updated';
  sortOrder?: 'asc' | 'desc';
}

const parseJsonArray = (jsonString: string | null): string[] | null => {
  if (!jsonString) return null;
  try {
    return JSON.parse(jsonString);
  } catch {
    return null;
  }
};

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
  // Extended metadata - parse JSON arrays
  genres: parseJsonArray(row.genres),
  directors: parseJsonArray(row.directors),
  countries: parseJsonArray(row.countries),
  collections: parseJsonArray(row.collections),
  rating: row.rating,
  audienceRating: row.audience_rating,
  contentRating: row.content_rating,
  studio: row.studio,
  tagline: row.tagline,
  duration: row.duration,
  originallyAvailableAt: row.originally_available_at,
});

const toNullable = <T>(value: T | null | undefined): T | null =>
  value === undefined ? null : value;

const serializeJsonArray = (arr: string[] | null | undefined): string | null => {
  if (!arr || arr.length === 0) return null;
  return JSON.stringify(arr);
};

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
        plex_updated_at,
        genres,
        directors,
        countries,
        collections,
        rating,
        audience_rating,
        content_rating,
        studio,
        tagline,
        duration,
        originally_available_at
      ) VALUES (
        @plexId, @title, @librarySectionId, @mediaType, @year, @guid, @summary, @plexAddedAt, @plexUpdatedAt,
        @genres, @directors, @countries, @collections, @rating, @audienceRating, @contentRating,
        @studio, @tagline, @duration, @originallyAvailableAt
      )
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
      // Extended metadata
      genres: serializeJsonArray(input.genres),
      directors: serializeJsonArray(input.directors),
      countries: serializeJsonArray(input.countries),
      collections: serializeJsonArray(input.collections),
      rating: toNullable(input.rating),
      audienceRating: toNullable(input.audienceRating),
      contentRating: toNullable(input.contentRating),
      studio: toNullable(input.studio),
      tagline: toNullable(input.tagline),
      duration: toNullable(input.duration),
      originallyAvailableAt: toNullable(input.originallyAvailableAt),
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

    // Extended metadata fields
    if (input.genres !== undefined) {
      assignments.push('genres = @genres');
      params.genres = serializeJsonArray(input.genres);
    }

    if (input.directors !== undefined) {
      assignments.push('directors = @directors');
      params.directors = serializeJsonArray(input.directors);
    }

    if (input.countries !== undefined) {
      assignments.push('countries = @countries');
      params.countries = serializeJsonArray(input.countries);
    }

    if (input.collections !== undefined) {
      assignments.push('collections = @collections');
      params.collections = serializeJsonArray(input.collections);
    }

    if (input.rating !== undefined) {
      assignments.push('rating = @rating');
      params.rating = toNullable(input.rating);
    }

    if (input.audienceRating !== undefined) {
      assignments.push('audience_rating = @audienceRating');
      params.audienceRating = toNullable(input.audienceRating);
    }

    if (input.contentRating !== undefined) {
      assignments.push('content_rating = @contentRating');
      params.contentRating = toNullable(input.contentRating);
    }

    if (input.studio !== undefined) {
      assignments.push('studio = @studio');
      params.studio = toNullable(input.studio);
    }

    if (input.tagline !== undefined) {
      assignments.push('tagline = @tagline');
      params.tagline = toNullable(input.tagline);
    }

    if (input.duration !== undefined) {
      assignments.push('duration = @duration');
      params.duration = toNullable(input.duration);
    }

    if (input.originallyAvailableAt !== undefined) {
      assignments.push('originally_available_at = @originallyAvailableAt');
      params.originallyAvailableAt = toNullable(input.originallyAvailableAt);
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
          // Extended metadata
          genres: serializeJsonArray(item.genres),
          directors: serializeJsonArray(item.directors),
          countries: serializeJsonArray(item.countries),
          collections: serializeJsonArray(item.collections),
          rating: toNullable(item.rating),
          audienceRating: toNullable(item.audienceRating),
          contentRating: toNullable(item.contentRating),
          studio: toNullable(item.studio),
          tagline: toNullable(item.tagline),
          duration: toNullable(item.duration),
          originallyAvailableAt: toNullable(item.originallyAvailableAt),
        });
      }
    });

    insertMany(items);
    return items.length;
  }

  /**
   * Filter and search media with pagination and sorting
   */
  filter(options: MediaFilterOptions = {}): MediaRecord[] {
    const whereClauses: string[] = [];
    const params: Record<string, unknown> = {};

    // Media type filter
    if (options.mediaType) {
      whereClauses.push('media_type = @mediaType');
      params.mediaType = options.mediaType;
    }

    // Year filters
    if (options.year !== undefined && options.year !== null) {
      whereClauses.push('year = @year');
      params.year = options.year;
    }

    if (options.yearFrom !== undefined && options.yearFrom !== null) {
      whereClauses.push('year >= @yearFrom');
      params.yearFrom = options.yearFrom;
    }

    if (options.yearTo !== undefined && options.yearTo !== null) {
      whereClauses.push('year <= @yearTo');
      params.yearTo = options.yearTo;
    }

    // Search filter (title or summary)
    if (options.search) {
      whereClauses.push('(title LIKE @search OR summary LIKE @search)');
      params.search = `%${options.search}%`;
    }

    // Build WHERE clause
    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Sorting
    const sortBy = options.sortBy || 'title';
    const sortOrder = options.sortOrder || 'asc';
    let orderByClause = '';

    switch (sortBy) {
      case 'title':
        orderByClause = `ORDER BY title COLLATE NOCASE ${sortOrder.toUpperCase()}`;
        break;
      case 'year':
        orderByClause = `ORDER BY year ${sortOrder.toUpperCase()}, title COLLATE NOCASE ASC`;
        break;
      case 'added':
        orderByClause = `ORDER BY plex_added_at ${sortOrder.toUpperCase()}, title COLLATE NOCASE ASC`;
        break;
      case 'updated':
        orderByClause = `ORDER BY updated_at ${sortOrder.toUpperCase()}, title COLLATE NOCASE ASC`;
        break;
    }

    // Pagination
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    const limitClause = `LIMIT @limit OFFSET @offset`;
    params.limit = limit;
    params.offset = offset;

    // Build and execute query
    const query = `SELECT * FROM media_metadata ${whereClause} ${orderByClause} ${limitClause}`;
    const stmt = this.db.prepare<MediaRow>(query);
    const rows = stmt.all(params) as MediaRow[];

    return rows.map((row) => mapRowToRecord(row));
  }

  /**
   * Count total items matching filter criteria (for pagination)
   */
  count(options: MediaFilterOptions = {}): number {
    const whereClauses: string[] = [];
    const params: Record<string, unknown> = {};

    if (options.mediaType) {
      whereClauses.push('media_type = @mediaType');
      params.mediaType = options.mediaType;
    }

    if (options.year !== undefined && options.year !== null) {
      whereClauses.push('year = @year');
      params.year = options.year;
    }

    if (options.yearFrom !== undefined && options.yearFrom !== null) {
      whereClauses.push('year >= @yearFrom');
      params.yearFrom = options.yearFrom;
    }

    if (options.yearTo !== undefined && options.yearTo !== null) {
      whereClauses.push('year <= @yearTo');
      params.yearTo = options.yearTo;
    }

    if (options.search) {
      whereClauses.push('(title LIKE @search OR summary LIKE @search)');
      params.search = `%${options.search}%`;
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const query = `SELECT COUNT(*) as count FROM media_metadata ${whereClause}`;
    const stmt = this.db.prepare(query);
    const result = stmt.get(params) as { count: number };

    return result.count;
  }

  /**
   * Get recent additions sorted by plex_added_at
   */
  getRecent(limit: number = 20, mediaType?: 'movie' | 'tv'): MediaRecord[] {
    let query = 'SELECT * FROM media_metadata';
    const params: Record<string, unknown> = {};

    if (mediaType) {
      query += ' WHERE media_type = @mediaType';
      params.mediaType = mediaType;
    }

    query += ' ORDER BY plex_added_at DESC LIMIT @limit';
    params.limit = limit;

    const stmt = this.db.prepare<MediaRow>(query);
    const rows = stmt.all(params) as MediaRow[];

    return rows.map((row) => mapRowToRecord(row));
  }
}

export default MediaRepository;
