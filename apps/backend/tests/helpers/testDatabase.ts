import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  initializeDrizzleDatabase,
  type SqliteDatabase,
  type DrizzleDatabase,
} from '../../src/db/index.js';

export interface TestDatabaseHandle {
  sqlite: SqliteDatabase;
  drizzle: DrizzleDatabase;
  filePath: string;
  cleanup: () => void;
}

export const createTestDatabase = (): TestDatabaseHandle => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plex-exporter-backend-test-'));
  const filePath = path.join(tempDir, 'db.sqlite');
  const { sqlite, db } = initializeDrizzleDatabase({ filePath });

  return {
    sqlite,
    drizzle: db,
    filePath,
    cleanup: () => {
      sqlite.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    },
  };
};
