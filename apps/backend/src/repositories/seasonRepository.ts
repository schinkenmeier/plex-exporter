import { asc, eq, inArray } from 'drizzle-orm';
import type { DrizzleDatabase } from '../db/index.js';
import { seasons, episodes } from '../db/schema.js';

type SeasonRow = typeof seasons.$inferSelect;
type EpisodeRow = typeof episodes.$inferSelect;

export interface EpisodeRecord {
  id: number;
  seasonId: number;
  tautulliId: string;
  episodeNumber: number;
  title: string;
  summary: string | null;
  duration: number | null;
  rating: string | null;
  airDate: string | null;
  thumb: string | null;
  source: 'local' | 'tmdb' | 'unknown';
}

export interface SeasonRecord {
  id: number;
  mediaItemId: number;
  tautulliId: string;
  seasonNumber: number;
  title: string | null;
  summary: string | null;
  poster: string | null;
  episodeCount: number | null;
  source: 'local' | 'tmdb' | 'unknown';
}

export interface EpisodeInput {
  tautulliId: string;
  episodeNumber: number;
  title: string;
  summary?: string | null;
  duration?: number | null;
  rating?: string | null;
  airDate?: string | null;
  thumb?: string | null;
}

export interface SeasonInput {
  tautulliId: string;
  seasonNumber: number;
  title?: string | null;
  summary?: string | null;
  poster?: string | null;
  episodeCount?: number | null;
  episodes?: EpisodeInput[] | null;
}

export type SeasonRecordWithEpisodes = SeasonRecord & { episodes: EpisodeRecord[] };

export interface SeasonIdentifier {
  id: number;
  tautulliId: string;
}

export interface EpisodeIdentifier {
  id: number;
  seasonId: number;
  tautulliId: string;
}

const mapEpisodeRow = (row: EpisodeRow): EpisodeRecord => ({
  id: row.id,
  seasonId: row.seasonId,
  tautulliId: row.tautulliId,
  episodeNumber: row.episodeNumber,
  title: row.title,
  summary: row.summary ?? null,
  duration: row.duration ?? null,
  rating: row.rating ?? null,
  airDate: row.airDate ?? null,
  thumb: row.thumb ?? null,
  source: 'local',
});

const mapSeasonRow = (row: SeasonRow): SeasonRecord => ({
  id: row.id,
  mediaItemId: row.mediaItemId,
  tautulliId: row.tautulliId,
  seasonNumber: row.seasonNumber,
  title: row.title ?? null,
  summary: row.summary ?? null,
  poster: row.poster ?? null,
  episodeCount: row.episodeCount ?? null,
  source: 'local',
});

export class SeasonRepository {
  constructor(private readonly db: DrizzleDatabase) {}

  listByMediaId(mediaItemId: number): SeasonRecord[] {
    return this.db
      .select()
      .from(seasons)
      .where(eq(seasons.mediaItemId, mediaItemId))
      .orderBy(asc(seasons.seasonNumber))
      .all()
      .map(mapSeasonRow);
  }

  listByMediaIdWithEpisodes(mediaItemId: number): SeasonRecordWithEpisodes[] {
    const seasonRows = this.db
      .select()
      .from(seasons)
      .where(eq(seasons.mediaItemId, mediaItemId))
      .orderBy(asc(seasons.seasonNumber))
      .all();

    if (seasonRows.length === 0) {
      return [];
    }

    const seasonIds = seasonRows.map((row) => row.id);
    const episodeRows = this.db
      .select()
      .from(episodes)
      .where(inArray(episodes.seasonId, seasonIds))
      .orderBy(asc(episodes.seasonId), asc(episodes.episodeNumber))
      .all();

    const episodesBySeason = new Map<number, EpisodeRecord[]>();
    for (const episodeRow of episodeRows) {
      const record = mapEpisodeRow(episodeRow);
      const bucket = episodesBySeason.get(record.seasonId) ?? [];
      bucket.push(record);
      episodesBySeason.set(record.seasonId, bucket);
    }

    return seasonRows.map((seasonRow) => {
      const seasonRecord = mapSeasonRow(seasonRow);
      const seasonEpisodes = episodesBySeason.get(seasonRecord.id) ?? [];
      return { ...seasonRecord, episodes: seasonEpisodes };
    });
  }

  replaceForMedia(mediaItemId: number, seasonInputs: SeasonInput[]): SeasonRecordWithEpisodes[] {
    return this.db.transaction((tx) => {
      tx.delete(seasons).where(eq(seasons.mediaItemId, mediaItemId)).run();

      if (seasonInputs.length === 0) {
        return [];
      }

      const results: SeasonRecordWithEpisodes[] = [];

      for (const seasonInput of seasonInputs) {
        const [seasonRow] = tx
          .insert(seasons)
          .values({
            mediaItemId,
            tautulliId: seasonInput.tautulliId,
            seasonNumber: seasonInput.seasonNumber,
            title: seasonInput.title ?? null,
            summary: seasonInput.summary ?? null,
            poster: seasonInput.poster ?? null,
            episodeCount: seasonInput.episodeCount ?? null,
          })
          .returning()
          .all();

        if (!seasonRow) continue;

        const insertedEpisodes =
          seasonInput.episodes && seasonInput.episodes.length > 0
            ? tx
                .insert(episodes)
                .values(
                  seasonInput.episodes.map((episode) => ({
                    seasonId: seasonRow.id,
                    tautulliId: episode.tautulliId,
                    episodeNumber: episode.episodeNumber,
                    title: episode.title,
                    summary: episode.summary ?? null,
                    duration: episode.duration ?? null,
                    rating: episode.rating ?? null,
                    airDate: episode.airDate ?? null,
                    thumb: episode.thumb ?? null,
                  })),
                )
                .returning()
                .all()
            : [];

        const mappedSeason = mapSeasonRow(seasonRow);
        const mappedEpisodes = insertedEpisodes.map(mapEpisodeRow);
        results.push({
          ...mappedSeason,
          episodeCount: seasonInput.episodeCount ?? mappedEpisodes.length ?? null,
          episodes: mappedEpisodes,
        });
      }

      return results;
    });
  }

  listSeasonIdentifiersByMediaId(mediaItemId: number): SeasonIdentifier[] {
    return this.db
      .select({ id: seasons.id, tautulliId: seasons.tautulliId })
      .from(seasons)
      .where(eq(seasons.mediaItemId, mediaItemId))
      .all();
  }

  listEpisodeIdentifiersByMediaId(mediaItemId: number): EpisodeIdentifier[] {
    const seasonIds = this.db
      .select({ id: seasons.id })
      .from(seasons)
      .where(eq(seasons.mediaItemId, mediaItemId))
      .all()
      .map((row) => row.id);

    if (seasonIds.length === 0) {
      return [];
    }

    return this.db
      .select({ id: episodes.id, seasonId: episodes.seasonId, tautulliId: episodes.tautulliId })
      .from(episodes)
      .where(inArray(episodes.seasonId, seasonIds))
      .all();
  }

  getByTautulliId(tautulliId: string): SeasonRecord | null {
    const row = this.db
      .select()
      .from(seasons)
      .where(eq(seasons.tautulliId, tautulliId))
      .get();

    return row ? mapSeasonRow(row) : null;
  }

  getById(id: number): SeasonRecord | null {
    const row = this.db
      .select()
      .from(seasons)
      .where(eq(seasons.id, id))
      .get();

    return row ? mapSeasonRow(row) : null;
  }

  create(input: Omit<SeasonInput, 'episodes'> & { mediaItemId: number }): SeasonRecord {
    const [row] = this.db
      .insert(seasons)
      .values({
        mediaItemId: input.mediaItemId,
        tautulliId: input.tautulliId,
        seasonNumber: input.seasonNumber,
        title: input.title ?? null,
        summary: input.summary ?? null,
        poster: input.poster ?? null,
        episodeCount: input.episodeCount ?? null,
      })
      .returning()
      .all();

    if (!row) {
      throw new Error('Failed to create season');
    }

    return mapSeasonRow(row);
  }

  update(id: number, input: Partial<Omit<SeasonInput, 'episodes' | 'tautulliId'>>): SeasonRecord | null {
    const [row] = this.db
      .update(seasons)
      .set({
        seasonNumber: input.seasonNumber,
        title: input.title ?? null,
        summary: input.summary ?? null,
        poster: input.poster ?? null,
        episodeCount: input.episodeCount ?? null,
      })
      .where(eq(seasons.id, id))
      .returning()
      .all();

    return row ? mapSeasonRow(row) : null;
  }

  getEpisodeByTautulliId(tautulliId: string): EpisodeRecord | null {
    const row = this.db
      .select()
      .from(episodes)
      .where(eq(episodes.tautulliId, tautulliId))
      .get();

    return row ? mapEpisodeRow(row) : null;
  }

  createEpisode(input: EpisodeInput & { seasonId: number }): EpisodeRecord {
    const [row] = this.db
      .insert(episodes)
      .values({
        seasonId: input.seasonId,
        tautulliId: input.tautulliId,
        episodeNumber: input.episodeNumber,
        title: input.title,
        summary: input.summary ?? null,
        duration: input.duration ?? null,
        rating: input.rating ?? null,
        airDate: input.airDate ?? null,
        thumb: input.thumb ?? null,
      })
      .returning()
      .all();

    if (!row) {
      throw new Error('Failed to create episode');
    }

    return mapEpisodeRow(row);
  }

  updateEpisode(id: number, input: Partial<Omit<EpisodeInput, 'tautulliId'>>): EpisodeRecord | null {
    const [row] = this.db
      .update(episodes)
      .set({
        episodeNumber: input.episodeNumber,
        title: input.title,
        summary: input.summary ?? null,
        duration: input.duration ?? null,
        rating: input.rating ?? null,
        airDate: input.airDate ?? null,
        thumb: input.thumb ?? null,
      })
      .where(eq(episodes.id, id))
      .returning()
      .all();

    return row ? mapEpisodeRow(row) : null;
  }

  deleteSeasonById(id: number): void {
    this.db.delete(seasons).where(eq(seasons.id, id)).run();
  }

  deleteEpisodeById(id: number): void {
    this.db.delete(episodes).where(eq(episodes.id, id)).run();
  }
}

export default SeasonRepository;
