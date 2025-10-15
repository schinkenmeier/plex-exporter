import { createSqliteConnection, type SqliteDatabase } from './connection.js';
import { runMigrations } from './migrations/index.js';

export interface InitializeDatabaseOptions {
  filePath: string;
}

export const initializeDatabase = ({ filePath }: InitializeDatabaseOptions): SqliteDatabase => {
  const db = createSqliteConnection(filePath);
  runMigrations(db);
  return db;
};

export type { SqliteDatabase };
