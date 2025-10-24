import type { SqliteDatabase } from '../connection.js';
import type { Migration } from './types.js';

export const schemaExpansionMigration: Migration = {
  id: '005_schema_expansion',
  name: 'introduce drizzle schema tables',
  up: (db: SqliteDatabase) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS media_items (
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
      CREATE TABLE IF NOT EXISTS seasons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        media_item_id INTEGER NOT NULL,
        tautulli_id TEXT NOT NULL UNIQUE,
        season_number INTEGER NOT NULL,
        title TEXT,
        summary TEXT,
        poster TEXT,
        episode_count INTEGER,
        FOREIGN KEY (media_item_id) REFERENCES media_items(id) ON DELETE CASCADE
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS episodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        season_id INTEGER NOT NULL,
        tautulli_id TEXT NOT NULL UNIQUE,
        episode_number INTEGER NOT NULL,
        title TEXT NOT NULL,
        summary TEXT,
        duration INTEGER,
        rating TEXT,
        air_date TEXT,
        thumb TEXT,
        FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS cast_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        role TEXT,
        photo TEXT
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS media_cast (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        media_item_id INTEGER NOT NULL,
        cast_member_id INTEGER NOT NULL,
        character TEXT,
        "order" INTEGER,
        FOREIGN KEY (media_item_id) REFERENCES media_items(id) ON DELETE CASCADE,
        FOREIGN KEY (cast_member_id) REFERENCES cast_members(id) ON DELETE CASCADE,
        UNIQUE(media_item_id, cast_member_id, "order")
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS media_thumbnails (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        media_item_id INTEGER NOT NULL,
        path TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (media_item_id) REFERENCES media_items(id) ON DELETE CASCADE
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS import_jobs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        items_processed INTEGER NOT NULL DEFAULT 0,
        total_items INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS email_campaigns (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        subject TEXT NOT NULL,
        template TEXT NOT NULL,
        recipient_emails TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        scheduled_for TEXT,
        sent_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS import_schedules (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        frequency TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_run_at TEXT,
        next_run_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);

    db.exec(`CREATE INDEX IF NOT EXISTS idx_media_items_type ON media_items(type);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_media_items_title ON media_items(title);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_seasons_media_item ON seasons(media_item_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_episodes_season_id ON episodes(season_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_media_cast_media_item ON media_cast(media_item_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_media_cast_cast_member ON media_cast(cast_member_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON import_jobs(status);`);
  },
};
