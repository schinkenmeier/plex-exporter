import type { SqliteDatabase } from '../connection.js';
import type { Migration } from './types.js';

export const integrationSettingsMigration: Migration = {
  id: '007_integration_settings',
  name: 'create integration settings table',
  up(db: SqliteDatabase) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS integration_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  },
};
