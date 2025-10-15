import type { Migration } from './index.js';

/**
 * Migration 003: Add extended metadata columns
 * Adds JSON columns for genres, directors, countries, collections, and rating fields
 */
export const extendedMetadataMigration: Migration = {
  id: '003_extended_metadata',
  name: 'add extended metadata columns',
  up: (db) => {
    // Add JSON columns for complex metadata
    db.exec(`
      ALTER TABLE media_metadata ADD COLUMN genres TEXT DEFAULT NULL;
    `);

    db.exec(`
      ALTER TABLE media_metadata ADD COLUMN directors TEXT DEFAULT NULL;
    `);

    db.exec(`
      ALTER TABLE media_metadata ADD COLUMN countries TEXT DEFAULT NULL;
    `);

    db.exec(`
      ALTER TABLE media_metadata ADD COLUMN collections TEXT DEFAULT NULL;
    `);

    // Add rating columns
    db.exec(`
      ALTER TABLE media_metadata ADD COLUMN rating REAL DEFAULT NULL;
    `);

    db.exec(`
      ALTER TABLE media_metadata ADD COLUMN audience_rating REAL DEFAULT NULL;
    `);

    db.exec(`
      ALTER TABLE media_metadata ADD COLUMN content_rating TEXT DEFAULT NULL;
    `);

    // Add other useful metadata
    db.exec(`
      ALTER TABLE media_metadata ADD COLUMN studio TEXT DEFAULT NULL;
    `);

    db.exec(`
      ALTER TABLE media_metadata ADD COLUMN tagline TEXT DEFAULT NULL;
    `);

    db.exec(`
      ALTER TABLE media_metadata ADD COLUMN duration INTEGER DEFAULT NULL;
    `);

    db.exec(`
      ALTER TABLE media_metadata ADD COLUMN originally_available_at TEXT DEFAULT NULL;
    `);

    console.log('[migration] Added extended metadata columns (genres, directors, ratings, etc.)');
  },

  down: (db) => {
    // SQLite doesn't support DROP COLUMN directly, would need table recreation
    // For now, we'll leave the columns (they can be NULL)
    console.warn('[migration] Rollback not fully supported - columns will remain with NULL values');
  },
};
