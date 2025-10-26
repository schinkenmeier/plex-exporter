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
