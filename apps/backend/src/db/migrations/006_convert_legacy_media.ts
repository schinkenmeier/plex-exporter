import type { SqliteDatabase } from '../connection.js';
import type { Migration } from './types.js';

const legacyTableExists = (db: SqliteDatabase, name: string): boolean => {
  const stmt = db.prepare<[string], { name?: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
  );
  return Boolean(stmt.get(name));
};

const legacyColumnExists = (db: SqliteDatabase, table: string, column: string): boolean => {
  const info = db.prepare(`PRAGMA table_info('${table}')`).all() as Array<{ name: string }>;
  return info.some((entry) => entry.name === column);
};

export const convertLegacyMediaMigration: Migration = {
  id: '006_convert_legacy_media',
  name: 'convert legacy media tables to drizzle schema',
  up: (db: SqliteDatabase) => {
    const hasLegacyMedia = legacyTableExists(db, 'media_metadata');

    if (hasLegacyMedia) {
      if (!legacyColumnExists(db, 'media_metadata', 'sort_title')) {
        db.exec('ALTER TABLE media_metadata ADD COLUMN sort_title TEXT');
      }

      db.exec('DROP TABLE IF EXISTS media_items;');

      db.exec(`
        CREATE TABLE media_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tautulli_id TEXT NOT NULL UNIQUE,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          sort_title TEXT,
          library_section_id INTEGER,
          year INTEGER,
          rating REAL,
          content_rating TEXT,
          summary TEXT,
          tagline TEXT,
          duration INTEGER,
        poster TEXT,
        backdrop TEXT,
          studio TEXT,
          genres TEXT,
          directors TEXT,
          writers TEXT,
          countries TEXT,
        collections TEXT,
        audience_rating REAL,
        added_at TEXT,
        originally_available_at TEXT,
        guid TEXT,
        plex_updated_at TEXT,
        plex_added_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          tmdb_id INTEGER,
          tmdb_rating INTEGER,
          tmdb_vote_count INTEGER,
          tmdb_enriched INTEGER NOT NULL DEFAULT 0
        );
      `);

      db.exec(`
        INSERT INTO media_items (
          tautulli_id,
          type,
          title,
          sort_title,
          library_section_id,
          year,
          rating,
          content_rating,
          summary,
          tagline,
          duration,
          poster,
          backdrop,
          studio,
          genres,
          directors,
          writers,
          countries,
          collections,
          audience_rating,
          added_at,
          originally_available_at,
          guid,
          plex_updated_at,
          plex_added_at,
          created_at,
          updated_at
        )
        SELECT
          plex_id AS tautulli_id,
          CASE
            WHEN media_type = 'show' THEN 'tv'
            WHEN media_type IS NULL THEN 'movie'
            ELSE media_type
          END AS type,
          title,
          sort_title,
          library_section_id,
          year,
          rating,
          content_rating,
          summary,
          tagline,
          duration,
          NULL,
          NULL,
          studio,
          genres,
          directors,
          NULL,
          countries,
          collections,
          audience_rating,
          plex_added_at,
          originally_available_at,
          guid,
          plex_updated_at,
          plex_added_at,
          created_at,
          updated_at
        FROM media_metadata;
      `);

      db.exec('CREATE INDEX IF NOT EXISTS idx_media_items_type ON media_items(type);');
      db.exec('CREATE INDEX IF NOT EXISTS idx_media_items_title ON media_items(title);');
    }

    if (hasLegacyMedia || legacyTableExists(db, 'thumbnails')) {
      db.exec('DROP TABLE IF EXISTS media_thumbnails;');
      db.exec(`
        CREATE TABLE media_thumbnails (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          media_item_id INTEGER NOT NULL,
          path TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (media_item_id) REFERENCES media_items(id) ON DELETE CASCADE
        );
      `);

      if (hasLegacyMedia && legacyTableExists(db, 'thumbnails')) {
        db.exec(`
          INSERT INTO media_thumbnails (media_item_id, path, created_at)
          SELECT
            mi.id,
            t.path,
            t.created_at
          FROM thumbnails t
          INNER JOIN media_metadata mm ON t.media_id = mm.id
          INNER JOIN media_items mi ON mi.tautulli_id = mm.plex_id;
        `);
      }

      db.exec('CREATE INDEX IF NOT EXISTS idx_media_thumbnails_media ON media_thumbnails(media_item_id);');
    }

    if (legacyTableExists(db, 'thumbnails')) {
      db.exec('DROP TABLE thumbnails;');
    }

    if (hasLegacyMedia) {
      db.exec('DROP TABLE media_metadata;');
    }
  },
};
