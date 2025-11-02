import { eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../db/connection.js';
import { librarySections, type InsertLibrarySection, type LibrarySection } from '../db/schema.js';

export class LibrarySectionRepository {
  constructor(private readonly db: DrizzleDatabase) {}

  /**
   * Create a new library section
   */
  create(input: InsertLibrarySection): LibrarySection {
    const result = this.db
      .insert(librarySections)
      .values({
        sectionId: input.sectionId,
        sectionName: input.sectionName,
        sectionType: input.sectionType as 'movie' | 'show',
        enabled: input.enabled ?? true,
        lastSyncedAt: input.lastSyncedAt ?? null,
      })
      .returning()
      .get();

    return result;
  }

  /**
   * Get all library sections
   */
  listAll(): LibrarySection[] {
    return this.db.select().from(librarySections).all();
  }

  /**
   * Get enabled library sections only
   */
  listEnabled(): LibrarySection[] {
    return this.db.select().from(librarySections).where(eq(librarySections.enabled, true)).all();
  }

  /**
   * Get a library section by internal ID
   */
  getById(id: number): LibrarySection | null {
    const result = this.db.select().from(librarySections).where(eq(librarySections.id, id)).get();
    return result ?? null;
  }

  /**
   * Get a library section by Tautulli section ID
   */
  getBySectionId(sectionId: number): LibrarySection | null {
    const result = this.db
      .select()
      .from(librarySections)
      .where(eq(librarySections.sectionId, sectionId))
      .get();
    return result ?? null;
  }

  /**
   * Update a library section
   */
  update(id: number, input: Partial<InsertLibrarySection>): LibrarySection | null {
    const updateData: Record<string, unknown> = {};
    if (input.sectionId !== undefined) updateData.sectionId = input.sectionId;
    if (input.sectionName !== undefined) updateData.sectionName = input.sectionName;
    if (input.sectionType !== undefined) updateData.sectionType = input.sectionType;
    if (input.enabled !== undefined) updateData.enabled = input.enabled;
    if (input.lastSyncedAt !== undefined) updateData.lastSyncedAt = input.lastSyncedAt;

    const result = this.db
      .update(librarySections)
      .set(updateData)
      .where(eq(librarySections.id, id))
      .returning()
      .get();

    return result ?? null;
  }

  /**
   * Update last synced timestamp for a section
   */
  updateLastSynced(id: number, timestamp: string): void {
    this.db
      .update(librarySections)
      .set({
        lastSyncedAt: timestamp,
      })
      .where(eq(librarySections.id, id))
      .run();
  }

  /**
   * Enable or disable a library section
   */
  setEnabled(id: number, enabled: boolean): void {
    this.db
      .update(librarySections)
      .set({
        enabled,
      })
      .where(eq(librarySections.id, id))
      .run();
  }

  /**
   * Delete a library section
   */
  delete(id: number): boolean {
    const result = this.db.delete(librarySections).where(eq(librarySections.id, id)).run();
    return result.changes > 0;
  }

  /**
   * Delete all library sections (useful for re-configuration)
   */
  deleteAll(): void {
    this.db.delete(librarySections).run();
  }

  /**
   * Bulk create library sections
   */
  bulkCreate(sections: InsertLibrarySection[]): LibrarySection[] {
    return this.db.transaction(() => {
      const results: LibrarySection[] = [];
      for (const section of sections) {
        const result = this.create(section);
        results.push(result);
      }
      return results;
    });
  }
}
