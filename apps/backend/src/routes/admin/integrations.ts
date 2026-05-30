import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AppConfig } from '../../config/index.js';
import { HttpError } from '../../middleware/errorHandler.js';
import type MediaRepository from '../../repositories/mediaRepository.js';
import SettingsRepository from '../../repositories/settingsRepository.js';
import type { MailSender } from '../../services/resendService.js';
import type { TautulliClient } from '../../services/tautulliService.js';
import logger from '../../services/logger.js';
import type { TmdbManager } from '../../services/tmdbManager.js';
import type { HeroPipelineService } from '../../services/heroPipeline.js';
import { isValidEmail } from './helpers.js';
import { getActiveResendService, getResolvedResendConfigStatus } from './status.js';

export interface AdminIntegrationsRouterOptions {
  config: AppConfig;
  mediaRepository: MediaRepository;
  resendService: MailSender | null;
  getResendService?: () => MailSender | null;
  tautulliService: TautulliClient | null;
  getTautulliService?: () => TautulliClient | null;
  settingsRepository: SettingsRepository;
  tmdbManager: TmdbManager;
  heroPipeline: HeroPipelineService;
  refreshResendIntegration?: () => MailSender | null;
  refreshTmdbIntegration?: () => unknown;
}

export const createAdminIntegrationsRouter = (options: AdminIntegrationsRouterOptions): Router => {
  const router = Router();
  const {
    config,
    mediaRepository,
    resendService,
    getResendService,
    tautulliService,
    getTautulliService,
    settingsRepository,
    tmdbManager,
    heroPipeline,
    refreshResendIntegration,
    refreshTmdbIntegration,
  } = options;

  const resolveActiveResendService = (): MailSender | null =>
    getActiveResendService({ resendService, getResendService });

  const getTmdbStatusResponse = () => {
    const status = tmdbManager.getStatus();
    return {
      enabled: status.hasToken,
      source: status.source,
      tokenPreview: status.tokenPreview,
      updatedAt: status.updatedAt,
      fromEnv: status.fromEnv,
      fromDatabase: status.fromDatabase,
      envOverride: status.envOverride,
      saved: status.saved,
    };
  };

  router.get('/tmdb', (_req: Request, res: Response) => {
    res.json(getTmdbStatusResponse());
  });

  router.post('/tmdb', (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawToken = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
      if (!rawToken) {
        throw new HttpError(400, 'TMDb access token must not be empty.');
      }
      const record = settingsRepository.set('tmdb.accessToken', rawToken);
      const service = tmdbManager.setDatabaseToken(record.value, { updatedAt: record.updatedAt });
      heroPipeline.setTmdbService(service);
      refreshTmdbIntegration?.();
      res.json({
        success: true,
        status: getTmdbStatusResponse(),
      });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/tmdb', (_req: Request, res: Response) => {
    settingsRepository.delete('tmdb.accessToken');
    const service = tmdbManager.setDatabaseToken(null);
    heroPipeline.setTmdbService(service);
    refreshTmdbIntegration?.();
    res.json({
      success: true,
      status: getTmdbStatusResponse(),
    });
  });

  router.post('/test/tmdb', async (req: Request, res: Response, next: NextFunction) => {
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

  router.post('/test/tautulli', async (_req: Request, res: Response) => {
    const activeTautulliService = getTautulliService ? getTautulliService() : tautulliService;

    if (!activeTautulliService) {
      return res.status(503).json({
        success: false,
        error: 'Tautulli service is not configured',
        message: 'Please configure Tautulli environment variables (TAUTULLI_URL, TAUTULLI_API_KEY)',
      });
    }

    try {
      const libraries = await activeTautulliService.getLibraries();

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

  router.post('/test/database', (_req: Request, res: Response) => {
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

  router.post('/test/resend', async (req: Request, res: Response, next: NextFunction) => {
    const activeResendService = resolveActiveResendService();
    if (!activeResendService) {
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
      const result = await activeResendService.sendMail({
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

  router.get('/resend/settings', (_req: Request, res: Response) => {
    try {
      const status = getResolvedResendConfigStatus({
        config,
        settingsRepository,
        resendService,
        getResendService,
      });

      res.json({
        success: true,
        ...status,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to get Resend settings', { error: message });
      res.status(500).json({ success: false, error: 'Failed to get Resend settings', details: message });
    }
  });

  router.put('/resend/settings', (req: Request, res: Response, next: NextFunction) => {
    const { apiKey, fromEmail } = req.body || {};

    if (!apiKey || !fromEmail) {
      return next(new HttpError(400, 'Both apiKey and fromEmail are required'));
    }

    if (!isValidEmail(fromEmail)) {
      return next(new HttpError(400, 'Invalid email format for fromEmail'));
    }

    try {
      settingsRepository.set('resend.apiKey', apiKey);
      settingsRepository.set('resend.fromEmail', fromEmail);
      const activeService = refreshResendIntegration?.() ?? resolveActiveResendService();
      const status = getResolvedResendConfigStatus({
        config,
        settingsRepository,
        resendService: activeService,
        getResendService,
      });

      logger.info('Resend settings updated', { fromEmail });

      res.json({
        success: true,
        message: status.envOverride
          ? 'Resend settings saved. Environment configuration remains active.'
          : 'Resend settings updated successfully',
        enabled: Boolean(activeService),
        status,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to update Resend settings', { error: message });
      res.status(500).json({ success: false, error: 'Failed to update Resend settings', details: message });
    }
  });

  router.delete('/resend/settings', (_req: Request, res: Response) => {
    try {
      settingsRepository.delete('resend.apiKey');
      settingsRepository.delete('resend.fromEmail');
      const activeService = refreshResendIntegration?.() ?? resolveActiveResendService();
      const status = getResolvedResendConfigStatus({
        config,
        settingsRepository,
        resendService: activeService,
        getResendService,
      });

      logger.info('Resend settings cleared');

      res.json({
        success: true,
        message: status.fromEnv
          ? 'Resend settings cleared. Environment configuration remains active.'
          : 'Resend settings cleared successfully',
        enabled: Boolean(activeService),
        status,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to clear Resend settings', { error: message });
      res.status(500).json({ success: false, error: 'Failed to clear Resend settings', details: message });
    }
  });

  return router;
};
