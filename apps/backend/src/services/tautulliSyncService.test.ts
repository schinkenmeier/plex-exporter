import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TautulliSyncService } from './tautulliSyncService.js';

type SeasonData = {
  id: number;
  mediaItemId: number;
  tautulliId: string;
  seasonNumber: number;
  title: string | null;
  summary: string | null;
  poster: string | null;
  episodeCount: number | null;
};

type EpisodeData = {
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
};

class MockSeasonRepository {
  private seasonCounter = 0;
  private episodeCounter = 0;

  public seasons = new Map<number, SeasonData>();
  public episodes = new Map<number, EpisodeData>();

  public deletedSeasonIds: number[] = [];
  public deletedEpisodeIds: number[] = [];

  getByTautulliId(tautulliId: string) {
    for (const season of this.seasons.values()) {
      if (season.tautulliId === tautulliId) {
        return { ...season, source: 'local' as const };
      }
    }
    return null;
  }

  update(id: number, input: Partial<{ seasonNumber: number; title: string | null; summary: string | null; poster: string | null; episodeCount: number | null }>) {
    const existing = this.seasons.get(id);
    if (!existing) {
      return null;
    }

    const updated: SeasonData = {
      ...existing,
      seasonNumber: input.seasonNumber ?? existing.seasonNumber,
      title: input.title ?? existing.title,
      summary: input.summary ?? existing.summary,
      poster: input.poster ?? existing.poster,
      episodeCount: input.episodeCount ?? existing.episodeCount,
    };

    this.seasons.set(id, updated);
    return { ...updated, source: 'local' as const };
  }

  create(input: { mediaItemId: number; tautulliId: string; seasonNumber: number; title?: string | null; summary?: string | null; poster?: string | null; episodeCount?: number | null }) {
    const record: SeasonData = {
      id: ++this.seasonCounter,
      mediaItemId: input.mediaItemId,
      tautulliId: input.tautulliId,
      seasonNumber: input.seasonNumber,
      title: input.title ?? null,
      summary: input.summary ?? null,
      poster: input.poster ?? null,
      episodeCount: input.episodeCount ?? null,
    };

    this.seasons.set(record.id, record);
    return { ...record, source: 'local' as const };
  }

  getEpisodeByTautulliId(tautulliId: string) {
    for (const episode of this.episodes.values()) {
      if (episode.tautulliId === tautulliId) {
        return { ...episode, source: 'local' as const };
      }
    }
    return null;
  }

  createEpisode(input: { seasonId: number; tautulliId: string; episodeNumber: number; title: string; summary?: string | null; duration?: number | null; rating?: string | null; airDate?: string | null; thumb?: string | null }) {
    const record: EpisodeData = {
      id: ++this.episodeCounter,
      seasonId: input.seasonId,
      tautulliId: input.tautulliId,
      episodeNumber: input.episodeNumber,
      title: input.title,
      summary: input.summary ?? null,
      duration: input.duration ?? null,
      rating: input.rating ?? null,
      airDate: input.airDate ?? null,
      thumb: input.thumb ?? null,
    };

    this.episodes.set(record.id, record);
    return { ...record, source: 'local' as const };
  }

  updateEpisode(id: number, input: Partial<{ episodeNumber: number; title: string; summary: string | null; duration: number | null; rating: string | null; airDate: string | null; thumb: string | null }>) {
    const existing = this.episodes.get(id);
    if (!existing) {
      return null;
    }

    const updated: EpisodeData = {
      ...existing,
      episodeNumber: input.episodeNumber ?? existing.episodeNumber,
      title: input.title ?? existing.title,
      summary: input.summary ?? existing.summary,
      duration: input.duration ?? existing.duration,
      rating: input.rating ?? existing.rating,
      airDate: input.airDate ?? existing.airDate,
      thumb: input.thumb ?? existing.thumb,
    };

    this.episodes.set(id, updated);
    return { ...updated, source: 'local' as const };
  }

  listSeasonIdentifiersByMediaId(mediaItemId: number) {
    return Array.from(this.seasons.values())
      .filter((season) => season.mediaItemId === mediaItemId)
      .map((season) => ({ id: season.id, tautulliId: season.tautulliId }));
  }

  listEpisodeIdentifiersByMediaId(mediaItemId: number) {
    const seasonIds = new Set(
      Array.from(this.seasons.values())
        .filter((season) => season.mediaItemId === mediaItemId)
        .map((season) => season.id),
    );

    return Array.from(this.episodes.values())
      .filter((episode) => seasonIds.has(episode.seasonId))
      .map((episode) => ({ id: episode.id, seasonId: episode.seasonId, tautulliId: episode.tautulliId }));
  }

  deleteSeasonById(id: number) {
    this.seasons.delete(id);
    this.deletedSeasonIds.push(id);

    for (const [episodeId, episode] of Array.from(this.episodes.entries())) {
      if (episode.seasonId === id) {
        this.deleteEpisodeById(episodeId);
      }
    }
  }

  deleteEpisodeById(id: number) {
    this.episodes.delete(id);
    this.deletedEpisodeIds.push(id);
  }
}

describe('TautulliSyncService - season cleanup', () => {
  let seasonRepo: MockSeasonRepository;
  let service: TautulliSyncService;
  let tautulliService: {
    getSeasons: ReturnType<typeof vi.fn>;
    getEpisodes: ReturnType<typeof vi.fn>;
    getBaseUrl: () => string;
  };

  beforeEach(() => {
    seasonRepo = new MockSeasonRepository();

    const existingSeason = seasonRepo.create({
      mediaItemId: 1,
      tautulliId: 'season-1',
      seasonNumber: 1,
      title: 'Season 1',
      summary: null,
    });

    const removedSeason = seasonRepo.create({
      mediaItemId: 1,
      tautulliId: 'season-2',
      seasonNumber: 2,
      title: 'Season 2',
      summary: null,
    });

    seasonRepo.createEpisode({
      seasonId: existingSeason.id,
      tautulliId: 'episode-1',
      episodeNumber: 1,
      title: 'Episode 1',
    });

    seasonRepo.createEpisode({
      seasonId: removedSeason.id,
      tautulliId: 'episode-2',
      episodeNumber: 1,
      title: 'Episode 2',
    });

    tautulliService = {
      getSeasons: vi.fn().mockResolvedValue([
        {
          rating_key: 'season-1',
          media_index: 1,
          title: 'Season 1',
          summary: 'Season 1 summary',
          thumb: null,
        },
      ]),
      getEpisodes: vi.fn().mockImplementation(async (seasonKey: string) => {
        if (seasonKey === 'season-1') {
          return [
            {
              rating_key: 'episode-1',
              media_index: 1,
              title: 'Episode 1',
              summary: 'Episode 1 summary',
              thumb: null,
              duration: 1200,
            },
          ];
        }

        return [];
      }),
      getBaseUrl: () => 'http://localhost:8181',
    };

    service = new TautulliSyncService(
      tautulliService as any,
      {} as any,
      seasonRepo as unknown as any,
      {} as any,
    );
  });

  it('removes seasons and episodes that are no longer reported by Tautulli', async () => {
    await (service as any).syncSeasonsAndEpisodes('show-1', 1);

    expect(Array.from(seasonRepo.seasons.values()).map((season) => season.tautulliId)).toEqual(['season-1']);
    expect(Array.from(seasonRepo.episodes.values()).map((episode) => episode.tautulliId)).toEqual(['episode-1']);
    expect(seasonRepo.deletedSeasonIds).toHaveLength(1);
    expect(seasonRepo.deletedEpisodeIds).toHaveLength(1);
  });

  it('preserves episodes when a season fails to fetch episodes', async () => {
    tautulliService.getEpisodes.mockRejectedValueOnce(new Error('Season failed'));

    await (service as any).syncSeasonsAndEpisodes('show-1', 1);

    expect(Array.from(seasonRepo.seasons.values()).map((season) => season.tautulliId)).toEqual(['season-1']);
    expect(Array.from(seasonRepo.episodes.values()).map((episode) => episode.tautulliId)).toEqual(['episode-1']);
    expect(seasonRepo.deletedSeasonIds).toHaveLength(1);
    expect(seasonRepo.deletedEpisodeIds).toHaveLength(1);
  });
});

