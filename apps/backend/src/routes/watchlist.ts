import { Router } from 'express';
import { z } from 'zod';
import { watchlistEmailService } from '../services/watchlistEmailService.js';
import type SettingsRepository from '../repositories/settingsRepository.js';
import logger from '../services/logger.js';

export interface WatchlistRouterOptions {
  settingsRepository: SettingsRepository;
}

export const createWatchlistRouter = ({ settingsRepository }: WatchlistRouterOptions): Router => {
  const router = Router();

  // Validation schema
  const sendWatchlistEmailSchema = z.object({
    email: z.string().email(),
    items: z.array(z.object({
      title: z.string(),
      type: z.enum(['movie', 'tv']),
      year: z.number().optional().nullable(),
      summary: z.string().optional().nullable(),
      poster: z.string().optional().nullable(),
    })).min(1, 'At least one item is required'),
    sendCopyToAdmin: z.boolean().optional(),
  });

  /**
   * GET /api/watchlist/admin-email-configured
   * Check if admin email is configured (public endpoint)
   */
  router.get('/admin-email-configured', (_req, res) => {
    try {
      const adminEmail = settingsRepository.get('watchlist.adminEmail');
      res.json({
        configured: !!adminEmail?.value,
      });
    } catch (error) {
      logger.error('Failed to check admin email configuration', { error });
      res.json({ configured: false });
    }
  });

  /**
   * POST /api/watchlist/send-email
   * Send watchlist items via email
   */
  router.post('/send-email', async (req, res) => {
    try {
      const { email, items, sendCopyToAdmin } = sendWatchlistEmailSchema.parse(req.body);

      // Get admin email from settings if sendCopyToAdmin is true
      let adminEmail: string | undefined;
      if (sendCopyToAdmin) {
        const adminEmailSetting = settingsRepository.get('watchlist.adminEmail');
        adminEmail = adminEmailSetting?.value || undefined;
      }

      const emailId = await watchlistEmailService.sendWatchlistEmail(email, items, {
        sendCopyToAdmin,
        adminEmail,
      });

      res.json({
        success: true,
        message: 'Watchlist sent via email successfully',
        emailId,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request data',
          details: error.issues,
        });
      }

      logger.error('Failed to send watchlist email', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to send watchlist email',
      });
    }
  });

  return router;
};

export default createWatchlistRouter;
