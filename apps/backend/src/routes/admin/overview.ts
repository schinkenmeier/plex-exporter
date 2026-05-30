import { Router, type Request, type Response } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import { sql } from 'drizzle-orm';
import type { AppConfig } from '../../config/index.js';
import type { DrizzleDatabase } from '../../db/index.js';
import { castMembers, episodes, seasons } from '../../db/schema.js';
import type MediaRepository from '../../repositories/mediaRepository.js';
import type ThumbnailRepository from '../../repositories/thumbnailRepository.js';
import SettingsRepository from '../../repositories/settingsRepository.js';
import type { TautulliConfigRepository } from '../../repositories/tautulliConfigRepository.js';
import SeasonRepository from '../../repositories/seasonRepository.js';
import CastRepository from '../../repositories/castRepository.js';
import type { MailSender } from '../../services/resendService.js';
import logger from '../../services/logger.js';
import type { TmdbManager } from '../../services/tmdbManager.js';
import type { TautulliConfigStatus } from '../../services/tautulliConfigStatus.js';
import { formatBytes, formatUptime, getFileSize, maskSensitive } from './helpers.js';
import {
  getResolvedAdminTautulliConfigStatus,
  getResolvedResendConfigStatus,
} from './status.js';

export interface AdminOverviewRouterOptions {
  config: AppConfig;
  mediaRepository: MediaRepository;
  thumbnailRepository: ThumbnailRepository;
  resendService: MailSender | null;
  getResendService?: () => MailSender | null;
  drizzleDatabase?: DrizzleDatabase;
  seasonRepository?: SeasonRepository | null;
  castRepository?: CastRepository | null;
  settingsRepository: SettingsRepository;
  tautulliConfigRepository?: TautulliConfigRepository | null;
  tmdbManager: TmdbManager;
  getTautulliConfigStatus?: () => TautulliConfigStatus;
}

const startTime = Date.now();

export const createAdminOverviewRouter = (options: AdminOverviewRouterOptions): Router => {
  const router = Router();
  const {
    config,
    mediaRepository,
    thumbnailRepository,
    resendService,
    getResendService,
    drizzleDatabase,
    seasonRepository: suppliedSeasonRepository,
    castRepository: suppliedCastRepository,
    settingsRepository,
    tautulliConfigRepository,
    tmdbManager,
    getTautulliConfigStatus,
  } = options;

  const seasonRepository =
    suppliedSeasonRepository ??
    (drizzleDatabase ? new SeasonRepository(drizzleDatabase) : null);
  const castRepository =
    suppliedCastRepository ?? (drizzleDatabase ? new CastRepository(drizzleDatabase) : null);

  router.get('/status', (_req: Request, res: Response) => {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const memoryUsage = process.memoryUsage();

    res.json({
      status: 'ok',
      uptime: {
        seconds: uptime,
        formatted: formatUptime(uptime),
      },
      memory: {
        rss: formatBytes(memoryUsage.rss),
        heapTotal: formatBytes(memoryUsage.heapTotal),
        heapUsed: formatBytes(memoryUsage.heapUsed),
        external: formatBytes(memoryUsage.external),
      },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        cpus: os.cpus().length,
        totalMemory: formatBytes(os.totalmem()),
        freeMemory: formatBytes(os.freemem()),
      },
      process: {
        pid: process.pid,
        cwd: process.cwd(),
      },
    });
  });

  router.get('/config', (_req: Request, res: Response) => {
    const tmdbStatus = tmdbManager.getStatus();
    const tautulliStatus = getResolvedAdminTautulliConfigStatus({
      config,
      settingsRepository,
      tautulliConfigRepository,
      getTautulliConfigStatus,
    });
    const resendStatus = getResolvedResendConfigStatus({
      config,
      settingsRepository,
      resendService,
      getResendService,
    });

    res.json({
      runtime: {
        env: config.runtime.env,
      },
      server: {
        port: config.server.port,
      },
      auth: {
        enabled: !!config.auth,
        token: config.auth?.token ? maskSensitive(config.auth.token) : '[not set]',
      },
      database: {
        sqlitePath: config.database.sqlitePath,
        exists: fs.existsSync(config.database.sqlitePath),
      },
      hero: {
        policyPath: config.hero?.policyPath || '[not set]',
        policyExists: config.hero?.policyPath ? fs.existsSync(config.hero.policyPath) : false,
      },
      tautulli: {
        enabled: tautulliStatus.configured,
        url: tautulliStatus.tautulliUrl || '[not set]',
        apiKey: tautulliStatus.hasApiKey ? '****' : '[not set]',
        source: tautulliStatus.source,
        activeSource: tautulliStatus.activeSource,
        fromEnv: tautulliStatus.fromEnv,
        envOverride: tautulliStatus.envOverride,
        saved: tautulliStatus.saved,
      },
      tmdb: {
        enabled: tmdbStatus.hasToken,
        accessToken: tmdbStatus.hasToken ? tmdbStatus.tokenPreview ?? 'set' : null,
        source: tmdbStatus.source,
        updatedAt: tmdbStatus.updatedAt,
        fromEnv: tmdbStatus.fromEnv,
        fromDatabase: tmdbStatus.fromDatabase,
        envOverride: tmdbStatus.envOverride,
        saved: tmdbStatus.saved,
      },
      resend: {
        enabled: resendStatus.enabled,
        apiKey: resendStatus.apiKeyPreview ?? '[not set]',
        fromEmail: resendStatus.fromEmail || '[not set]',
        source: resendStatus.source,
        fromEnv: resendStatus.fromEnv,
        fromDatabase: resendStatus.fromDatabase,
        envOverride: resendStatus.envOverride,
        saved: resendStatus.saved,
      },
    });
  });

  router.get('/stats', (_req: Request, res: Response) => {
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
      return res.status(500).json({ error: 'Failed to get database stats', details: message });
    }
  });

  return router;
};
