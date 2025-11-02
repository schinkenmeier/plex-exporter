import 'dotenv/config';
import { config } from '../config/index.js';
import { initializeDrizzleDatabase } from '../db/index.js';
import { mediaItems } from '../db/schema.js';
import logger from '../services/logger.js';
import type { SqliteDatabase } from '../db/connection.js';

interface LegacyMediaRow {
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
  created_at: string;
  updated_at: string;
}

const normalizeMediaType = (value: string | null): 'movie' | 'tv' => {
  if (!value) return 'movie';
  const lower = value.toLowerCase();
  if (lower === 'tv' || lower === 'show') {
    return 'tv';
  }
  return 'movie';
};

const tableExists = (db: SqliteDatabase, name: string): boolean => {
  const stmt = db.prepare<[string], { name?: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
  );
  return Boolean(stmt.get(name));
};

const parseJsonArray = (value: string | null): string[] | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

async function migrateLegacyMedia() {
  const { sqlite, db } = initializeDrizzleDatabase({
    filePath: config.database.sqlitePath,
  });

  if (!tableExists(sqlite, 'media_metadata')) {
    logger.info('[migration] Legacy table media_metadata not found. Skipping migration.');
    return;
  }

  logger.info('[migration] Starting media migration to drizzle tables');

  const legacyRows = sqlite
    .prepare<[], LegacyMediaRow>(`
      SELECT
        id,
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
        originally_available_at,
        created_at,
        updated_at
      FROM media_metadata
      ORDER BY id ASC
    `)
    .all();

  if (legacyRows.length === 0) {
    logger.info('[migration] No legacy media records found. Nothing to migrate.');
    return;
  }

  const existingIds = new Set<string>(
    db
      .select({ tautulliId: mediaItems.tautulliId })
      .from(mediaItems)
      .all()
      .map((row) => row.tautulliId),
  );

  let migrated = 0;
  let skipped = 0;

  for (const row of legacyRows) {
    const tautulliId = row.plex_id;
    if (!tautulliId || existingIds.has(tautulliId)) {
      skipped += 1;
      continue;
    }

    try {
      const ratingValue =
        typeof row.rating === 'number' && !Number.isNaN(row.rating) ? row.rating : null;

      db.insert(mediaItems)
        .values([
          {
            tautulliId,
            type: normalizeMediaType(row.media_type),
            title: row.title,
            sortTitle: null,
            librarySectionId: row.library_section_id ?? null,
            year: row.year ?? null,
            guid: row.guid ?? null,
            summary: row.summary ?? null,
            plexAddedAt: row.plex_added_at ?? null,
            plexUpdatedAt: row.plex_updated_at ?? null,
            genres: parseJsonArray(row.genres),
            directors: parseJsonArray(row.directors),
            writers: null,
            countries: parseJsonArray(row.countries),
            collections: parseJsonArray(row.collections),
            rating: ratingValue,
            audienceRating: row.audience_rating ?? null,
            contentRating: row.content_rating ?? null,
            studio: row.studio ?? null,
            tagline: row.tagline ?? null,
            duration: row.duration ?? null,
            addedAt: row.plex_added_at ?? null,
            originallyAvailableAt: row.originally_available_at ?? null,
            poster: null,
            backdrop: null,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          },
        ])
        .run();

      existingIds.add(tautulliId);
      migrated += 1;
    } catch (error) {
      skipped += 1;
      logger.error('[migration] Failed to insert media item', {
        error: error instanceof Error ? error.message : error,
        legacyId: row.id,
        plexId: tautulliId,
      });
    }
  }

  logger.info('[migration] Migration summary', { migrated, skipped });
}

migrateLegacyMedia()
  .then(() => {
    logger.info('[migration] Media migration completed');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('[migration] Media migration failed', {
      error: error instanceof Error ? error.message : error,
    });
    process.exit(1);
  });
