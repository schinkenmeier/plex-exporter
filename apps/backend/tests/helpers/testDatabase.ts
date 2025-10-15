import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { initializeDatabase, type SqliteDatabase } from '../../src/db/index.js';

export interface TestDatabaseHandle {
  db: SqliteDatabase;
  filePath: string;
  cleanup: () => void;
}

export const createTestDatabase = (): TestDatabaseHandle => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plex-exporter-backend-test-'));
  const filePath = path.join(tempDir, 'db.sqlite');
  const db = initializeDatabase({ filePath });

  return {
    db,
    filePath,
    cleanup: () => {
      db.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    },
  };
};
