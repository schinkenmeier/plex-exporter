import {
  createSqliteConnection,
  createDrizzle,
  type SqliteDatabase,
  type DrizzleDatabase,
} from './connection.js';
import { runMigrations } from './migrations/index.js';

export interface InitializeDatabaseOptions {
  filePath: string;
}

export const initializeDatabase = ({ filePath }: InitializeDatabaseOptions): SqliteDatabase => {
  const db = createSqliteConnection(filePath);
  runMigrations(db);
  return db;
};

export const initializeDrizzleDatabase = ({ filePath }: InitializeDatabaseOptions) => {
  const { sqlite, db } = createDrizzle(filePath);
  runMigrations(sqlite);
  return { sqlite, db };
};

export type { SqliteDatabase, DrizzleDatabase };
