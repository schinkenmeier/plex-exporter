import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/globalDb.js';
import { userBookmarks, mediaItems, type InsertUserBookmark, type UserBookmark } from '../db/schema.js';
import type { MailSender } from './resendService.js';
import logger from './logger.js';

export interface BookmarkWithMedia {
  id: string;
  userId: string;
  mediaItemId: number;
  createdAt: string;
  mediaItem: {
    id: number;
    title: string;
    type: string;
    year: number | null;
    poster: string | null;
    summary: string | null;
  };
}

class BookmarkService {
  private mailSender: MailSender | null = null;

  /**
   * Set mail sender for email functionality
   */
  setMailSender(sender: MailSender): void {
    this.mailSender = sender;
  }

  /**
   * Create a new bookmark for a user
   */
  async createBookmark(userId: string, mediaItemId: number): Promise<UserBookmark> {
    // Check if bookmark already exists
    const existing = await this.getBookmark(userId, mediaItemId);
    if (existing) {
      throw new Error('Bookmark already exists');
    }

    // Check if media item exists
    const mediaItem = await db.query.mediaItems.findFirst({
      where: eq(mediaItems.id, mediaItemId),
    });

    if (!mediaItem) {
      throw new Error('Media item not found');
    }

    const [bookmark] = await db
      .insert(userBookmarks)
      .values({ userId, mediaItemId })
      .returning();

    logger.info('Bookmark created', { userId, mediaItemId, bookmarkId: bookmark.id });
    return bookmark;
  }

  /**
   * Get a specific bookmark
   */
  async getBookmark(userId: string, mediaItemId: number): Promise<UserBookmark | undefined> {
    return db.query.userBookmarks.findFirst({
      where: and(
        eq(userBookmarks.userId, userId),
        eq(userBookmarks.mediaItemId, mediaItemId)
      ),
    });
  }

  /**
   * Get all bookmarks for a user with media details
   */
  async getUserBookmarks(userId: string): Promise<BookmarkWithMedia[]> {
    const bookmarks = await db.query.userBookmarks.findMany({
      where: eq(userBookmarks.userId, userId),
      with: {
        mediaItem: {
          columns: {
            id: true,
            title: true,
            type: true,
            year: true,
            poster: true,
            summary: true,
          },
        },
      },
      orderBy: [desc(userBookmarks.createdAt)],
    });

    return bookmarks as unknown as BookmarkWithMedia[];
  }

  /**
   * Delete a bookmark
   */
  async deleteBookmark(userId: string, mediaItemId: number): Promise<void> {
    const result = await db
      .delete(userBookmarks)
      .where(
        and(
          eq(userBookmarks.userId, userId),
          eq(userBookmarks.mediaItemId, mediaItemId)
        )
      )
      .returning();

    if (result.length === 0) {
      throw new Error('Bookmark not found');
    }

    logger.info('Bookmark deleted', { userId, mediaItemId });
  }

  /**
   * Delete all bookmarks for a user
   */
  async deleteAllUserBookmarks(userId: string): Promise<number> {
    const result = await db
      .delete(userBookmarks)
      .where(eq(userBookmarks.userId, userId))
      .returning();

    logger.info('All bookmarks deleted for user', { userId, count: result.length });
    return result.length;
  }

  /**
   * Send bookmarked items via email
   */
  async sendBookmarksEmail(userId: string, recipientEmail: string): Promise<string> {
    if (!this.mailSender) {
      throw new Error('Mail sender not configured. Email functionality is disabled.');
    }

    const bookmarks = await this.getUserBookmarks(userId);

    if (bookmarks.length === 0) {
      throw new Error('No bookmarks found to send');
    }

    // Build HTML email content
    const bookmarksList = bookmarks
      .map(
        (b) => `
          <div style="margin-bottom: 20px; padding: 15px; background: #f9f9f9; border-radius: 8px;">
            <h3 style="margin: 0 0 10px 0;">${b.mediaItem.title} ${b.mediaItem.year ? `(${b.mediaItem.year})` : ''}</h3>
            <p style="margin: 0; color: #666;">${b.mediaItem.type === 'movie' ? 'Movie' : 'TV Series'}</p>
            ${b.mediaItem.summary ? `<p style="margin: 10px 0 0 0; color: #333;">${b.mediaItem.summary.substring(0, 200)}${b.mediaItem.summary.length > 200 ? '...' : ''}</p>` : ''}
          </div>
        `
      )
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Your Bookmarked Media</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px; margin-bottom: 30px;">
            <h1 style="margin: 0;">Your Bookmarked Media</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Here are the ${bookmarks.length} items you've bookmarked</p>
          </div>
          ${bookmarksList}
          <div style="margin-top: 30px; padding: 20px; background: #f0f0f0; border-radius: 8px; text-align: center;">
            <p style="margin: 0; color: #666; font-size: 14px;">
              This email was sent from your Plex Exporter bookmarks collection.
            </p>
          </div>
        </body>
      </html>
    `;

    const result = await this.mailSender.sendMail({
      to: recipientEmail,
      subject: `Your Bookmarked Media (${bookmarks.length} items)`,
      html,
    });

    logger.info('Bookmarks email sent', { userId, recipientEmail, bookmarkCount: bookmarks.length, emailId: result.id });
    return result.id;
  }

  /**
   * Get bookmark count for a user
   */
  async getBookmarkCount(userId: string): Promise<number> {
    const bookmarks = await db.query.userBookmarks.findMany({
      where: eq(userBookmarks.userId, userId),
    });
    return bookmarks.length;
  }
}

export const bookmarkService = new BookmarkService();
