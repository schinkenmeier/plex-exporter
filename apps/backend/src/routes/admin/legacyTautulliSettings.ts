import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AppConfig } from '../../config/index.js';
import { HttpError } from '../../middleware/errorHandler.js';
import SettingsRepository from '../../repositories/settingsRepository.js';
import type { TautulliConfigRepository } from '../../repositories/tautulliConfigRepository.js';
import logger from '../../services/logger.js';
import type { TautulliConfigStatus } from '../../services/tautulliConfigStatus.js';
import { normalizeTautulliUrl } from './helpers.js';
import { getResolvedAdminTautulliConfigStatus } from './configStatus.js';

export interface AdminLegacyTautulliSettingsRouterOptions {
  config: AppConfig;
  settingsRepository: SettingsRepository;
  tautulliConfigRepository?: TautulliConfigRepository | null;
  refreshTautulliIntegration?: (input?: { baseUrl: string; apiKey: string }) => void;
  getTautulliConfigStatus?: () => TautulliConfigStatus;
}

export const createAdminLegacyTautulliSettingsRouter = (
  options: AdminLegacyTautulliSettingsRouterOptions,
): Router => {
  const router = Router();
  const {
    config,
    settingsRepository,
    tautulliConfigRepository,
    refreshTautulliIntegration,
    getTautulliConfigStatus,
  } = options;

  const getResolvedTautulliConfigStatus = (): TautulliConfigStatus =>
    getResolvedAdminTautulliConfigStatus({
      config,
      settingsRepository,
      tautulliConfigRepository,
      getTautulliConfigStatus,
    });

  router.get('/', (_req: Request, res: Response, next: NextFunction) => {
    try {
      const canonical = tautulliConfigRepository?.get();
      const legacyUrl = settingsRepository.get('tautulli.url');
      const legacyApiKey = settingsRepository.get('tautulli.apiKey');
      const status = getResolvedTautulliConfigStatus();

      res.json({
        success: true,
        source: status.source,
        activeSource: status.activeSource,
        fromEnv: status.fromEnv,
        envOverride: status.envOverride,
        saved: status.saved,
        settings: {
          url: canonical?.tautulliUrl || legacyUrl?.value || null,
          apiKey: canonical?.apiKey || legacyApiKey?.value || null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to get Tautulli settings', { error: message });
      next(new HttpError(500, 'Failed to get Tautulli settings', { details: message }));
    }
  });

  router.put('/', async (req: Request, res: Response, next: NextFunction) => {
    const { url, apiKey } = req.body || {};

    if (!url || !apiKey) {
      return next(new HttpError(400, 'Both url and apiKey are required'));
    }

    try {
      new URL(url);
    } catch {
      return next(new HttpError(400, 'Invalid URL format for Tautulli URL'));
    }

    try {
      const normalizedUrl = normalizeTautulliUrl(String(url));
      const normalizedApiKey = String(apiKey);

      if (tautulliConfigRepository) {
        await tautulliConfigRepository.upsert({
          tautulliUrl: normalizedUrl,
          apiKey: normalizedApiKey,
        });
        settingsRepository.delete('tautulli.url');
        settingsRepository.delete('tautulli.apiKey');
      } else {
        settingsRepository.set('tautulli.url', normalizedUrl);
        settingsRepository.set('tautulli.apiKey', normalizedApiKey);
      }

      refreshTautulliIntegration?.({ baseUrl: normalizedUrl, apiKey: normalizedApiKey });
      const status = getResolvedTautulliConfigStatus();

      logger.info('Tautulli settings updated', {
        url: normalizedUrl,
        source: tautulliConfigRepository ? 'tautulli_config' : 'legacy_settings',
      });

      res.json({
        success: true,
        message: status.envOverride
          ? 'Tautulli settings saved. Environment configuration remains active.'
          : 'Tautulli settings updated successfully.',
        activeSource: status.activeSource,
        fromEnv: status.fromEnv,
        envOverride: status.envOverride,
        saved: status.saved,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to update Tautulli settings', { error: message });
      next(new HttpError(500, 'Failed to update Tautulli settings', { details: message }));
    }
  });

  router.delete('/', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      await tautulliConfigRepository?.delete();
      settingsRepository.delete('tautulli.url');
      settingsRepository.delete('tautulli.apiKey');
      refreshTautulliIntegration?.();
      const status = getResolvedTautulliConfigStatus();

      logger.info('Tautulli settings cleared');

      res.json({
        success: true,
        message: status.fromEnv
          ? 'Tautulli settings cleared. Environment configuration remains active.'
          : 'Tautulli settings cleared successfully.',
        activeSource: status.activeSource,
        fromEnv: status.fromEnv,
        envOverride: status.envOverride,
        saved: status.saved,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to clear Tautulli settings', { error: message });
      next(new HttpError(500, 'Failed to clear Tautulli settings', { details: message }));
    }
  });

  return router;
};
