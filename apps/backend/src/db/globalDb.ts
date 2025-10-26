/**
 * Global database instance for services
 *
 * This provides a singleton database connection that can be used
 * by services without requiring dependency injection.
 *
 * NOTE: This is initialized by the createServer function.
 */

import type { DrizzleDatabase } from './index.js';

let globalDb: DrizzleDatabase | null = null;

export function setGlobalDb(db: DrizzleDatabase): void {
  globalDb = db;
}

export function getGlobalDb(): DrizzleDatabase {
  if (!globalDb) {
    throw new Error('Global database has not been initialized. Call setGlobalDb() first.');
  }
  return globalDb;
}

export const db = new Proxy({} as DrizzleDatabase, {
  get(_target, prop) {
    const database = getGlobalDb();
    return (database as any)[prop];
  },
});
