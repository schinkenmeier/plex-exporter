import { Router, type Request, type Response, type NextFunction } from 'express';
import { HttpError } from '../middleware/errorHandler.js';
import type { LibrarySectionRepository } from '../repositories/librarySectionRepository.js';
import type { SyncScheduleRepository } from '../repositories/syncScheduleRepository.js';
import type { TautulliConfigRepository } from '../repositories/tautulliConfigRepository.js';
import type { SchedulerService } from '../services/schedulerService.js';
import type { TautulliClient } from '../services/tautulliService.js';
import type { TautulliSyncService } from '../services/tautulliSyncService.js';
import logger from '../services/logger.js';

export interface TautulliSyncRouterOptions {
  getTautulliService: () => TautulliClient | null;
  getTautulliSyncService: () => TautulliSyncService | null;
  librarySectionRepo: LibrarySectionRepository;
  syncScheduleRepo: SyncScheduleRepository;
  tautulliConfigRepo: TautulliConfigRepository;
  getSchedulerService: () => SchedulerService | null;
  refreshTautulliIntegration: (input?: { baseUrl: string; apiKey: string }) => void;
}

/**
 * Admin routes for Tautulli synchronization
 */
export const createTautulliSyncRouter = (options: TautulliSyncRouterOptions): Router => {
  const router = Router();
  const {
    getTautulliService,
    getTautulliSyncService,
    librarySectionRepo,
    syncScheduleRepo,
    tautulliConfigRepo,
    getSchedulerService,
    refreshTautulliIntegration,
  } = options;

  /**
   * GET /admin/api/tautulli/config
   * Get current Tautulli configuration
   */
  router.get('/config', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const config = tautulliConfigRepo.get();
      if (!config) {
        res.json({ configured: false });
        return;
      }
      res.json({
        configured: true,
        tautulliUrl: config.tautulliUrl,
        // Don't send the full API key, just indicate it's set
        hasApiKey: !!config.apiKey,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Normalize Tautulli URL by removing /api/v2 suffix if present
   */
  function normalizeTautulliUrl(url: string): string {
    let normalized = url.trim();
    // Remove trailing slash
    normalized = normalized.replace(/\/$/, '');
    // Remove /api/v2 suffix if present (case insensitive)
    normalized = normalized.replace(/\/api\/v2$/i, '');
    return normalized;
  }

  /**
   * POST /admin/api/tautulli/config
   * Save or update Tautulli configuration
   */
  router.post('/config', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tautulliUrl, apiKey } = req.body;

      if (!tautulliUrl || !apiKey) {
        throw new HttpError(400, 'tautulliUrl and apiKey are required');
      }

      const normalizedUrl = normalizeTautulliUrl(tautulliUrl);

      const config = await tautulliConfigRepo.upsert({
        tautulliUrl: normalizedUrl,
        apiKey,
      });

      try {
        refreshTautulliIntegration({ baseUrl: normalizedUrl, apiKey });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to refresh Tautulli integration after saving config', {
          message,
        });
        throw new HttpError(
          500,
          `Configuration saved but Tautulli service could not be initialized: ${message}`,
        );
      }

      res.json({
        success: true,
        message: 'Configuration saved successfully',
        config: {
          tautulliUrl: config.tautulliUrl,
          hasApiKey: true,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /admin/api/tautulli/config/test
   * Test Tautulli connection with provided or saved credentials
   */
  router.post('/config/test', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tautulliUrl, apiKey } = req.body;

      if (!tautulliUrl || !apiKey) {
        // Try to use saved config
        const config = tautulliConfigRepo.get();
        if (!config) {
          throw new HttpError(400, 'No configuration provided and no saved configuration found');
        }

        // Test with saved config
        let existingService = getTautulliService();
        if (!existingService) {
          try {
            refreshTautulliIntegration();
            existingService = getTautulliService();
          } catch (refreshError) {
            const message = refreshError instanceof Error ? refreshError.message : 'Unknown error';
            throw new HttpError(503, `Tautulli service is not configured: ${message}`);
          }
        }

        if (!existingService) {
          throw new HttpError(503, 'Tautulli service is not configured');
        }

        const libraries = await existingService.getLibraries();
        res.json({
          success: true,
          message: 'Connection successful',
          libraryCount: libraries.length,
        });
      } else {
        // Test with provided credentials (without saving)
        const { TautulliService } = await import('../services/tautulliService.js');
        const normalizedUrl = normalizeTautulliUrl(tautulliUrl);

        logger.info('Testing Tautulli connection', {
          normalizedUrl,
          originalUrl: tautulliUrl,
        });

        const testService = new TautulliService({
          baseUrl: normalizedUrl,
          apiKey: apiKey,
        });
        const libraries = await testService.getLibraries();

        logger.info('Tautulli connection test successful', {
          libraryCount: libraries.length,
        });

        res.json({
          success: true,
          message: 'Connection successful',
          libraryCount: libraries.length,
        });
      }
    } catch (error) {
      let message = 'Unknown error';
      let details = {};

      if (error instanceof Error) {
        message = error.message;
      }

      // Check if it's an Axios error with more details
      if (error && typeof error === 'object' && 'isAxiosError' in error) {
        const axiosError = error as any;
        if (axiosError.response) {
          // Server responded with error status
          const status = axiosError.response.status;
          const data = axiosError.response.data;
          message = `HTTP ${status}: ${data?.message || data?.error || axiosError.message}`;
          details = {
            status,
            statusText: axiosError.response.statusText,
            data: data,
            url: axiosError.config?.url,
          };
        } else if (axiosError.request) {
          // Request was made but no response received
          message = `No response from server. Check if Tautulli is running at the provided URL. (${axiosError.message})`;
          details = {
            requestUrl: axiosError.config?.url,
            code: axiosError.code,
          };
        } else {
          message = axiosError.message;
        }
      }

      logger.error('Tautulli connection test failed', {
        error: message,
        details,
      });

      next(new HttpError(502, `Connection test failed: ${message}`));
    }
  });

  /**
   * GET /admin/api/tautulli/libraries
   * Get all available libraries from Tautulli
   */
  router.get('/libraries', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      // Try to use existing service, or create one from saved config
      let serviceToUse = getTautulliService();

      if (!serviceToUse) {
        // Load config from database and create temporary service
        const config = tautulliConfigRepo.get();
        if (!config) {
          throw new HttpError(503, 'Tautulli is not configured. Please configure it first in the connection settings.');
        }

        try {
          refreshTautulliIntegration({ baseUrl: config.tautulliUrl, apiKey: config.apiKey });
        } catch (refreshError) {
          const message = refreshError instanceof Error ? refreshError.message : 'Unknown error';
          throw new HttpError(503, `Failed to initialize Tautulli service: ${message}`);
        }
        serviceToUse = getTautulliService();
      }

      if (!serviceToUse) {
        throw new HttpError(503, 'Tautulli service is not configured.');
      }

      const libraries = await serviceToUse.getLibraries();
      res.json({
        libraries: libraries.map((lib) => ({
          sectionId: typeof lib.section_id === 'string' ? parseInt(lib.section_id) : lib.section_id,
          sectionName: lib.section_name,
          friendlyName: lib.friendly_name,
          sectionType: lib.section_type,
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      next(new HttpError(502, `Failed to fetch libraries from Tautulli: ${message}`));
    }
  });

  /**
   * GET /admin/api/tautulli/library-sections
   * Get configured library sections
   */
  router.get('/library-sections', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const sections = librarySectionRepo.listAll();
      logger.info('Retrieved library sections', { count: sections.length, sections });
      res.json({ sections });
    } catch (error) {
      logger.error('Failed to retrieve library sections', { error });
      next(error);
    }
  });

  /**
   * POST /admin/api/tautulli/library-sections
   * Configure library sections for syncing
   */
  router.post('/library-sections', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sections } = req.body;

      if (!Array.isArray(sections)) {
        throw new HttpError(400, 'sections must be an array');
      }

      // Validate sections
      for (const section of sections) {
        if (typeof section.sectionId !== 'number') {
          throw new HttpError(400, 'sectionId must be a number');
        }
        if (typeof section.sectionName !== 'string') {
          throw new HttpError(400, 'sectionName must be a string');
        }
        if (!['movie', 'show'].includes(section.sectionType)) {
          throw new HttpError(400, 'sectionType must be "movie" or "show"');
        }
      }

      logger.info('Saving library sections', { count: sections.length, sections });

      // Delete existing sections and create new ones
      librarySectionRepo.deleteAll();
      const created = librarySectionRepo.bulkCreate(
        sections.map((s: { sectionId: number; sectionName: string; sectionType: 'movie' | 'show'; enabled?: boolean }) => ({
          sectionId: s.sectionId,
          sectionName: s.sectionName,
          sectionType: s.sectionType,
          enabled: s.enabled ?? true,
        })),
      );

      logger.info('Library sections saved successfully', { count: created.length, created });

      res.json({
        message: `Configured ${created.length} library sections`,
        sections: created,
      });
    } catch (error) {
      if (error instanceof HttpError) {
        next(error);
      } else {
        const message = error instanceof Error ? error.message : 'Unknown error';
        next(new HttpError(500, `Failed to configure library sections: ${message}`));
      }
    }
  });

  /**
   * PUT /admin/api/tautulli/library-sections/:id/enabled
   * Enable or disable a library section
   */
  router.put('/library-sections/:id/enabled', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { enabled } = req.body;

      if (typeof enabled !== 'boolean') {
        throw new HttpError(400, 'enabled must be a boolean');
      }

      const section = librarySectionRepo.getById(id);
      if (!section) {
        throw new HttpError(404, 'Library section not found');
      }

      librarySectionRepo.setEnabled(id, enabled);

      res.json({
        message: `Library section ${enabled ? 'enabled' : 'disabled'}`,
        section: librarySectionRepo.getById(id),
      });
    } catch (error) {
      if (error instanceof HttpError) {
        next(error);
      } else {
        const message = error instanceof Error ? error.message : 'Unknown error';
        next(new HttpError(500, message));
      }
    }
  });

  /**
   * POST /admin/api/tautulli/sync/manual
   * Manually trigger a sync
   */
  router.post('/sync/manual', async (req: Request, res: Response, next: NextFunction) => {
    try {
      let syncService = getTautulliSyncService();

      if (!syncService) {
        try {
          refreshTautulliIntegration();
          syncService = getTautulliSyncService();
        } catch (refreshError) {
          const message = refreshError instanceof Error ? refreshError.message : 'Unknown error';
          throw new HttpError(
            503,
            `Tautulli sync service is not initialized. Failed to refresh configuration: ${message}`,
          );
        }
      }

      if (!syncService) {
        throw new HttpError(
          503,
          'Tautulli sync service is not initialized. Please verify the Tautulli configuration.',
        );
      }

      const { incremental, enrichWithTmdb, syncCovers } = req.body;

      const options = {
        incremental: incremental ?? false,
        enrichWithTmdb: enrichWithTmdb ?? true,
        syncCovers: syncCovers ?? false,
      };

      // Start sync in background (don't await)
      syncService
        .syncAll(options, (progress) => {
          console.log(
            `[Manual Sync] ${progress.phase}: ${progress.current}/${progress.total} (${progress.percentage}%)`,
          );
        })
        .then((stats) => {
          console.log('Manual sync completed:', stats);
        })
        .catch((error) => {
          console.error('Manual sync failed:', error);
        });

      res.json({
        message: 'Sync started',
        options,
      });
    } catch (error) {
      if (error instanceof HttpError) {
        next(error);
      } else {
        const message = error instanceof Error ? error.message : 'Unknown error';
        next(new HttpError(500, `Failed to start sync: ${message}`));
      }
    }
  });

  /**
   * GET /admin/api/tautulli/sync/schedules
   * Get all sync schedules
   */
  router.get('/sync/schedules', (_req: Request, res: Response) => {
    const schedules = syncScheduleRepo.listAll();
    res.json({ schedules });
  });

  /**
   * POST /admin/api/tautulli/sync/schedules
   * Create or update a sync schedule
   */
  router.post('/sync/schedules', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { jobType, cronExpression, enabled } = req.body;

      if (!['tautulli_sync', 'cover_update'].includes(jobType)) {
        throw new HttpError(400, 'jobType must be "tautulli_sync" or "cover_update"');
      }

      if (typeof cronExpression !== 'string' || !cronExpression.trim()) {
        throw new HttpError(400, 'cronExpression must be a non-empty string');
      }

      const schedule = syncScheduleRepo.upsert(jobType, {
        jobType,
        cronExpression: cronExpression.trim(),
        enabled: enabled ?? true,
      });

      // Reload scheduler if it's running
      const schedulerService = getSchedulerService();
      if (schedulerService && schedulerService.isActive()) {
        schedulerService.reload();
      }

      res.json({
        message: 'Schedule configured',
        schedule,
      });
    } catch (error) {
      if (error instanceof HttpError) {
        next(error);
      } else {
        const message = error instanceof Error ? error.message : 'Unknown error';
        next(new HttpError(500, `Failed to configure schedule: ${message}`));
      }
    }
  });

  /**
   * PUT /admin/api/tautulli/sync/schedules/:id/enabled
   * Enable or disable a sync schedule
   */
  router.put('/sync/schedules/:id/enabled', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { enabled } = req.body;

      if (typeof enabled !== 'boolean') {
        throw new HttpError(400, 'enabled must be a boolean');
      }

      const schedule = syncScheduleRepo.getById(id);
      if (!schedule) {
        throw new HttpError(404, 'Schedule not found');
      }

      syncScheduleRepo.setEnabled(id, enabled);

      // Reload scheduler if it's running
      const schedulerService = getSchedulerService();
      if (schedulerService && schedulerService.isActive()) {
        schedulerService.reload();
      }

      res.json({
        message: `Schedule ${enabled ? 'enabled' : 'disabled'}`,
        schedule: syncScheduleRepo.getById(id),
      });
    } catch (error) {
      if (error instanceof HttpError) {
        next(error);
      } else {
        const message = error instanceof Error ? error.message : 'Unknown error';
        next(new HttpError(500, message));
      }
    }
  });

  /**
   * DELETE /admin/api/tautulli/sync/schedules/:id
   * Delete a sync schedule
   */
  router.delete('/sync/schedules/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const schedule = syncScheduleRepo.getById(id);
      if (!schedule) {
        throw new HttpError(404, 'Schedule not found');
      }

      syncScheduleRepo.delete(id);

      // Reload scheduler if it's running
      const schedulerService = getSchedulerService();
      if (schedulerService && schedulerService.isActive()) {
        schedulerService.reload();
      }

      res.json({
        message: 'Schedule deleted',
      });
    } catch (error) {
      if (error instanceof HttpError) {
        next(error);
      } else {
        const message = error instanceof Error ? error.message : 'Unknown error';
        next(new HttpError(500, message));
      }
    }
  });

  return router;
};
