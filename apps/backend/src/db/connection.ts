import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type SqliteDatabase = Database.Database;

export interface CreateConnectionOptions extends Database.Options {}

export const createSqliteConnection = (
  filePath: string,
  options: CreateConnectionOptions = {},
): SqliteDatabase => {
  const resolvedPath = path.resolve(filePath);
  const directory = path.dirname(resolvedPath);

  fs.mkdirSync(directory, { recursive: true });

  const database = new Database(resolvedPath, { ...options });

  database.pragma('foreign_keys = ON');
  database.pragma('journal_mode = WAL');

  return database;
};

export const closeConnection = (database: SqliteDatabase) => {
  database.close();
};
