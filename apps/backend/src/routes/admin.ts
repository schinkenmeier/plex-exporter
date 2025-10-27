import { Router, type Request, type Response, type NextFunction } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import { sql } from 'drizzle-orm';
import { type AppConfig } from '../config/index.js';
import { importService } from '../services/importService.js';
import { logBuffer } from '../services/logBuffer.js';
import logger from '../services/logger.js';
import { HttpError } from '../middleware/errorHandler.js';
import type MediaRepository from '../repositories/mediaRepository.js';
import type ThumbnailRepository from '../repositories/thumbnailRepository.js';
import SettingsRepository from '../repositories/settingsRepository.js';
import SeasonRepository from '../repositories/seasonRepository.js';
import CastRepository from '../repositories/castRepository.js';
import type { MailSender } from '../services/resendService.js';
import type { TautulliClient } from '../services/tautulliService.js';
import type { DrizzleDatabase } from '../db/index.js';
import { seasons, episodes, castMembers } from '../db/schema.js';
import type { TmdbManager } from '../services/tmdbManager.js';
import type { HeroPipelineService } from '../services/heroPipeline.js';

export interface AdminRouterOptions {
  config: AppConfig;
  mediaRepository: MediaRepository;
  thumbnailRepository: ThumbnailRepository;
  resendService: MailSender | null;
  tautulliService: TautulliClient | null;
  seasonRepository?: SeasonRepository | null;
  castRepository?: CastRepository | null;
  drizzleDatabase?: DrizzleDatabase;
  settingsRepository: SettingsRepository;
  tmdbManager: TmdbManager;
  heroPipeline: HeroPipelineService;
}

const startTime = Date.now();

export const createAdminRouter = (options: AdminRouterOptions): Router => {
  const router = Router();
  const {
    config,
    mediaRepository,
    thumbnailRepository,
    resendService,
    tautulliService,
    drizzleDatabase,
    seasonRepository: suppliedSeasonRepository,
    castRepository: suppliedCastRepository,
    settingsRepository,
    tmdbManager,
    heroPipeline,
  } = options;
  const seasonRepository =
    suppliedSeasonRepository ??
    (drizzleDatabase ? new SeasonRepository(drizzleDatabase) : null);
  const castRepository =
    suppliedCastRepository ?? (drizzleDatabase ? new CastRepository(drizzleDatabase) : null);

  /**
   * GET /admin
   * Serve admin dashboard HTML
   */
  router.get('/', (_req: Request, res: Response) => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    // Try production path first (dist/routes -> src/views), then development path
    const productionPath = path.join(__dirname, '..', '..', 'src', 'views', 'admin.html');
    const devPath = path.join(__dirname, '..', 'views', 'admin.html');

    const htmlPath = fs.existsSync(productionPath) ? productionPath : devPath;

    if (!fs.existsSync(htmlPath)) {
      logger.error('Admin dashboard HTML not found', { productionPath, devPath, __dirname });
      return res.status(500).send('Admin dashboard HTML not found');
    }

    res.sendFile(htmlPath);
  });

  /**
   * GET /admin/api/status
   * System status and health information
   */
  router.get('/api/status', (_req: Request, res: Response) => {
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

  /**
   * GET /admin/api/config
   * Current configuration (sensitive values masked)
   */
  router.get('/api/config', (_req: Request, res: Response) => {
    const maskSensitive = (value: string | null | undefined): string => {
      if (!value) return '[not set]';
      if (value.length <= 4) return '****';
      return value.substring(0, 4) + '*'.repeat(Math.min(value.length - 4, 20));
    };

    const tmdbStatus = tmdbManager.getStatus();

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
        enabled: !!config.tautulli,
        url: config.tautulli?.url || '[not set]',
        apiKey: config.tautulli?.apiKey ? maskSensitive(config.tautulli.apiKey) : '[not set]',
      },
      tmdb: {
        enabled: tmdbStatus.hasToken,
        accessToken: tmdbStatus.hasToken ? tmdbStatus.tokenPreview ?? 'set' : null,
        source: tmdbStatus.source,
        updatedAt: tmdbStatus.updatedAt,
        fromEnv: tmdbStatus.fromEnv,
        fromDatabase: tmdbStatus.fromDatabase,
      },
      resend: {
        enabled: !!config.resend,
        apiKey: config.resend?.apiKey ? maskSensitive(config.resend.apiKey) : '[not set]',
        fromEmail: config.resend?.fromEmail || '[not set]',
      },
    });
  });

  router.get('/api/tmdb', (_req: Request, res: Response) => {
    const status = tmdbManager.getStatus();
    res.json({
      enabled: status.hasToken,
      source: status.source,
      tokenPreview: status.tokenPreview,
      updatedAt: status.updatedAt,
      fromEnv: status.fromEnv,
      fromDatabase: status.fromDatabase,
    });
  });

  router.post('/api/tmdb', (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawToken = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
      if (!rawToken) {
        throw new HttpError(400, 'TMDb access token must not be empty.');
      }
      const record = settingsRepository.set('tmdb.accessToken', rawToken);
      const service = tmdbManager.setDatabaseToken(record.value, { updatedAt: record.updatedAt });
      heroPipeline.setTmdbService(service);
      res.json({
        success: true,
        status: tmdbManager.getStatus(),
      });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/api/tmdb', (_req: Request, res: Response) => {
    settingsRepository.delete('tmdb.accessToken');
    const service = tmdbManager.setDatabaseToken(null);
    heroPipeline.setTmdbService(service);
    res.json({
      success: true,
      status: tmdbManager.getStatus(),
    });
  });

  router.post('/api/test/tmdb', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = typeof req.body?.token === 'string' ? req.body.token : undefined;
      const result = await tmdbManager.testToken(token);
      res.json(result);
    } catch (error) {
      const status = (error as { status?: number } | undefined)?.status ?? 500;
      next(
        new HttpError(status, error instanceof Error ? error.message : 'TMDb token test failed', {
          cause: error instanceof Error ? error : undefined,
        }),
      );
    }
  });

  /**
   * GET /admin/api/stats
   * Database statistics
   */
  router.get('/api/stats', (_req: Request, res: Response) => {
    try {
      const allMedia = mediaRepository.listAll();
      const movies = allMedia.filter(m => m.mediaType === 'movie');
      const series = allMedia.filter(m => m.mediaType === 'tv');

      // Get thumbnail counts
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

  /**
   * POST /admin/api/import
   * Start import process
   */
  router.post('/api/import', async (req: Request, res: Response) => {
    const { dryRun, force, verbose, moviesOnly, seriesOnly } = req.body || {};

    const result = await importService.start({
      dryRun: !!dryRun,
      force: !!force,
      verbose: !!verbose,
      moviesOnly: !!moviesOnly,
      seriesOnly: !!seriesOnly,
    });

    if (result.success) {
      res.json({ success: true, message: result.message, status: importService.getStatus() });
    } else {
      res.status(400).json({ success: false, error: result.message });
    }
  });

  /**
   * POST /admin/api/import/stop
   * Stop running import process
   */
  router.post('/api/import/stop', (_req: Request, res: Response) => {
    const result = importService.stop();

    if (result.success) {
      res.json({ success: true, message: result.message });
    } else {
      res.status(400).json({ success: false, error: result.message });
    }
  });

  /**
   * GET /admin/api/import/status
   * Get import process status
   */
  router.get('/api/import/status', (_req: Request, res: Response) => {
    res.json(importService.getStatus());
  });

  /**
   * DELETE /admin/api/import/logs
   * Clear import logs
   */
  router.delete('/api/import/logs', (_req: Request, res: Response) => {
    importService.clearLogs();
    res.json({ success: true, message: 'Import logs cleared' });
  });

  /**
   * GET /admin/api/logs
   * Get system logs
   */
  router.get('/api/logs', (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const level = req.query.level as string;
    const since = req.query.since as string;

    let logs = logBuffer.getAll();

    // Filter by level
    if (level && ['debug', 'info', 'warn', 'error'].includes(level)) {
      logs = logs.filter(log => log.level === level);
    }

    // Filter by timestamp
    if (since) {
      logs = logs.filter(log => log.timestamp >= since);
    }

    // Limit results
    logs = logs.slice(-limit);

    res.json({
      logs,
      stats: logBuffer.getStats(),
    });
  });

  /**
   * DELETE /admin/api/logs
   * Clear system logs
   */
  router.delete('/api/logs', (_req: Request, res: Response) => {
    logBuffer.clear();
    res.json({ success: true, message: 'System logs cleared' });
  });

  /**
   * POST /admin/api/test/tautulli
   * Test Tautulli connection
   */
  router.post('/api/test/tautulli', async (_req: Request, res: Response, next: NextFunction) => {
    if (!tautulliService) {
      return res.status(503).json({
        success: false,
        error: 'Tautulli service is not configured',
        message: 'Please configure Tautulli environment variables (TAUTULLI_URL, TAUTULLI_API_KEY)',
      });
    }

    try {
      const libraries = await tautulliService.getLibraries();

      res.json({
        success: true,
        message: 'Successfully connected to Tautulli',
        libraries: libraries.length,
        data: libraries,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Tautulli test failed', { error: message });
      res.status(502).json({ success: false, error: 'Tautulli test failed', details: message });
    }
  });

  /**
   * POST /admin/api/test/database
   * Test database connection
   */
  router.post('/api/test/database', (_req: Request, res: Response) => {
    try {
      const allMedia = mediaRepository.listAll();

      res.json({
        success: true,
        message: 'Database connection successful',
        recordCount: allMedia.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Database test failed', { error: message });
      res.status(500).json({ success: false, error: 'Database test failed', details: message });
    }
  });

  /**
   * POST /admin/api/test/resend
   * Test Resend email connection
   */
  router.post('/api/test/resend', async (req: Request, res: Response, next: NextFunction) => {
    if (!resendService) {
      return res.status(503).json({
        success: false,
        error: 'Resend service is not configured',
        message: 'Please configure Resend environment variables (RESEND_API_KEY, RESEND_FROM_EMAIL) or set them in the admin panel',
      });
    }

    const { to } = req.body || {};
    if (!to) {
      return next(new HttpError(400, 'Recipient email address (to) is required'));
    }

    try {
      const result = await resendService.sendMail({
        to,
        subject: 'Plex Exporter Admin - Resend Test',
        text: 'This is a test email from the Plex Exporter Admin Panel using Resend.',
        html: '<h1>Resend Test</h1><p>This is a test email from the Plex Exporter Admin Panel using <strong>Resend</strong>.</p>',
      });

      res.json({
        success: true,
        message: 'Test email sent successfully',
        id: result.id,
        from: result.from,
        to: result.to,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Resend test failed', { error: message });
      res.status(502).json({ success: false, error: 'Resend test failed', details: message });
    }
  });

  /**
   * GET /admin/api/resend/settings
   * Get current Resend settings from database
   */
  router.get('/api/resend/settings', (_req: Request, res: Response) => {
    try {
      const apiKey = settingsRepository.get('resend.apiKey');
      const fromEmail = settingsRepository.get('resend.fromEmail');

      res.json({
        success: true,
        settings: {
          hasApiKey: !!apiKey?.value,
          apiKey: apiKey?.value ? maskSensitive(apiKey.value) : null,
          fromEmail: fromEmail?.value || null,
          updatedAt: apiKey?.updatedAt || fromEmail?.updatedAt || null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to get Resend settings', { error: message });
      res.status(500).json({ success: false, error: 'Failed to get Resend settings', details: message });
    }
  });

  /**
   * PUT /admin/api/resend/settings
   * Update Resend settings in database
   */
  router.put('/api/resend/settings', (req: Request, res: Response, next: NextFunction) => {
    const { apiKey, fromEmail } = req.body || {};

    if (!apiKey || !fromEmail) {
      return next(new HttpError(400, 'Both apiKey and fromEmail are required'));
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(fromEmail)) {
      return next(new HttpError(400, 'Invalid email format for fromEmail'));
    }

    try {
      settingsRepository.set('resend.apiKey', apiKey);
      settingsRepository.set('resend.fromEmail', fromEmail);

      logger.info('Resend settings updated', { fromEmail });

      res.json({
        success: true,
        message: 'Resend settings updated successfully',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to update Resend settings', { error: message });
      res.status(500).json({ success: false, error: 'Failed to update Resend settings', details: message });
    }
  });

  /**
   * DELETE /admin/api/resend/settings
   * Clear Resend settings from database
   */
  router.delete('/api/resend/settings', (_req: Request, res: Response) => {
    try {
      settingsRepository.delete('resend.apiKey');
      settingsRepository.delete('resend.fromEmail');

      logger.info('Resend settings cleared');

      res.json({
        success: true,
        message: 'Resend settings cleared successfully',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to clear Resend settings', { error: message });
      res.status(500).json({ success: false, error: 'Failed to clear Resend settings', details: message });
    }
  });

  /**
   * GET /admin/api/tautulli/settings
   * Get Tautulli settings from database
   */
  router.get('/api/tautulli/settings', (_req: Request, res: Response) => {
    try {
      const url = settingsRepository.get('tautulli.url');
      const apiKey = settingsRepository.get('tautulli.apiKey');

      res.json({
        success: true,
        settings: {
          url: url?.value || null,
          apiKey: apiKey?.value || null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to get Tautulli settings', { error: message });
      res.status(500).json({ success: false, error: 'Failed to get Tautulli settings', details: message });
    }
  });

  /**
   * PUT /admin/api/tautulli/settings
   * Update Tautulli settings in database
   */
  router.put('/api/tautulli/settings', (req: Request, res: Response, next: NextFunction) => {
    const { url, apiKey } = req.body || {};

    if (!url || !apiKey) {
      return next(new HttpError(400, 'Both url and apiKey are required'));
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return next(new HttpError(400, 'Invalid URL format for Tautulli URL'));
    }

    try {
      settingsRepository.set('tautulli.url', url);
      settingsRepository.set('tautulli.apiKey', apiKey);

      logger.info('Tautulli settings updated', { url });

      res.json({
        success: true,
        message: 'Tautulli settings updated successfully. Restart required to apply changes.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to update Tautulli settings', { error: message });
      res.status(500).json({ success: false, error: 'Failed to update Tautulli settings', details: message });
    }
  });

  /**
   * DELETE /admin/api/tautulli/settings
   * Clear Tautulli settings from database
   */
  router.delete('/api/tautulli/settings', (_req: Request, res: Response) => {
    try {
      settingsRepository.delete('tautulli.url');
      settingsRepository.delete('tautulli.apiKey');

      logger.info('Tautulli settings cleared');

      res.json({
        success: true,
        message: 'Tautulli settings cleared successfully. Restart required to apply changes.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to clear Tautulli settings', { error: message });
      res.status(500).json({ success: false, error: 'Failed to clear Tautulli settings', details: message });
    }
  });

  return router;
};

// Helper functions

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function getFileSize(filePath: string): number {
  try {
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch {
    return 0;
  }
}

function maskSensitive(value: string): string {
  if (value.length <= 8) {
    return '****';
  }
  const visibleChars = 4;
  const start = value.substring(0, visibleChars);
  const end = value.substring(value.length - visibleChars);
  return `${start}${'*'.repeat(value.length - visibleChars * 2)}${end}`;
}

export default createAdminRouter;
