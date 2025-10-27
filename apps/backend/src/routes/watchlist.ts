import { Router } from 'express';
import { z } from 'zod';
import { watchlistEmailService } from '../services/watchlistEmailService.js';
import logger from '../services/logger.js';

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
});

/**
 * POST /api/watchlist/send-email
 * Send watchlist items via email
 */
router.post('/send-email', async (req, res) => {
  try {
    const { email, items } = sendWatchlistEmailSchema.parse(req.body);

    const emailId = await watchlistEmailService.sendWatchlistEmail(email, items);

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

export default router;
