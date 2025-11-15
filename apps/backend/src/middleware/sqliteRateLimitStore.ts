import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import type { Store } from 'express-rate-limit';

interface SQLiteRateLimitStoreOptions {
  databasePath: string;
  windowMs: number;
  keyPrefix: string;
  tableName?: string;
}

interface RateLimitRow {
  hits: number;
  resetTime: number;
}

const DEFAULT_TABLE = 'rate_limit';
const connections = new Map<string, Database.Database>();

const resolveDatabase = (filePath: string): Database.Database => {
  const resolvedPath = path.resolve(filePath);

  if (!connections.has(resolvedPath)) {
    if (resolvedPath !== ':memory:') {
      const dir = path.dirname(resolvedPath);
      fs.mkdirSync(dir, { recursive: true });
    }
    const db = new Database(resolvedPath);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = -16000');
    connections.set(resolvedPath, db);
  }

  return connections.get(resolvedPath)!;
};

const sanitizeTableName = (input?: string) => {
  if (!input) return DEFAULT_TABLE;
  return /^[A-Za-z0-9_]+$/.test(input) ? input : DEFAULT_TABLE;
};

export class SQLiteRateLimitStore implements Store {
  private readonly db: Database.Database;
  private readonly windowMs: number;
  private readonly tableName: string;
  private readonly keyPrefix: string;
  private readonly selectStmt: Database.Statement;
  private readonly upsertStmt: Database.Statement;
  private readonly updateStmt: Database.Statement;
  private readonly deleteStmt: Database.Statement;
  private readonly clearExpiredStmt: Database.Statement;
  private readonly truncateStmt: Database.Statement;

  constructor({ databasePath, windowMs, keyPrefix, tableName }: SQLiteRateLimitStoreOptions) {
    this.windowMs = windowMs;
    this.keyPrefix = keyPrefix;
    this.tableName = sanitizeTableName(tableName);
    this.db = resolveDatabase(databasePath);
    this.ensureTable();

    const table = this.tableName;
    this.selectStmt = this.db.prepare(
      `SELECT hits, resetTime FROM ${table} WHERE key = ?`,
    );
    this.upsertStmt = this.db.prepare(
      `INSERT INTO ${table} (key, hits, resetTime, updatedAt)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         hits = excluded.hits,
         resetTime = excluded.resetTime,
         updatedAt = excluded.updatedAt`,
    );
    this.updateStmt = this.db.prepare(
      `UPDATE ${table} SET hits = ?, updatedAt = ? WHERE key = ?`,
    );
    this.deleteStmt = this.db.prepare(`DELETE FROM ${table} WHERE key = ?`);
    this.clearExpiredStmt = this.db.prepare(
      `DELETE FROM ${table} WHERE resetTime <= ?`,
    );
    this.truncateStmt = this.db.prepare(`DELETE FROM ${table}`);
  }

  private ensureTable() {
    const table = this.tableName;
    this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS ${table} (
          key TEXT PRIMARY KEY,
          hits INTEGER NOT NULL,
          resetTime INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL
        )`,
      )
      .run();
    this.db
      .prepare(`CREATE INDEX IF NOT EXISTS idx_${table}_resetTime ON ${table}(resetTime)`)
      .run();
  }

  private namespacedKey(key: string) {
    return `${this.keyPrefix}:${key}`;
  }

  increment(key: string) {
    this.pruneExpired();

    const now = Date.now();
    const namespaced = this.namespacedKey(key);
    const row = this.selectStmt.get(namespaced) as RateLimitRow | undefined;

    if (!row || row.resetTime <= now) {
      const resetTime = now + this.windowMs;
      this.upsertStmt.run(namespaced, 1, resetTime, now);
      return {
        totalHits: 1,
        resetTime: new Date(resetTime),
      };
    }

    const totalHits = row.hits + 1;
    this.updateStmt.run(totalHits, now, namespaced);
    return {
      totalHits,
      resetTime: new Date(row.resetTime),
    };
  }

  decrement(_key: string) {
    // No-op: not required for our use case
  }

  resetKey(key: string) {
    this.deleteStmt.run(this.namespacedKey(key));
  }

  resetAll() {
    this.truncateStmt.run();
  }

  private pruneExpired() {
    const now = Date.now();
    this.clearExpiredStmt.run(now);
  }
}

export const createSQLiteRateLimitStore = (options: SQLiteRateLimitStoreOptions): Store => {
  return new SQLiteRateLimitStore(options);
};
