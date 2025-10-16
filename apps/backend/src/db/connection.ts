import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type SqliteDatabase = Database.Database;

export interface CreateConnectionOptions extends Database.Options {}

export const createSqliteConnection = (
  filePath: string,
  options: CreateConnectionOptions = {},
): SqliteDatabase => {
  // For in-memory databases, don't create directories
  if (filePath !== ':memory:') {
    const resolvedPath = path.resolve(filePath);
    const directory = path.dirname(resolvedPath);
    fs.mkdirSync(directory, { recursive: true });
  }

  const database = new Database(filePath, { ...options });

  // Enable foreign key constraints
  database.pragma('foreign_keys = ON');

  // WAL mode for better concurrency (multiple readers, one writer)
  database.pragma('journal_mode = WAL');

  // Performance optimizations for better-sqlite3
  database.pragma('cache_size = -64000');          // 64MB cache (negative = KB)
  database.pragma('temp_store = MEMORY');           // Store temp tables in memory
  database.pragma('mmap_size = 268435456');        // 256MB memory-mapped I/O
  database.pragma('page_size = 4096');             // Optimal page size for most systems
  database.pragma('synchronous = NORMAL');          // Balance between safety and speed (WAL mode)

  return database;
};

export const closeConnection = (database: SqliteDatabase) => {
  database.close();
};
