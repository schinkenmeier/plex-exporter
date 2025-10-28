import type { SqliteDatabase } from '../connection.js';
import type { Migration } from './types.js';

export const tautulliConfigMigration: Migration = {
  id: '011_tautulli_config',
  name: 'add tautulli_config table for API connection settings',
  up(db: SqliteDatabase) {
    db.exec(`
      -- Tautulli configuration table for storing API connection settings
      CREATE TABLE IF NOT EXISTS tautulli_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tautulli_url TEXT NOT NULL,
        api_key TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- Create trigger to update updated_at timestamp
      CREATE TRIGGER IF NOT EXISTS update_tautulli_config_updated_at
      AFTER UPDATE ON tautulli_config
      FOR EACH ROW
      BEGIN
        UPDATE tautulli_config SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    `);
  },
};
