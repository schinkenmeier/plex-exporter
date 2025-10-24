import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export type SqliteDatabase = Database.Database;
export type DrizzleDatabase = BetterSQLite3Database<typeof schema>;

export interface CreateConnectionOptions extends Database.Options {}

export const createSqliteConnection = (
  filePath: string,
  options: CreateConnectionOptions = {},
): SqliteDatabase => {
  if (filePath !== ':memory:') {
    const resolvedPath = path.resolve(filePath);
    const directory = path.dirname(resolvedPath);
    fs.mkdirSync(directory, { recursive: true });
  }

  const database = new Database(filePath, { ...options });

  database.pragma('foreign_keys = ON');
  database.pragma('journal_mode = WAL');
  database.pragma('cache_size = -64000');
  database.pragma('temp_store = MEMORY');
  database.pragma('mmap_size = 268435456');
  database.pragma('page_size = 4096');
  database.pragma('synchronous = NORMAL');

  return database;
};

export const createDrizzle = (
  filePath: string,
  options: CreateConnectionOptions = {},
) => {
  const sqlite = createSqliteConnection(filePath, options);
  const db = drizzle(sqlite, { schema });
  return { sqlite, db };
};

export const closeConnection = (database: SqliteDatabase) => {
  database.close();
};
