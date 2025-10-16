import type { SqliteDatabase } from '../connection.js';

export interface Migration {
  id: string;
  name: string;
  up: (db: SqliteDatabase) => void;
  down?: (db: SqliteDatabase) => void;
}
