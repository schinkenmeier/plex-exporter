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
}

export default SeasonRepository;
