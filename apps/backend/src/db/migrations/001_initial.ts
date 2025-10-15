import type { Migration } from './types.js';

export const initialMigration: Migration = {
  id: '001_initial',
  name: 'create core tables',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS media_metadata (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plex_id TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        library_section_id INTEGER,
        media_type TEXT,
        year INTEGER,
        guid TEXT,
        summary TEXT,
        plex_added_at TEXT,
        plex_updated_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS thumbnails (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        media_id INTEGER NOT NULL,
        path TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (media_id) REFERENCES media_metadata(id) ON DELETE CASCADE,
        UNIQUE(media_id, path)
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS tautulli_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        captured_at TEXT NOT NULL DEFAULT (datetime('now')),
        payload TEXT NOT NULL
      );
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_media_library_section ON media_metadata(library_section_id);
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_thumbnails_media_id ON thumbnails(media_id);
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tautulli_snapshots_captured_at ON tautulli_snapshots(captured_at DESC);
    `);
  },
};
