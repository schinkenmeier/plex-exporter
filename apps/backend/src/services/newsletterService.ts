import { eq, and, desc, gte } from 'drizzle-orm';
import { db } from '../db/globalDb.js';
import {
  newsletterSubscriptions,
  newsletterDigests,
  mediaItems,
  type InsertNewsletterSubscription,
  type NewsletterSubscription,
  type MediaItem,
} from '../db/schema.js';
import type { MailSender } from './resendService.js';
import logger from './logger.js';

export interface NewsletterOptions {
  mediaType?: 'movie' | 'tv';
  limit?: number;
  sinceDate?: string;
}

class NewsletterService {
  private mailSender: MailSender | null = null;

  /**
   * Set mail sender for email functionality
   */
  setMailSender(sender: MailSender): void {
    this.mailSender = sender;
  }

  /**
   * Subscribe to newsletter
   */
  async subscribe(email: string, mediaType?: 'movie' | 'tv'): Promise<NewsletterSubscription> {
    // Check if subscription already exists
    const existing = await db.query.newsletterSubscriptions.findFirst({
      where: eq(newsletterSubscriptions.email, email),
    });

    if (existing) {
      // Update existing subscription
      const [updated] = await db
        .update(newsletterSubscriptions)
        .set({
          mediaType,
          active: true,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(newsletterSubscriptions.email, email))
        .returning();

      logger.info('Newsletter subscription updated', { email, mediaType });
      return updated;
    }

    // Create new subscription
    const [subscription] = await db
      .insert(newsletterSubscriptions)
      .values({ email, mediaType })
      .returning();

    logger.info('Newsletter subscription created', { email, mediaType });
    return subscription;
  }

  /**
   * Unsubscribe from newsletter
   */
  async unsubscribe(email: string): Promise<void> {
    const result = await db
      .update(newsletterSubscriptions)
      .set({
        active: false,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(newsletterSubscriptions.email, email))
      .returning();

    if (result.length === 0) {
      throw new Error('Subscription not found');
    }

    logger.info('Newsletter subscription deactivated', { email });
  }

  /**
   * Get all active subscriptions
   */
  async getActiveSubscriptions(mediaType?: 'movie' | 'tv'): Promise<NewsletterSubscription[]> {
    const conditions = [eq(newsletterSubscriptions.active, true)];

    if (mediaType) {
      conditions.push(eq(newsletterSubscriptions.mediaType, mediaType));
    }

    return db.query.newsletterSubscriptions.findMany({
      where: and(...conditions),
      orderBy: [desc(newsletterSubscriptions.createdAt)],
    });
  }

  /**
   * Get recently added media items
   */
  async getRecentlyAddedMedia(options: NewsletterOptions = {}): Promise<MediaItem[]> {
    const { mediaType, limit = 10, sinceDate } = options;

    const conditions = [];

    if (mediaType) {
      conditions.push(eq(mediaItems.type, mediaType));
    }

    if (sinceDate) {
      conditions.push(gte(mediaItems.createdAt, sinceDate));
    }

    return db.query.mediaItems.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(mediaItems.createdAt)],
      limit,
    });
  }

  /**
   * Generate HTML for newsletter email
   */
  private generateNewsletterHTML(
    mediaType: 'movie' | 'tv' | 'all',
    items: MediaItem[]
  ): string {
    const typeLabel =
      mediaType === 'movie' ? 'Movies' : mediaType === 'tv' ? 'TV Series' : 'Media';

    const itemsList = items
      .map(
        (item) => `
          <div style="margin-bottom: 25px; padding: 20px; background: #f9f9f9; border-radius: 10px; border-left: 4px solid #667eea;">
            <h3 style="margin: 0 0 10px 0; color: #333;">${item.title} ${item.year ? `(${item.year})` : ''}</h3>
            <div style="margin-bottom: 10px;">
              <span style="display: inline-block; padding: 4px 12px; background: ${item.type === 'movie' ? '#667eea' : '#764ba2'}; color: white; border-radius: 20px; font-size: 12px; font-weight: bold;">
                ${item.type === 'movie' ? 'MOVIE' : 'TV SERIES'}
              </span>
              ${item.rating ? `<span style="margin-left: 10px; color: #f5a623;">★ ${item.rating}</span>` : ''}
              ${item.contentRating ? `<span style="margin-left: 10px; color: #666;">${item.contentRating}</span>` : ''}
            </div>
            ${item.tagline ? `<p style="margin: 10px 0; color: #555; font-style: italic;">"${item.tagline}"</p>` : ''}
            ${item.summary ? `<p style="margin: 10px 0 0 0; color: #333; line-height: 1.5;">${item.summary.substring(0, 250)}${item.summary.length > 250 ? '...' : ''}</p>` : ''}
            ${item.genres && item.genres.length > 0 ? `<p style="margin: 10px 0 0 0; color: #666; font-size: 14px;"><strong>Genres:</strong> ${item.genres.join(', ')}</p>` : ''}
          </div>
        `
      )
      .join('');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>New ${typeLabel} Added</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 650px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px; border-radius: 12px; margin-bottom: 30px; text-align: center;">
            <h1 style="margin: 0 0 10px 0; font-size: 32px;">New ${typeLabel} Added!</h1>
            <p style="margin: 0; font-size: 18px; opacity: 0.9;">${items.length} new ${items.length === 1 ? 'item' : 'items'} in your Plex library</p>
          </div>

          <div style="background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            <h2 style="margin: 0 0 20px 0; color: #667eea;">Recently Added</h2>
            ${itemsList}

            <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #e0e0e0; text-align: center;">
              <p style="margin: 0 0 15px 0; color: #666;">
                Want to explore your full library?
              </p>
              <a href="http://localhost:4001" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 12px 25px; border-radius: 8px; font-weight: bold;">
                Browse Your Library
              </a>
            </div>
          </div>

          <div style="margin-top: 30px; text-align: center; color: #666; font-size: 12px;">
            <p style="margin: 5px 0;">
              You're receiving this email because you subscribed to Plex Exporter newsletters.
            </p>
            <p style="margin: 5px 0;">
              <a href="#" style="color: #667eea; text-decoration: none;">Unsubscribe</a> |
              <a href="#" style="color: #667eea; text-decoration: none;">Manage Preferences</a>
            </p>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Send newsletter to all active subscribers
   */
  async sendNewsletter(options: NewsletterOptions = {}): Promise<{
    sent: number;
    failed: number;
    mediaItems: number;
  }> {
    if (!this.mailSender) {
      throw new Error('Mail sender not configured. Email functionality is disabled.');
    }

    const { mediaType, limit = 10, sinceDate } = options;

    // Get recent media items
    const recentMedia = await this.getRecentlyAddedMedia({ mediaType, limit, sinceDate });

    if (recentMedia.length === 0) {
      logger.info('No new media items to send in newsletter');
      return { sent: 0, failed: 0, mediaItems: 0 };
    }

    // Get active subscribers
    const subscribers = await this.getActiveSubscriptions(mediaType);

    if (subscribers.length === 0) {
      logger.info('No active subscribers for newsletter');
      return { sent: 0, failed: 0, mediaItems: recentMedia.length };
    }

    // Generate email HTML
    const html = this.generateNewsletterHTML(
      mediaType || 'all',
      recentMedia
    );

    const typeLabel =
      mediaType === 'movie' ? 'Movies' : mediaType === 'tv' ? 'TV Series' : 'Media';

    // Send to all subscribers
    let sent = 0;
    let failed = 0;

    for (const subscriber of subscribers) {
      try {
        await this.mailSender.sendMail({
          to: subscriber.email,
          subject: `New ${typeLabel} Added to Your Plex Library (${recentMedia.length} items)`,
          html,
        });
        sent++;
      } catch (error) {
        logger.error('Failed to send newsletter to subscriber', {
          email: subscriber.email,
          error,
        });
        failed++;
      }
    }

    // Store digest record
    await db.insert(newsletterDigests).values({
      mediaType: mediaType || 'movie',
      mediaItemIds: recentMedia.map((item) => item.id),
      recipientCount: sent,
    });

    logger.info('Newsletter sent', {
      sent,
      failed,
      mediaItems: recentMedia.length,
      mediaType,
    });

    return { sent, failed, mediaItems: recentMedia.length };
  }

  /**
   * Get newsletter statistics
   */
  async getStatistics() {
    const allSubscriptions = await db.query.newsletterSubscriptions.findMany();
    const allDigests = await db.query.newsletterDigests.findMany();

    const activeSubscriptions = allSubscriptions.filter((s) => s.active).length;
    const inactiveSubscriptions = allSubscriptions.filter((s) => !s.active).length;

    const totalDigestsSent = allDigests.length;
    const totalRecipients = allDigests.reduce((sum: number, d) => sum + d.recipientCount, 0);

    return {
      subscriptions: {
        total: allSubscriptions.length,
        active: activeSubscriptions,
        inactive: inactiveSubscriptions,
      },
      digests: {
        total: totalDigestsSent,
        totalRecipients,
        averageRecipients:
          totalDigestsSent > 0 ? (totalRecipients / totalDigestsSent).toFixed(2) : '0',
      },
    };
  }

  /**
   * Get recent newsletter digests
   */
  async getRecentDigests(limit = 20) {
    return db.query.newsletterDigests.findMany({
      orderBy: [desc(newsletterDigests.sentAt)],
      limit,
    });
  }
}

export const newsletterService = new NewsletterService();
