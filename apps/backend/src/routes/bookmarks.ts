import { Router } from 'express';
import { z } from 'zod';
import { bookmarkService } from '../services/bookmarkService.js';
import logger from '../services/logger.js';

const router = Router();

// Validation schemas
const createBookmarkSchema = z.object({
  mediaItemId: z.number().int().positive(),
});

const deleteBookmarkSchema = z.object({
  mediaItemId: z.number().int().positive(),
});

const sendBookmarksEmailSchema = z.object({
  email: z.string().email(),
});

/**
 * GET /api/bookmarks
 * Get all bookmarks for the authenticated user
 */
router.get('/', async (req, res) => {
  try {
    // For now, use a default user ID (in production, this would come from auth middleware)
    const userId = req.headers['x-user-id'] as string || 'default-user';

    const bookmarks = await bookmarkService.getUserBookmarks(userId);

    res.json({
      success: true,
      data: bookmarks,
      count: bookmarks.length,
    });
  } catch (error) {
    logger.error('Failed to get bookmarks', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve bookmarks',
    });
  }
});

/**
 * POST /api/bookmarks
 * Create a new bookmark
 */
router.post('/', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string || 'default-user';
    const { mediaItemId } = createBookmarkSchema.parse(req.body);

    const bookmark = await bookmarkService.createBookmark(userId, mediaItemId);

    res.status(201).json({
      success: true,
      data: bookmark,
      message: 'Bookmark created successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.issues,
      });
    }

    if (error instanceof Error && error.message === 'Bookmark already exists') {
      return res.status(409).json({
        success: false,
        error: error.message,
      });
    }

    if (error instanceof Error && error.message === 'Media item not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    logger.error('Failed to create bookmark', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to create bookmark',
    });
  }
});

/**
 * DELETE /api/bookmarks/:mediaItemId
 * Delete a specific bookmark
 */
router.delete('/:mediaItemId', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string || 'default-user';
    const mediaItemId = parseInt(req.params.mediaItemId, 10);

    if (isNaN(mediaItemId) || mediaItemId <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid media item ID',
      });
    }

    await bookmarkService.deleteBookmark(userId, mediaItemId);

    res.json({
      success: true,
      message: 'Bookmark deleted successfully',
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Bookmark not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    logger.error('Failed to delete bookmark', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to delete bookmark',
    });
  }
});

/**
 * DELETE /api/bookmarks
 * Delete all bookmarks for the authenticated user
 */
router.delete('/', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string || 'default-user';

    const count = await bookmarkService.deleteAllUserBookmarks(userId);

    res.json({
      success: true,
      message: `Deleted ${count} bookmark(s)`,
      count,
    });
  } catch (error) {
    logger.error('Failed to delete all bookmarks', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to delete bookmarks',
    });
  }
});

/**
 * POST /api/bookmarks/send-email
 * Send bookmarked items via email
 */
router.post('/send-email', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string || 'default-user';
    const { email } = sendBookmarksEmailSchema.parse(req.body);

    const emailId = await bookmarkService.sendBookmarksEmail(userId, email);

    res.json({
      success: true,
      message: 'Bookmarks sent via email successfully',
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

    if (error instanceof Error && error.message === 'No bookmarks found to send') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    logger.error('Failed to send bookmarks email', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to send bookmarks email',
    });
  }
});

/**
 * GET /api/bookmarks/count
 * Get bookmark count for the authenticated user
 */
router.get('/count', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string || 'default-user';

    const count = await bookmarkService.getBookmarkCount(userId);

    res.json({
      success: true,
      count,
    });
  } catch (error) {
    logger.error('Failed to get bookmark count', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get bookmark count',
    });
  }
});

export default router;
