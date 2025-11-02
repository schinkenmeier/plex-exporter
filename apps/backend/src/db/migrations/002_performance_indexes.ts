import type { Migration } from './types.js';

export const performanceIndexesMigration: Migration = {
  id: '002_performance_indexes',
  name: 'add performance indexes',
  up: (db) => {
    // Index for case-insensitive title search
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_media_title
      ON media_metadata(title COLLATE NOCASE);
    `);

    // Index for year filtering (timeline views, year-based queries)
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_media_year
      ON media_metadata(year DESC);
    `);

    // Index for media type filtering (movies vs series)
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_media_type
      ON media_metadata(media_type);
    `);

    // Composite index for common query patterns (type + year)
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_media_type_year
      ON media_metadata(media_type, year DESC);
    `);

    // Index for GUID lookups (external ID matching)
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_media_guid
      ON media_metadata(guid);
    `);

    // Index for plex_added_at for "recently added" queries
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_media_added_at
      ON media_metadata(plex_added_at DESC);
    `);

    console.log('[migration] Performance indexes created');
  },
};
