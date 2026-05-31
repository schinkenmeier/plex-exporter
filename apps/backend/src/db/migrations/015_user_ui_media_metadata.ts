import type { SqliteDatabase } from '../connection.js';
import type { Migration } from './types.js';

const addColumnIfMissing = (db: SqliteDatabase, existingColumns: Set<string>, columnName: string, definition: string) => {
  if (existingColumns.has(columnName)) {
    return;
  }
  db.exec(`ALTER TABLE media_items ADD COLUMN ${definition};`);
  existingColumns.add(columnName);
};

export const userUiMediaMetadataMigration: Migration = {
  id: '015_user_ui_media_metadata',
  name: 'add user ui media metadata fields',
  up: (db: SqliteDatabase) => {
    const existingColumns = new Set(
      db.prepare<[], { name: string }>('PRAGMA table_info(media_items)').all().map((column) => column.name),
    );
    addColumnIfMissing(db, existingColumns, 'languages', 'languages TEXT');
    addColumnIfMissing(db, existingColumns, 'original_language', 'original_language TEXT');
    addColumnIfMissing(db, existingColumns, 'trailer_youtube_id', 'trailer_youtube_id TEXT');
    addColumnIfMissing(db, existingColumns, 'trailer_site', 'trailer_site TEXT');
    addColumnIfMissing(db, existingColumns, 'trailer_name', 'trailer_name TEXT');
    addColumnIfMissing(db, existingColumns, 'trailer_url', 'trailer_url TEXT');
    db.exec('CREATE INDEX IF NOT EXISTS idx_media_items_studio ON media_items(studio);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_media_items_rating ON media_items(rating);');
  },
};
