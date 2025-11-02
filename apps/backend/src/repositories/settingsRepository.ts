import { eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../db/index.js';
import { integrationSettings } from '../db/schema.js';

export interface SettingRecord {
  key: string;
  value: string;
  updatedAt: number;
}

export class SettingsRepository {
  constructor(private readonly db: DrizzleDatabase) {}

  get(key: string): SettingRecord | null {
    const rows = this.db
      .select()
      .from(integrationSettings)
      .where(eq(integrationSettings.key, key))
      .limit(1)
      .all();
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      key: row.key,
      value: row.value,
      updatedAt: row.updatedAt,
    };
  }

  set(key: string, value: string, updatedAt: number = Date.now()): SettingRecord {
    this.db
      .insert(integrationSettings)
      .values({ key, value, updatedAt })
      .onConflictDoUpdate({
        target: integrationSettings.key,
        set: {
          value,
          updatedAt,
        },
      })
      .run();

    return {
      key,
      value,
      updatedAt,
    };
  }

  delete(key: string): boolean {
    const result = this.db.delete(integrationSettings).where(eq(integrationSettings.key, key)).run();
    return result.changes > 0;
  }
}

export default SettingsRepository;
