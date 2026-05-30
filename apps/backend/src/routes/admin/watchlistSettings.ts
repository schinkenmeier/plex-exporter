import { Router, type NextFunction, type Request, type Response } from 'express';
import { HttpError } from '../../middleware/errorHandler.js';
import SettingsRepository from '../../repositories/settingsRepository.js';
import logger from '../../services/logger.js';
import { isValidEmail } from './helpers.js';

export interface AdminWatchlistSettingsRouterOptions {
  settingsRepository: SettingsRepository;
}

export const createAdminWatchlistSettingsRouter = ({
  settingsRepository,
}: AdminWatchlistSettingsRouterOptions): Router => {
  const router = Router();

  router.get('/admin-email', (_req: Request, res: Response, next: NextFunction) => {
    try {
      const adminEmail = settingsRepository.get('watchlist.adminEmail');

      res.json({
        success: true,
        adminEmail: adminEmail?.value || null,
        updatedAt: adminEmail?.updatedAt || null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to get watchlist admin email', { error: message });
      next(new HttpError(500, 'Failed to get watchlist admin email', { details: message }));
    }
  });

  router.put('/admin-email', (req: Request, res: Response, next: NextFunction) => {
    const { adminEmail } = req.body || {};

    if (!adminEmail) {
      return next(new HttpError(400, 'Admin email is required'));
    }

    if (!isValidEmail(adminEmail)) {
      return next(new HttpError(400, 'Invalid email format for admin email'));
    }

    try {
      settingsRepository.set('watchlist.adminEmail', adminEmail);

      logger.info('Watchlist admin email updated', { adminEmail });

      res.json({
        success: true,
        message: 'Watchlist admin email updated successfully',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to update watchlist admin email', { error: message });
      next(new HttpError(500, 'Failed to update watchlist admin email', { details: message }));
    }
  });

  router.delete('/admin-email', (_req: Request, res: Response, next: NextFunction) => {
    try {
      settingsRepository.delete('watchlist.adminEmail');

      logger.info('Watchlist admin email cleared');

      res.json({
        success: true,
        message: 'Watchlist admin email cleared successfully',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to clear watchlist admin email', { error: message });
      next(new HttpError(500, 'Failed to clear watchlist admin email', { details: message }));
    }
  });

  return router;
};
