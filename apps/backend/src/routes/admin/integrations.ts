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
import { getActiveResendService, getResolvedResendConfigStatus } from './configStatus.js';

const DIAGNOSTIC_CHECKS = ['database', 'tautulli', 'tmdb', 'resend'] as const;

type DiagnosticCheck = typeof DIAGNOSTIC_CHECKS[number];

interface DiagnosticResult {
  key: DiagnosticCheck;
  success: boolean;
  message: string;
  durationMs: number;
  checkedAt: string;
}

const getElapsedMs = (start: bigint): number =>
  Math.round(Number(process.hrtime.bigint() - start) / 10_000) / 100;

const isDiagnosticCheck = (value: unknown): value is DiagnosticCheck =>
  typeof value === 'string' && DIAGNOSTIC_CHECKS.includes(value as DiagnosticCheck);

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

  const resolveActiveTautulliService = (): TautulliClient | null =>
    getTautulliService ? getTautulliService() : tautulliService;

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

  const runDiagnosticCheck = async (key: DiagnosticCheck): Promise<DiagnosticResult> => {
    const start = process.hrtime.bigint();
    const checkedAt = new Date().toISOString();

    try {
      switch (key) {
        case 'database': {
          const recordCount = mediaRepository.count();
          return {
            key,
            success: true,
            message: `Database connection successful (${recordCount} records)`,
            durationMs: getElapsedMs(start),
            checkedAt,
          };
        }
        case 'tautulli': {
          const activeTautulliService = resolveActiveTautulliService();
          if (!activeTautulliService) {
            throw new Error('Tautulli service is not configured');
          }
          const libraries = await activeTautulliService.getLibraries();
          return {
            key,
            success: true,
            message: `Successfully connected to Tautulli (${libraries.length} libraries)`,
            durationMs: getElapsedMs(start),
            checkedAt,
          };
        }
        case 'tmdb': {
          const result = await tmdbManager.testToken();
          return {
            key,
            success: true,
            message: result.message,
            durationMs: getElapsedMs(start),
            checkedAt,
          };
        }
        case 'resend': {
          const activeResendService = resolveActiveResendService();
          if (!activeResendService) {
            throw new Error('Resend service is not configured');
          }
          return {
            key,
            success: true,
            message: 'Resend service is configured',
            durationMs: getElapsedMs(start),
            checkedAt,
          };
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        key,
        success: false,
        message,
        durationMs: getElapsedMs(start),
        checkedAt,
      };
    }
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

  router.post('/test/tautulli', async (_req: Request, res: Response, next: NextFunction) => {
    const activeTautulliService = getTautulliService ? getTautulliService() : tautulliService;

    if (!activeTautulliService) {
      return next(
        new HttpError(
          503,
          'Tautulli service is not configured',
          {
            details: 'Please configure Tautulli environment variables (TAUTULLI_URL, TAUTULLI_API_KEY)',
          },
        ),
      );
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
      next(new HttpError(502, 'Tautulli test failed', { details: message }));
    }
  });

  router.post('/test/database', (_req: Request, res: Response, next: NextFunction) => {
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
      next(new HttpError(500, 'Database test failed', { details: message }));
    }
  });

  router.post('/test/resend', async (req: Request, res: Response, next: NextFunction) => {
    const activeResendService = resolveActiveResendService();
    if (!activeResendService) {
      return next(
        new HttpError(
          503,
          'Resend service is not configured',
          {
            details: 'Please configure Resend environment variables (RESEND_API_KEY, RESEND_FROM_EMAIL) or set them in the admin panel',
          },
        ),
      );
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
      next(new HttpError(502, 'Resend test failed', { details: message }));
    }
  });

  router.post('/diagnostics/run', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const checks = req.body?.checks;
      if (!Array.isArray(checks) || checks.length === 0) {
        throw new HttpError(400, 'checks must be a non-empty array.');
      }

      const invalidChecks = checks.filter(check => !isDiagnosticCheck(check));
      if (invalidChecks.length > 0) {
        throw new HttpError(400, 'Unsupported diagnostic check requested.', {
          details: {
            supportedChecks: [...DIAGNOSTIC_CHECKS],
            invalidChecks,
          },
        });
      }

      const uniqueChecks = [...new Set(checks.filter(isDiagnosticCheck))];
      const results = await Promise.all(uniqueChecks.map(check => runDiagnosticCheck(check)));

      res.json({
        success: true,
        results,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/resend/settings', (_req: Request, res: Response, next: NextFunction) => {
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
      next(new HttpError(500, 'Failed to get Resend settings', { details: message }));
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
      next(new HttpError(500, 'Failed to update Resend settings', { details: message }));
    }
  });

  router.delete('/resend/settings', (_req: Request, res: Response, next: NextFunction) => {
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
      next(new HttpError(500, 'Failed to clear Resend settings', { details: message }));
    }
  });

  return router;
};
