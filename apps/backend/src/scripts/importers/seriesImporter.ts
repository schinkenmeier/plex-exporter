import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { DrizzleDatabase } from '../../db/index.js';
import MediaRepository, { type MediaCreateInput, type MediaRecord } from '../../repositories/mediaRepository.js';
import ThumbnailRepository from '../../repositories/thumbnailRepository.js';
import SeasonRepository, {
  type SeasonInput,
  type EpisodeInput,
} from '../../repositories/seasonRepository.js';
import CastRepository, { type CastInput } from '../../repositories/castRepository.js';
import type {
  PlexSeriesIndex,
  PlexSeriesDetails,
  PlexSeason,
  PlexEpisode,
  ImportResult,
  ImportOptions,
} from './types.js';
import type { Logger } from '../utils/logger.js';

interface SeriesIndexWithDetails extends PlexSeriesIndex {
  detailsSummary: string | null;
  details?: PlexSeriesDetails | null;
}

export class SeriesImporter {
  private mediaRepo: MediaRepository;
  private thumbRepo: ThumbnailRepository;
  private seasonRepo: SeasonRepository;
  private castRepo: CastRepository;

  constructor(
    drizzle: DrizzleDatabase,
    private logger: Logger,
  ) {
    this.mediaRepo = new MediaRepository(drizzle);
    this.thumbRepo = new ThumbnailRepository(drizzle);
    this.seasonRepo = new SeasonRepository(drizzle);
    this.castRepo = new CastRepository(drizzle);
  }

  async import(indexPath: string, options: ImportOptions = {}): Promise<ImportResult> {
    const startTime = Date.now();
    const result: ImportResult = {
      imported: 0,
      skipped: 0,
      errors: 0,
      duration: 0,
    };

    try {
      this.logger.info(`Reading series index from: ${indexPath}`);
      const content = readFileSync(indexPath, 'utf-8');
      const seriesIndex: PlexSeriesIndex[] = JSON.parse(content);

      if (!Array.isArray(seriesIndex)) {
        throw new Error('Series index file must contain an array');
      }

      this.logger.info(`Found ${seriesIndex.length} series to import`);

      if (options.dryRun) {
        this.logger.warn('DRY RUN MODE - No database changes will be made');
      }

      const seriesWithDetails = this.loadSeriesDetails(indexPath, seriesIndex);

      if (!options.dryRun) {
        for (let i = 0; i < seriesWithDetails.length; i++) {
          const series = seriesWithDetails[i];

          try {
            const persisted = this.persistSeries(series, options.force ?? false);
            if (!persisted) {
              result.skipped++;
              continue;
            }

            if (series.thumbFile) {
              this.thumbRepo.replaceForMedia(persisted.id, [series.thumbFile]);
            }

            if (series.details) {
              const hasSeasonExport = Array.isArray(series.details.seasons);
              const seasonInputs = this.mapSeasons(series.details.seasons ?? []);
              const castInputs = this.mapCast(series.details.cast ?? []);

              if (hasSeasonExport) {
                this.seasonRepo.replaceForMedia(persisted.id, seasonInputs);
              }

              if (castInputs.length > 0) {
                this.castRepo.replaceForMedia(persisted.id, castInputs);
              } else if (series.details.cast && series.details.cast.length === 0) {
                // Explicitly clear cast when export provides an empty list
                this.castRepo.replaceForMedia(persisted.id, []);
              }
            }

            result.imported++;

            if ((i + 1) % 5 === 0 || i + 1 === seriesWithDetails.length) {
              this.logger.progress(i + 1, seriesWithDetails.length, series.title);
            }
          } catch (error) {
            result.errors++;
            this.logger.error(`Failed to import series: ${series.title}`, error as Error);
          }
        }
      } else {
        result.skipped = seriesIndex.length;
      }

      result.duration = Date.now() - startTime;

      this.logger.success(
        `Import completed: ${result.imported} imported, ${result.skipped} skipped, ${result.errors} errors (${result.duration}ms)`,
      );

      return result;
    } catch (error) {
      this.logger.error('Series import failed', error as Error);
      throw error;
    }
  }

  private loadSeriesDetails(indexPath: string, entries: PlexSeriesIndex[]): SeriesIndexWithDetails[] {
    const detailsDir = path.join(path.dirname(indexPath), 'details');

    return entries.map((series) => {
      let summary: string | null = null;
      let details: PlexSeriesDetails | null = null;

      if (series.href) {
        const detailsPath = path.join(detailsDir, series.href.replace('details/', ''));
        if (existsSync(detailsPath)) {
          try {
            const detailsContent = readFileSync(detailsPath, 'utf-8');
            details = JSON.parse(detailsContent) as PlexSeriesDetails;
            summary = details.summary || null;
          } catch (detailsError) {
            this.logger.warn(`Could not load details for ${series.title}: ${detailsPath}`);
          }
        }
      }

      return { ...series, detailsSummary: summary, details };
    });
  }

  private persistSeries(series: SeriesIndexWithDetails, force: boolean): MediaRecord | null {
    const plexId = String(series.ratingKey);
    const existing = this.mediaRepo.getByPlexId(plexId);

    if (existing && !force) {
      this.logger.debug(`Skipping existing series: ${series.title} (${plexId})`);
      return null;
    }

    const guid = this.extractGuid(series);
    const summary = series.details?.summary ?? series.detailsSummary;
    const tagline = series.details?.tagline ?? null;
    const studio = series.details?.studio ?? null;

    const mediaData: MediaCreateInput = {
      plexId,
      title: series.title,
      year: series.year || null,
      guid,
      summary,
      mediaType: 'tv',
      plexAddedAt: null,
      plexUpdatedAt: null,
      tagline,
      studio,
      genres: Array.isArray(series.genres) ? series.genres : series.details?.genres ?? null,
      contentRating: series.contentRating ?? series.details?.contentRating ?? null,
    };

    if (existing) {
      this.logger.debug(`Updating series: ${series.title} (${plexId})`);
      return this.mediaRepo.update(existing.id, mediaData) ?? existing;
    }

    this.logger.debug(`Importing series: ${series.title} (${plexId})`);
    return this.mediaRepo.create(mediaData);
  }

  private mapSeasons(seasonsInput: PlexSeason[] | undefined): SeasonInput[] {
    if (!Array.isArray(seasonsInput) || seasonsInput.length === 0) {
      return [];
    }

    return seasonsInput
      .map((season): SeasonInput | null => {
        if (!season) return null;
        const episodes = this.mapEpisodes(season.episodes ?? []);
        return {
          tautulliId: String(season.ratingKey),
          seasonNumber: season.seasonNumber,
          title: season.title ?? null,
          summary: null,
          poster: season.thumbFile ?? null,
          episodeCount: episodes.length > 0 ? episodes.length : null,
          episodes,
        };
      })
      .filter((season): season is SeasonInput => Boolean(season));
  }

  private mapEpisodes(episodesInput: PlexEpisode[] | undefined): EpisodeInput[] {
    if (!Array.isArray(episodesInput) || episodesInput.length === 0) {
      return [];
    }

    return episodesInput
      .map((episode): EpisodeInput | null => {
        if (!episode) return null;

        let duration: number | null = null;
        const rawDuration =
          typeof episode.duration === 'number' ? episode.duration : episode.runtime;
        if (typeof rawDuration === 'number' && Number.isFinite(rawDuration)) {
          duration = rawDuration;
        } else if (typeof episode.durationMin === 'number' && Number.isFinite(episode.durationMin)) {
          duration = Math.round(episode.durationMin * 60); // store in seconds
        }
        const summaryText =
          typeof episode.summary === 'string' && episode.summary.trim()
            ? episode.summary.trim()
            : typeof episode.seasonEpisode === 'string' && episode.seasonEpisode.trim()
              ? episode.seasonEpisode.trim()
              : null;
        const thumb =
          typeof episode.thumbFile === 'string'
            ? episode.thumbFile
            : typeof episode.thumb === 'string'
              ? episode.thumb
              : null;

        return {
          tautulliId: String(episode.ratingKey),
          episodeNumber: episode.episodeNumber,
          title: episode.title,
          summary: summaryText,
          duration,
          rating: episode.audienceRating != null ? String(episode.audienceRating) : null,
          airDate: episode.originallyAvailableAt ?? null,
          thumb,
        };
      })
      .filter((episode): episode is EpisodeInput => Boolean(episode));
  }

  private mapCast(castList: string[] | undefined): CastInput[] {
    if (!Array.isArray(castList) || castList.length === 0) {
      return [];
    }

    return castList
      .map((rawEntry, index): CastInput | null => {
        const entry = String(rawEntry ?? '').trim();
        if (!entry) return null;

        const parts = entry.split(' as ');
        const name = parts[0]?.trim();
        if (!name) return null;

        const character = parts[1]?.trim() || null;

        return {
          name,
          character,
          order: index + 1,
        };
      })
      .filter((entry): entry is CastInput => Boolean(entry));
  }

  private extractGuid(series: PlexSeriesIndex): string | null {
    if (!series.ids) return null;

    if (series.ids.imdb) return `imdb://${series.ids.imdb}`;
    if (series.ids.tmdb) return `tmdb://${series.ids.tmdb}`;
    if (series.ids.tvdb) return `tvdb://${series.ids.tvdb}`;

    return null;
  }
}

export const createSeriesImporter = (
  drizzle: DrizzleDatabase,
  logger: Logger,
): SeriesImporter => {
  return new SeriesImporter(drizzle, logger);
};
