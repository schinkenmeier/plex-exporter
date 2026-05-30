import { Router, type Response } from 'express';
import { z } from 'zod';
import { newsletterService } from '../services/newsletterService.js';
import logger from '../services/logger.js';

export const publicNewsletterRouter = Router();
export const adminNewsletterRouter = Router();

// Validation schemas
const subscribeSchema = z.object({
  email: z.string().email(),
  mediaType: z.enum(['movie', 'tv']).nullish().transform((value) => value ?? undefined),
});

const unsubscribeSchema = z.object({
  email: z.string().email(),
});

const sendNewsletterSchema = z.object({
  mediaType: z.enum(['movie', 'tv']).optional(),
  limit: z.number().int().positive().max(50).optional(),
  sinceDate: z.string().optional(),
});

const campaignCreateSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10000),
  mediaType: z.enum(['movie', 'tv']).nullable().optional(),
  mediaItemIds: z.array(z.number().int().positive()).max(50).optional(),
});

const campaignUpdateSchema = campaignCreateSchema.partial();

const campaignListQuerySchema = z.object({
  status: z.enum(['draft', 'sending', 'sent', 'failed']).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const campaignTestSchema = z.object({
  email: z.string().email().optional(),
  emails: z.array(z.string().email()).min(1).max(10).optional(),
}).refine((value) => value.email || value.emails?.length, {
  message: 'email or emails is required',
});

const sendValidationError = (res: Response, error: z.ZodError) =>
  res.status(400).json({
    success: false,
    error: 'Invalid request data',
    details: error.issues,
  });

/**
 * POST /api/newsletter/subscribe
 * Subscribe to newsletter
 */
publicNewsletterRouter.post('/subscribe', async (req, res) => {
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
publicNewsletterRouter.post('/unsubscribe', async (req, res) => {
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
 * GET /admin/api/newsletter/subscriptions
 * Get all active subscriptions
 */
adminNewsletterRouter.get('/subscriptions', async (req, res) => {
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
 * GET /admin/api/newsletter/campaigns
 * List newsletter campaign drafts
 */
adminNewsletterRouter.get('/campaigns', async (req, res) => {
  try {
    const query = campaignListQuerySchema.parse(req.query);
    const result = newsletterService.listCampaigns(query);

    res.json({
      success: true,
      data: result.campaigns,
      count: result.campaigns.length,
      pagination: result.pagination,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendValidationError(res, error);
    }
    logger.error('Failed to list newsletter campaigns', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to list newsletter campaigns',
    });
  }
});

/**
 * POST /admin/api/newsletter/campaigns
 * Create newsletter campaign draft
 */
adminNewsletterRouter.post('/campaigns', async (req, res) => {
  try {
    const campaignInput = campaignCreateSchema.parse(req.body);
    const campaign = newsletterService.createCampaign(campaignInput);

    res.status(201).json({
      success: true,
      data: campaign,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendValidationError(res, error);
    }

    logger.error('Failed to create newsletter campaign', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to create newsletter campaign',
    });
  }
});

/**
 * GET /admin/api/newsletter/campaigns/:id
 * Get newsletter campaign draft
 */
adminNewsletterRouter.get('/campaigns/:id', async (req, res) => {
  try {
    const campaign = newsletterService.getCampaign(req.params.id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found',
      });
    }

    res.json({
      success: true,
      data: campaign,
    });
  } catch (error) {
    logger.error('Failed to get newsletter campaign', { error, campaignId: req.params.id });
    res.status(500).json({
      success: false,
      error: 'Failed to get newsletter campaign',
    });
  }
});

/**
 * PATCH /admin/api/newsletter/campaigns/:id
 * Update newsletter campaign draft
 */
adminNewsletterRouter.patch('/campaigns/:id', async (req, res) => {
  try {
    const campaignInput = campaignUpdateSchema.parse(req.body);
    const campaign = newsletterService.updateCampaign(req.params.id, campaignInput);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found or not editable',
      });
    }

    res.json({
      success: true,
      data: campaign,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendValidationError(res, error);
    }

    logger.error('Failed to update newsletter campaign', { error, campaignId: req.params.id });
    res.status(500).json({
      success: false,
      error: 'Failed to update newsletter campaign',
    });
  }
});

/**
 * DELETE /admin/api/newsletter/campaigns/:id
 * Delete newsletter campaign draft
 */
adminNewsletterRouter.delete('/campaigns/:id', async (req, res) => {
  try {
    const exists = newsletterService.getCampaignRecord(req.params.id);
    const deleted = newsletterService.deleteCampaign(req.params.id);

    if (!deleted) {
      return res.status(exists ? 409 : 404).json({
        success: false,
        error: exists ? 'Campaign is not a draft' : 'Campaign not found',
      });
    }

    res.status(204).send();
  } catch (error) {
    logger.error('Failed to delete newsletter campaign', { error, campaignId: req.params.id });
    res.status(500).json({
      success: false,
      error: 'Failed to delete newsletter campaign',
    });
  }
});

/**
 * POST /admin/api/newsletter/campaigns/:id/test
 * Send newsletter campaign test
 */
adminNewsletterRouter.post('/campaigns/:id/test', async (req, res) => {
  try {
    const { email, emails } = campaignTestSchema.parse(req.body);
    const recipients = emails ?? (email ? [email] : []);
    const result = await newsletterService.sendCampaignTest(req.params.id, recipients);

    res.json({
      success: true,
      message: 'Newsletter campaign test sent',
      data: result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendValidationError(res, error);
    }

    if (error instanceof Error && error.message === 'Campaign not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    logger.error('Failed to send newsletter campaign test', { error, campaignId: req.params.id });
    res.status(500).json({
      success: false,
      error: 'Failed to send newsletter campaign test',
    });
  }
});

/**
 * POST /admin/api/newsletter/campaigns/:id/send
 * Send newsletter campaign to active subscribers
 */
adminNewsletterRouter.post('/campaigns/:id/send', async (req, res) => {
  try {
    const result = await newsletterService.sendCampaign(req.params.id);

    res.json({
      success: true,
      message: 'Newsletter campaign sent',
      data: result,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'Campaign not found' || error.message === 'Campaign is not a draft')
    ) {
      return res.status(error.message === 'Campaign not found' ? 404 : 409).json({
        success: false,
        error: error.message,
      });
    }

    logger.error('Failed to send newsletter campaign', { error, campaignId: req.params.id });
    res.status(500).json({
      success: false,
      error: 'Failed to send newsletter campaign',
    });
  }
});

/**
 * POST /admin/api/newsletter/send
 * Send newsletter to all active subscribers
 */
adminNewsletterRouter.post('/send', async (req, res) => {
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
 * GET /admin/api/newsletter/stats
 * Get newsletter statistics
 */
adminNewsletterRouter.get('/stats', async (req, res) => {
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
 * GET /admin/api/newsletter/recent-media
 * Get recently added media items
 */
adminNewsletterRouter.get('/recent-media', async (req, res) => {
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
 * GET /admin/api/newsletter/digests
 * Get recent newsletter digests
 */
adminNewsletterRouter.get('/digests', async (req, res) => {
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
