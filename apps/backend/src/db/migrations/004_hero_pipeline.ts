import type { SqliteDatabase } from '../connection.js';
import type { Migration } from './types.js';

export const heroPipelineMigration: Migration = {
  id: '004_hero_pipeline',
  name: 'add hero pipeline tables',
  up(db: SqliteDatabase) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS hero_pools (
        kind TEXT PRIMARY KEY,
        policy_hash TEXT NOT NULL,
        payload TEXT NOT NULL,
        history TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS hero_pools_expires_at_idx
        ON hero_pools (expires_at);
    `);
  },
};
