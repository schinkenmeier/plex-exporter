import { Router } from 'express';
import { z } from 'zod';
import { welcomeEmailService } from '../services/welcomeEmailService.js';
import logger from '../services/logger.js';

const router = Router();

// Validation schema
const sendWelcomeEmailSchema = z.object({
  email: z.string().email(),
  recipientName: z.string().optional(),
  toolUrl: z.string().url().optional(),
});

const deleteWelcomeEmailParamsSchema = z.object({
  id: z.string().uuid(),
});

const deleteByEmailParamsSchema = z.object({
  email: z.string().email(),
});

/**
 * POST /api/welcome-email
 * Send a welcome email to a specific address
 */
router.post('/', async (req, res) => {
  try {
    const { email, recipientName, toolUrl } = sendWelcomeEmailSchema.parse(req.body);

    // Check if already sent
    const alreadySent = await welcomeEmailService.hasReceivedWelcomeEmail(email);
    if (alreadySent) {
      return res.status(409).json({
        success: false,
        error: 'Welcome email has already been sent to this address',
      });
    }

    const emailId = await welcomeEmailService.sendWelcomeEmail(email, {
      recipientName,
      toolUrl,
    });

    res.json({
      success: true,
      message: 'Welcome email sent successfully',
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

    logger.error('Failed to send welcome email', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to send welcome email',
    });
  }
});

/**
 * GET /api/welcome-email/check/:email
 * Check if a welcome email has been sent to an address
 */
router.get('/check/:email', async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);

    // Basic email validation
    if (!email || !email.includes('@')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email address',
      });
    }

    const hasReceived = await welcomeEmailService.hasReceivedWelcomeEmail(email);

    res.json({
      success: true,
      hasReceived,
    });
  } catch (error) {
    logger.error('Failed to check welcome email status', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to check welcome email status',
    });
  }
});

/**
 * GET /api/welcome-email/history
 * Get all sent welcome emails (admin only)
 */
router.get('/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;

    const emails = await welcomeEmailService.getAllWelcomeEmails(limit);

    res.json({
      success: true,
      data: emails,
      count: emails.length,
    });
  } catch (error) {
    logger.error('Failed to get welcome email history', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve welcome email history',
    });
  }
});

/**
 * DELETE /api/welcome-email/history/:id
 * Remove a specific welcome email entry
 */
router.delete('/history/:id', async (req, res) => {
  try {
    const { id } = deleteWelcomeEmailParamsSchema.parse(req.params);
    const deleted = await welcomeEmailService.deleteWelcomeEmailById(id);

    if (deleted === 0) {
      return res.status(404).json({
        success: false,
        error: 'Welcome email entry not found',
      });
    }

    logger.info('Welcome email entry deleted', { id });
    res.json({
      success: true,
      message: 'Welcome email entry removed',
      deleted,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.issues,
      });
    }

    logger.error('Failed to delete welcome email entry', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to delete welcome email entry',
    });
  }
});

/**
 * DELETE /api/welcome-email/recipient/:email
 * Remove all welcome email entries for a recipient
 */
router.delete('/recipient/:email', async (req, res) => {
  try {
    const { email } = deleteByEmailParamsSchema.parse({
      email: decodeURIComponent(req.params.email ?? ''),
    });
    const deleted = await welcomeEmailService.deleteWelcomeEmailsByEmail(email);

    if (deleted === 0) {
      return res.status(404).json({
        success: false,
        error: 'No welcome email entries found for this recipient',
      });
    }

    logger.info('Welcome email entries deleted for recipient', { email, deleted });
    res.json({
      success: true,
      message: `Removed ${deleted} welcome email entr${deleted === 1 ? 'y' : 'ies'} for ${email}`,
      deleted,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid recipient email',
        details: error.issues,
      });
    }

    logger.error('Failed to delete welcome emails by recipient', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to delete welcome emails for recipient',
    });
  }
});

/**
 * DELETE /api/welcome-email/history
 * Clear entire welcome email history
 */
router.delete('/history', async (_req, res) => {
  try {
    const deleted = await welcomeEmailService.clearWelcomeEmails();
    logger.info('Welcome email history cleared', { deleted });
    res.json({
      success: true,
      message:
        deleted > 0
          ? `Removed ${deleted} welcome email entr${deleted === 1 ? 'y' : 'ies'}.`
          : 'No welcome email entries to remove.',
      deleted,
    });
  } catch (error) {
    logger.error('Failed to clear welcome email history', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to clear welcome email history',
    });
  }
});

/**
 * GET /api/welcome-email/stats
 * Get welcome email statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await welcomeEmailService.getStatistics();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Failed to get welcome email statistics', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve statistics',
    });
  }
});

export default router;
