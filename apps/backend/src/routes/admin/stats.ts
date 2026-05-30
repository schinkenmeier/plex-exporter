import { Router, type NextFunction, type Request, type Response } from 'express';
import { sql } from 'drizzle-orm';
import type { AppConfig } from '../../config/index.js';
import type { DrizzleDatabase } from '../../db/index.js';
import { castMembers, episodes, seasons } from '../../db/schema.js';
import { HttpError } from '../../middleware/errorHandler.js';
import type MediaRepository from '../../repositories/mediaRepository.js';
import type ThumbnailRepository from '../../repositories/thumbnailRepository.js';
import SeasonRepository from '../../repositories/seasonRepository.js';
import CastRepository from '../../repositories/castRepository.js';
import logger from '../../services/logger.js';
import { formatBytes, getFileSize } from './helpers.js';

export interface AdminStatsRouterOptions {
  config: AppConfig;
  mediaRepository: MediaRepository;
  thumbnailRepository: ThumbnailRepository;
  drizzleDatabase?: DrizzleDatabase;
  seasonRepository?: SeasonRepository | null;
  castRepository?: CastRepository | null;
}

export const createAdminStatsRouter = ({
  config,
  mediaRepository,
  thumbnailRepository,
  drizzleDatabase,
  seasonRepository: suppliedSeasonRepository,
  castRepository: suppliedCastRepository,
}: AdminStatsRouterOptions): Router => {
  const router = Router();
  const seasonRepository =
    suppliedSeasonRepository ??
    (drizzleDatabase ? new SeasonRepository(drizzleDatabase) : null);
  const castRepository =
    suppliedCastRepository ?? (drizzleDatabase ? new CastRepository(drizzleDatabase) : null);

  router.get('/stats', (_req: Request, res: Response, next: NextFunction) => {
    try {
      const allMedia = mediaRepository.listAll();
      const movies = allMedia.filter(m => m.mediaType === 'movie');
      const series = allMedia.filter(m => m.mediaType === 'tv');

      const movieIds = movies.map(m => m.id);
      const seriesIds = series.map(m => m.id);
      const movieThumbnails = thumbnailRepository.listByMediaIds(movieIds);
      const seriesThumbnails = thumbnailRepository.listByMediaIds(seriesIds);

      let totalMovieThumbnails = 0;
      let totalSeriesThumbnails = 0;

      for (const thumbnails of movieThumbnails.values()) {
        totalMovieThumbnails += thumbnails.length;
      }

      for (const thumbnails of seriesThumbnails.values()) {
        totalSeriesThumbnails += thumbnails.length;
      }

      const structure = {
        seasons: null as number | null,
        episodes: null as number | null,
        castMembers: null as number | null,
      };

      if (drizzleDatabase) {
        try {
          const [{ value: seasonCount } = { value: 0 }] = drizzleDatabase
            .select({ value: sql<number>`count(*)` })
            .from(seasons)
            .all();
          const [{ value: episodeCount } = { value: 0 }] = drizzleDatabase
            .select({ value: sql<number>`count(*)` })
            .from(episodes)
            .all();
          const [{ value: castCount } = { value: 0 }] = drizzleDatabase
            .select({ value: sql<number>`count(*)` })
            .from(castMembers)
            .all();

          structure.seasons = seasonCount ?? 0;
          structure.episodes = episodeCount ?? 0;
          structure.castMembers = castCount ?? 0;
        } catch (error) {
          logger.warn('Failed to compute series structure counts', {
            error: error instanceof Error ? error.message : error,
          });
        }
      }

      let seriesSamples: Array<Record<string, unknown>> = [];

      if (seasonRepository && castRepository && series.length > 0) {
        seriesSamples = series.slice(0, 3).map((entry) => {
          const seasonsWithEpisodes = seasonRepository.listByMediaIdWithEpisodes(entry.id);
          const cast = castRepository.listByMediaId(entry.id).slice(0, 5);
          const totalEpisodes = seasonsWithEpisodes.reduce(
            (sum, season) => sum + season.episodes.length,
            0,
          );
          return {
            title: entry.title,
            ratingKey: entry.plexId,
            seasonCount: seasonsWithEpisodes.length,
            episodeCount: totalEpisodes,
            seasons: seasonsWithEpisodes.map((season) => ({
              number: season.seasonNumber,
              title: season.title,
              episodeCount: season.episodes.length,
            })),
            cast: cast.map((appearance) => ({
              name: appearance.name,
              character: appearance.character,
              order: appearance.order,
            })),
          };
        });
      }

      res.json({
        media: {
          total: allMedia.length,
          movies: movies.length,
          series: series.length,
          seasons: structure.seasons,
          episodes: structure.episodes,
        },
        cast: {
          members: structure.castMembers,
        },
        thumbnails: {
          total: totalMovieThumbnails + totalSeriesThumbnails,
          movies: totalMovieThumbnails,
          series: totalSeriesThumbnails,
        },
        database: {
          path: config.database.sqlitePath,
          size: formatBytes(getFileSize(config.database.sqlitePath)),
        },
        seriesSamples,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to get database stats', { error: message });
      next(new HttpError(500, 'Failed to get database stats', { details: message }));
    }
  });

  return router;
};
