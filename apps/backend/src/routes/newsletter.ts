import { Router } from 'express';
import { z } from 'zod';
import { newsletterService } from '../services/newsletterService.js';
import logger from '../services/logger.js';

const router = Router();

// Validation schemas
const subscribeSchema = z.object({
  email: z.string().email(),
  mediaType: z.enum(['movie', 'tv']).optional(),
});

const unsubscribeSchema = z.object({
  email: z.string().email(),
});

const sendNewsletterSchema = z.object({
  mediaType: z.enum(['movie', 'tv']).optional(),
  limit: z.number().int().positive().max(50).optional(),
  sinceDate: z.string().optional(),
});

/**
 * POST /api/newsletter/subscribe
 * Subscribe to newsletter
 */
router.post('/subscribe', async (req, res) => {
  try {
    const { email, mediaType } = subscribeSchema.parse(req.body);

    const subscription = await newsletterService.subscribe(email, mediaType);

    res.json({
      success: true,
      data: subscription,
      message: 'Successfully subscribed to newsletter',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.issues,
      });
    }

    logger.error('Failed to subscribe to newsletter', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to subscribe to newsletter',
    });
  }
});

/**
 * POST /api/newsletter/unsubscribe
 * Unsubscribe from newsletter
 */
router.post('/unsubscribe', async (req, res) => {
  try {
    const { email } = unsubscribeSchema.parse(req.body);

    await newsletterService.unsubscribe(email);

    res.json({
      success: true,
      message: 'Successfully unsubscribed from newsletter',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.issues,
      });
    }

    if (error instanceof Error && error.message === 'Subscription not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    logger.error('Failed to unsubscribe from newsletter', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to unsubscribe from newsletter',
    });
  }
});

/**
 * GET /api/newsletter/subscriptions
 * Get all active subscriptions (admin only)
 */
router.get('/subscriptions', async (req, res) => {
  try {
    const mediaType = req.query.mediaType as 'movie' | 'tv' | undefined;

    const subscriptions = await newsletterService.getActiveSubscriptions(mediaType);

    res.json({
      success: true,
      data: subscriptions,
      count: subscriptions.length,
    });
  } catch (error) {
    logger.error('Failed to get subscriptions', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve subscriptions',
    });
  }
});

/**
 * POST /api/newsletter/send
 * Send newsletter to all active subscribers (admin only)
 */
router.post('/send', async (req, res) => {
  try {
    const { mediaType, limit, sinceDate } = sendNewsletterSchema.parse(req.body);

    const result = await newsletterService.sendNewsletter({
      mediaType,
      limit,
      sinceDate,
    });

    res.json({
      success: true,
      message: 'Newsletter sent successfully',
      data: result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.issues,
      });
    }

    logger.error('Failed to send newsletter', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to send newsletter',
    });
  }
});

/**
 * GET /api/newsletter/stats
 * Get newsletter statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await newsletterService.getStatistics();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Failed to get newsletter statistics', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve statistics',
    });
  }
});

/**
 * GET /api/newsletter/recent-media
 * Get recently added media items
 */
router.get('/recent-media', async (req, res) => {
  try {
    const mediaType = req.query.mediaType as 'movie' | 'tv' | undefined;
    const limit = parseInt(req.query.limit as string) || 10;
    const sinceDate = req.query.sinceDate as string | undefined;

    const items = await newsletterService.getRecentlyAddedMedia({
      mediaType,
      limit,
      sinceDate,
    });

    res.json({
      success: true,
      data: items,
      count: items.length,
    });
  } catch (error) {
    logger.error('Failed to get recent media', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve recent media',
    });
  }
});

/**
 * GET /api/newsletter/digests
 * Get recent newsletter digests (admin only)
 */
router.get('/digests', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;

    const digests = await newsletterService.getRecentDigests(limit);

    res.json({
      success: true,
      data: digests,
      count: digests.length,
    });
  } catch (error) {
    logger.error('Failed to get newsletter digests', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve newsletter digests',
    });
  }
});

export default router;
