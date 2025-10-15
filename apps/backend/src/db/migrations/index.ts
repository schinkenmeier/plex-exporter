import type { SqliteDatabase } from '../connection.js';
import { initialMigration } from './001_initial.js';
import { performanceIndexesMigration } from './002_performance_indexes.js';
import type { Migration } from './types.js';

const migrations: Migration[] = [
  initialMigration,
  performanceIndexesMigration,
];

export const runMigrations = (db: SqliteDatabase) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const selectStmt = db.prepare<[], { id: string }>('SELECT id FROM schema_migrations');
  const appliedMigrations = new Set<string>(selectStmt.all().map((row) => row.id));

  const insertStmt = db.prepare(
    "INSERT INTO schema_migrations (id, applied_at) VALUES (?, datetime('now'))",
  );

  for (const migration of migrations) {
    if (appliedMigrations.has(migration.id)) {
      continue;
    }

    db.transaction(() => {
      migration.up(db);
      insertStmt.run(migration.id);
    })();
  }
};

export const getMigrations = (): readonly Migration[] => migrations;
