import { eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../db/connection.js';
import { tautulliConfig, type InsertTautulliConfig, type TautulliConfig } from '../db/schema.js';

export class TautulliConfigRepository {
  constructor(private readonly db: DrizzleDatabase) {}

  get(): TautulliConfig | undefined {
    // There should only be one config row
    const configs = this.db.select().from(tautulliConfig).limit(1).all();
    return configs[0];
  }

  async upsert(input: InsertTautulliConfig): Promise<TautulliConfig> {
    const existing = await this.get();

    if (existing) {
      // Update existing config
      const updated = await this.db
        .update(tautulliConfig)
        .set({
          tautulliUrl: input.tautulliUrl,
          apiKey: input.apiKey,
        })
        .where(eq(tautulliConfig.id, existing.id))
        .returning();
      return updated[0];
    } else {
      // Insert new config
      const inserted = await this.db
        .insert(tautulliConfig)
        .values({
          tautulliUrl: input.tautulliUrl,
          apiKey: input.apiKey,
        })
        .returning();
      return inserted[0];
    }
  }

  async delete(): Promise<void> {
    const existing = await this.get();
    if (existing) {
      await this.db.delete(tautulliConfig).where(eq(tautulliConfig.id, existing.id));
    }
  }
}
