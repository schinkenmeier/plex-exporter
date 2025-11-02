import type { SqliteDatabase } from '../connection.js';
import type { Migration } from './types.js';

export const removeBookmarksMigration: Migration = {
  id: '009_remove_bookmarks',
  name: 'remove user_bookmarks table',
  up(db: SqliteDatabase) {
    db.exec(`
      DROP TABLE IF EXISTS user_bookmarks;
    `);
  },
};
