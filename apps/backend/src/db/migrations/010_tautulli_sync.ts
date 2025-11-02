import type { SqliteDatabase } from '../connection.js';
import type { Migration } from './types.js';

export const tautulliSyncMigration: Migration = {
  id: '010_tautulli_sync',
  name: 'add library sections, sync schedules, and lastSyncedAt',
  up(db: SqliteDatabase) {
    db.exec(`
      -- Library sections table for storing selected Tautulli libraries
      CREATE TABLE IF NOT EXISTS library_sections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        section_id INTEGER NOT NULL UNIQUE,
        section_name TEXT NOT NULL,
        section_type TEXT NOT NULL CHECK(section_type IN ('movie', 'show')),
        enabled INTEGER NOT NULL DEFAULT 1,
        last_synced_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- Sync schedules table for configurable automated syncs
      CREATE TABLE IF NOT EXISTS sync_schedules (
        id TEXT PRIMARY KEY,
        job_type TEXT NOT NULL CHECK(job_type IN ('tautulli_sync', 'cover_update')),
        cron_expression TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_run_at TEXT,
        next_run_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- Add lastSyncedAt to media_items for tracking sync status
      ALTER TABLE media_items ADD COLUMN last_synced_at TEXT;

      -- Create index for faster sync queries
      CREATE INDEX IF NOT EXISTS idx_media_items_last_synced
        ON media_items(last_synced_at);

      -- Create index for library section lookups
      CREATE INDEX IF NOT EXISTS idx_media_items_library_section
        ON media_items(library_section_id);
    `);
  },
};
