import { Router } from 'express';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { watchlistEmailService } from '../services/watchlistEmailService.js';
import type SettingsRepository from '../repositories/settingsRepository.js';
import type WatchlistRequestRepository from '../repositories/watchlistRequestRepository.js';
import logger from '../services/logger.js';

export interface WatchlistRouterOptions {
  settingsRepository: SettingsRepository;
  watchlistRequestRepository: WatchlistRequestRepository;
  sendEmailLimiter?: RequestHandler;
}

export const createWatchlistRouter = ({
  settingsRepository,
  watchlistRequestRepository,
  sendEmailLimiter,
}: WatchlistRouterOptions): Router => {
  const router = Router();

  // Validation schema
  const sendWatchlistEmailSchema = z.object({
    email: z.string().email(),
    items: z.array(z.object({
      title: z.string().trim().min(1).max(200),
      type: z.enum(['movie', 'tv']),
      year: z.number().optional().nullable(),
      summary: z.string().max(2000).optional().nullable(),
      poster: z.string().max(2048).optional().nullable(),
    })).min(1, 'At least one item is required').max(50, 'At most 50 items are allowed'),
    message: z.string().trim().max(2000).optional().nullable(),
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
  router.post('/send-email', ...(sendEmailLimiter ? [sendEmailLimiter] : []), async (req, res) => {
    try {
      const { email, items, message, sendCopyToAdmin } = sendWatchlistEmailSchema.parse(req.body);
      const watchlistRequest = watchlistRequestRepository.create({
        requesterEmail: email,
        items,
        message: message || null,
      });

      // Get admin email from settings if sendCopyToAdmin is true
      let adminEmail: string | undefined;
      if (sendCopyToAdmin) {
        const adminEmailSetting = settingsRepository.get('watchlist.adminEmail');
        adminEmail = adminEmailSetting?.value || undefined;
      }

      try {
        const emailId = await watchlistEmailService.sendWatchlistEmail(email, items, {
          sendCopyToAdmin,
          adminEmail,
        });

        watchlistRequestRepository.setEmailIds(watchlistRequest.id, {
          confirmationEmailId: emailId,
        });

        res.json({
          success: true,
          message: 'Watchlist request created and email sent successfully',
          requestId: watchlistRequest.id,
          emailSent: true,
          emailId,
        });
      } catch (error) {
        logger.error('Watchlist request created but email sending failed', {
          error,
          requestId: watchlistRequest.id,
        });
        res.status(202).json({
          success: true,
          message: 'Watchlist request created, but email delivery failed',
          requestId: watchlistRequest.id,
          emailSent: false,
        });
      }
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
