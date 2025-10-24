import { asc, eq, inArray } from 'drizzle-orm';
import type { DrizzleDatabase } from '../db/index.js';
import { castMembers, mediaCast } from '../db/schema.js';

type CastMemberRow = typeof castMembers.$inferSelect;

export interface CastAppearance {
  id: number;
  mediaItemId: number;
  castMemberId: number;
  character: string | null;
  order: number | null;
  name: string;
  role: string | null;
  photo: string | null;
}

export interface CastInput {
  name: string;
  character?: string | null;
  role?: string | null;
  photo?: string | null;
  order?: number | null;
}

export class CastRepository {
  constructor(private readonly db: DrizzleDatabase) {}

  listByMediaId(mediaItemId: number): CastAppearance[] {
    const rows = this.db
      .select({
        appearanceId: mediaCast.id,
        mediaItemId: mediaCast.mediaItemId,
        castMemberId: castMembers.id,
        character: mediaCast.character,
        order: mediaCast.order,
        name: castMembers.name,
        role: castMembers.role,
        photo: castMembers.photo,
      })
      .from(mediaCast)
      .innerJoin(castMembers, eq(mediaCast.castMemberId, castMembers.id))
      .where(eq(mediaCast.mediaItemId, mediaItemId))
      .orderBy(asc(mediaCast.order), asc(castMembers.name))
      .all();

    return rows.map((row) => ({
      id: row.appearanceId,
      mediaItemId: row.mediaItemId,
      castMemberId: row.castMemberId,
      character: row.character ?? null,
      order: row.order ?? null,
      name: row.name,
      role: row.role ?? null,
      photo: row.photo ?? null,
    }));
  }

  replaceForMedia(mediaItemId: number, castInputs: CastInput[]): CastAppearance[] {
    return this.db.transaction((tx) => {
      tx.delete(mediaCast).where(eq(mediaCast.mediaItemId, mediaItemId)).run();

      if (castInputs.length === 0) {
        return [];
      }

      const uniqueNames = Array.from(
        new Set(
          castInputs
            .map((entry) => entry.name?.trim())
            .filter((value): value is string => Boolean(value && value.length > 0)),
        ),
      );

      const existingMembers =
        uniqueNames.length === 0
          ? []
          : tx
              .select()
              .from(castMembers)
              .where(inArray(castMembers.name, uniqueNames))
              .all();

      const memberByName = new Map<string, CastMemberRow>();
      for (const member of existingMembers) {
        memberByName.set(member.name, member);
      }

      const resolveMember = (entry: CastInput): CastMemberRow | null => {
        const name = entry.name?.trim();
        if (!name) {
          return null;
        }

        const cached = memberByName.get(name);
        if (cached) {
          const shouldUpdate =
            (entry.role && entry.role !== cached.role) || (entry.photo && entry.photo !== cached.photo);
          if (shouldUpdate) {
            const [updated] = tx
              .update(castMembers)
              .set({
                role: entry.role ?? cached.role,
                photo: entry.photo ?? cached.photo,
              })
              .where(eq(castMembers.id, cached.id))
              .returning()
              .all();
            if (updated) {
              memberByName.set(name, updated);
              return updated;
            }
          }
          return cached;
        }

        const [inserted] = tx
          .insert(castMembers)
          .values({
            name,
            role: entry.role ?? null,
            photo: entry.photo ?? null,
          })
          .returning()
          .all();

        if (!inserted) {
          return null;
        }

        memberByName.set(name, inserted);
        return inserted;
      };

      const insertedAppearances = [];

      castInputs.forEach((entry, index) => {
        const member = resolveMember(entry);
        if (!member) {
          return;
        }

        const orderValue =
          entry.order != null && Number.isFinite(entry.order) ? Number(entry.order) : index + 1;

        const [appearance] = tx
          .insert(mediaCast)
          .values({
            mediaItemId,
            castMemberId: member.id,
            character: entry.character ?? null,
            order: orderValue,
          })
          .returning()
          .all();

        if (appearance) {
          insertedAppearances.push({
            id: appearance.id,
            mediaItemId: appearance.mediaItemId,
            castMemberId: appearance.castMemberId,
            character: appearance.character ?? null,
            order: appearance.order ?? null,
            name: member.name,
            role: member.role ?? null,
            photo: member.photo ?? null,
          } satisfies CastAppearance);
        }
      });

      return insertedAppearances.sort((a, b) => {
        const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
        const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
        if (orderA === orderB) {
          return a.name.localeCompare(b.name);
        }
        return orderA - orderB;
      });
    });
  }
}

export default CastRepository;
