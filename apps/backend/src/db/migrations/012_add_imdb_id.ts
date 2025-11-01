import type { SqliteDatabase } from '../connection.js';
import type { Migration } from './types.js';

export const addImdbIdMigration: Migration = {
  id: '012_add_imdb_id',
  name: 'add imdb_id column to media_items table',
  up(db: SqliteDatabase) {
    db.exec(`
      ALTER TABLE media_items ADD COLUMN imdb_id TEXT;
    `);
  },
};

