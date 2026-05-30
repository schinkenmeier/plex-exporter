import { and, desc, eq, gte, inArray, isNull, or } from 'drizzle-orm';
import { db } from '../db/globalDb.js';
import {
  mediaItems,
  newsletterDigests,
  newsletterSubscriptions,
  type MediaItem,
  type NewsletterSubscription,
} from '../db/schema.js';
import NewsletterCampaignRepository, {
  type NewsletterCampaignDetail,
  type NewsletterCampaignRecord,
} from '../repositories/newsletterCampaignRepository.js';
import type { MailSender } from './resendService.js';
import logger from './logger.js';

export interface NewsletterOptions {
  mediaType?: 'movie' | 'tv';
  limit?: number;
  sinceDate?: string;
}

export interface NewsletterCampaignInput {
  subject: string;
  body: string;
  mediaType?: 'movie' | 'tv' | null;
  mediaItemIds?: number[];
}

export interface NewsletterSendResult {
  sent: number;
  failed: number;
  mediaItems: number;
  recipients: number;
}

class NewsletterService {
  private mailSender: MailSender | null = null;

  setMailSender(sender: MailSender | null): void {
    this.mailSender = sender;
  }

  async subscribe(email: string, mediaType?: 'movie' | 'tv'): Promise<NewsletterSubscription> {
    const existing = await db.query.newsletterSubscriptions.findFirst({
      where: eq(newsletterSubscriptions.email, email),
    });

    if (existing) {
      const [updated] = await db
        .update(newsletterSubscriptions)
        .set({ mediaType, active: true, updatedAt: new Date().toISOString() })
        .where(eq(newsletterSubscriptions.email, email))
        .returning();
      logger.info('Newsletter subscription updated', { email, mediaType });
      return updated;
    }

    const [subscription] = await db
      .insert(newsletterSubscriptions)
      .values({ email, mediaType })
      .returning();
    logger.info('Newsletter subscription created', { email, mediaType });
    return subscription;
  }

  async unsubscribe(email: string): Promise<void> {
    const result = await db
      .update(newsletterSubscriptions)
      .set({ active: false, updatedAt: new Date().toISOString() })
      .where(eq(newsletterSubscriptions.email, email))
      .returning();
    if (result.length === 0) throw new Error('Subscription not found');
    logger.info('Newsletter subscription deactivated', { email });
  }

  async getActiveSubscriptions(mediaType?: 'movie' | 'tv'): Promise<NewsletterSubscription[]> {
    const conditions = [eq(newsletterSubscriptions.active, true)];
    if (mediaType) {
      conditions.push(
        or(eq(newsletterSubscriptions.mediaType, mediaType), isNull(newsletterSubscriptions.mediaType))!,
      );
    }

    return db.query.newsletterSubscriptions.findMany({
      where: and(...conditions),
      orderBy: [desc(newsletterSubscriptions.createdAt)],
    });
  }

  async getRecentlyAddedMedia(options: NewsletterOptions = {}): Promise<MediaItem[]> {
    const { mediaType, limit = 10, sinceDate } = options;
    const conditions = [];
    if (mediaType) conditions.push(eq(mediaItems.type, mediaType));
    if (sinceDate) conditions.push(gte(mediaItems.createdAt, sinceDate));

    return db.query.mediaItems.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(mediaItems.createdAt)],
      limit,
    });
  }

  private campaignRepository(): NewsletterCampaignRepository {
    return new NewsletterCampaignRepository(db);
  }

  listCampaigns(options: { status?: 'draft' | 'sending' | 'sent' | 'failed'; limit?: number; offset?: number } = {}) {
    const repository = this.campaignRepository();
    const campaigns = repository.list(options);
    const total = repository.count({ status: options.status });
    return {
      campaigns,
      pagination: {
        total,
        limit: options.limit ?? 50,
        offset: options.offset ?? 0,
        hasMore: (options.offset ?? 0) + campaigns.length < total,
      },
    };
  }

  getCampaign(id: string): NewsletterCampaignDetail | null {
    return this.campaignRepository().getDetail(id);
  }

  getCampaignRecord(id: string): NewsletterCampaignRecord | null {
    return this.campaignRepository().getById(id);
  }

  createCampaign(input: NewsletterCampaignInput): NewsletterCampaignRecord {
    return this.campaignRepository().create({
      subject: input.subject,
      body: input.body,
      mediaType: input.mediaType ?? null,
      mediaItemIds: input.mediaItemIds ?? [],
    });
  }

  updateCampaign(id: string, input: Partial<NewsletterCampaignInput>): NewsletterCampaignRecord | null {
    return this.campaignRepository().updateDraft(id, input);
  }

  deleteCampaign(id: string): boolean {
    return this.campaignRepository().deleteDraft(id);
  }

  private async getMediaItemsByIds(ids: number[]): Promise<MediaItem[]> {
    if (ids.length === 0) return [];
    return db.query.mediaItems.findMany({
      where: inArray(mediaItems.id, ids),
      orderBy: [desc(mediaItems.createdAt)],
    });
  }

  private async resolveCampaignMedia(campaign: Pick<NewsletterCampaignRecord, 'mediaType' | 'mediaItemIds'>): Promise<MediaItem[]> {
    if (campaign.mediaItemIds.length > 0) {
      const selected = await this.getMediaItemsByIds(campaign.mediaItemIds);
      return campaign.mediaType ? selected.filter(item => item.type === campaign.mediaType) : selected;
    }
    return this.getRecentlyAddedMedia({ mediaType: campaign.mediaType ?? undefined, limit: 10 });
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  private generateNewsletterHTML(mediaType: 'movie' | 'tv' | 'all', items: MediaItem[], body?: string): string {
    const typeLabel = mediaType === 'movie' ? 'Movies' : mediaType === 'tv' ? 'TV Series' : 'Media';
    const customBody = body?.trim()
      ? `<div class="intro">${this.escapeHtml(body).replaceAll('\n', '<br>')}</div>`
      : '';
    const itemsHtml = items
      .map(item => {
        const title = this.escapeHtml(item.title);
        const year = item.year ? ` (${item.year})` : '';
        const rating = item.rating ? `<span class="meta">Rating: ${item.rating}</span>` : '';
        const contentRating = item.contentRating
          ? `<span class="meta">${this.escapeHtml(item.contentRating)}</span>`
          : '';
        const genres = item.genres?.length
          ? `<div class="genres">${item.genres.map(genre => `<span>${this.escapeHtml(genre)}</span>`).join('')}</div>`
          : '';
        const summary = item.summary
          ? `<p>${this.escapeHtml(item.summary.slice(0, 220))}${item.summary.length > 220 ? '...' : ''}</p>`
          : '';
        const tagline = item.tagline ? `<p class="tagline">${this.escapeHtml(item.tagline)}</p>` : '';

        return `
          <div class="media-item">
            <h2>${title}${year}</h2>
            <div class="metadata">
              <span class="meta">${item.type === 'movie' ? 'Movie' : 'TV Series'}</span>
              ${rating}
              ${contentRating}
            </div>
            ${tagline}
            ${summary}
            ${genres}
          </div>
        `;
      })
      .join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New ${typeLabel} Added</title>
        <style>
          body { margin: 0; padding: 0; background-color: #f4f7fb; color: #1f2937; font-family: Arial, Helvetica, sans-serif; }
          .container { max-width: 680px; margin: 0 auto; background-color: #ffffff; }
          .header { background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%); color: #ffffff; padding: 32px 28px; text-align: center; }
          .header h1 { margin: 0; font-size: 28px; line-height: 1.25; }
          .header p { margin: 10px 0 0; opacity: 0.92; }
          .content { padding: 28px; }
          .intro { margin: 0 0 24px; padding: 16px 18px; background-color: #eff6ff; border-left: 4px solid #2563eb; border-radius: 6px; line-height: 1.55; }
          .media-item { border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 18px; background-color: #ffffff; }
          .media-item h2 { margin: 0 0 10px; color: #111827; font-size: 21px; line-height: 1.3; }
          .metadata { margin-bottom: 12px; }
          .meta { display: inline-block; margin: 0 8px 8px 0; padding: 4px 8px; border-radius: 4px; background-color: #eef2ff; color: #3730a3; font-size: 12px; font-weight: 700; }
          .tagline { margin: 0 0 10px; color: #4b5563; font-style: italic; }
          .media-item p { color: #374151; line-height: 1.55; margin: 0 0 12px; }
          .genres span { display: inline-block; margin: 0 6px 6px 0; padding: 4px 8px; border-radius: 999px; background-color: #f3f4f6; color: #4b5563; font-size: 12px; }
          .footer { padding: 24px 28px; text-align: center; color: #6b7280; font-size: 13px; background-color: #f9fafb; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>New ${typeLabel} Added!</h1>
            <p>Recently Added to Your Plex Library</p>
          </div>
          <div class="content">
            ${customBody}
            ${itemsHtml}
          </div>
          <div class="footer">
            You are receiving this email because you subscribed to Plex library updates.
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private ensureMailSender(): MailSender {
    if (!this.mailSender) throw new Error('Mail sender not configured. Email functionality is disabled.');
    return this.mailSender;
  }

  async sendNewsletter(options: NewsletterOptions = {}): Promise<NewsletterSendResult> {
    const mailSender = this.ensureMailSender();
    const { mediaType, limit = 10, sinceDate } = options;
    const recentMedia = await this.getRecentlyAddedMedia({ mediaType, limit, sinceDate });
    if (recentMedia.length === 0) return { sent: 0, failed: 0, mediaItems: 0, recipients: 0 };

    const subscribers = await this.getActiveSubscriptions(mediaType);
    if (subscribers.length === 0) return { sent: 0, failed: 0, mediaItems: recentMedia.length, recipients: 0 };

    const typeLabel = mediaType === 'movie' ? 'Movies' : mediaType === 'tv' ? 'TV Series' : 'Media';
    const html = this.generateNewsletterHTML(mediaType || 'all', recentMedia);
    let sent = 0;
    let failed = 0;
    for (const subscriber of subscribers) {
      try {
        await mailSender.sendMail({
          to: subscriber.email,
          subject: `New ${typeLabel} Added to Your Plex Library (${recentMedia.length} items)`,
          html,
        });
        sent++;
      } catch (error) {
        logger.error('Failed to send newsletter to subscriber', { email: subscriber.email, error });
        failed++;
      }
    }

    await db.insert(newsletterDigests).values({
      mediaType: mediaType || 'movie',
      mediaItemIds: recentMedia.map(item => item.id),
      recipientCount: sent,
    });
    return { sent, failed, mediaItems: recentMedia.length, recipients: subscribers.length };
  }

  async sendCampaignTest(id: string, recipients: string[]): Promise<NewsletterSendResult> {
    const mailSender = this.ensureMailSender();
    const campaign = this.campaignRepository().getById(id);
    if (!campaign) throw new Error('Campaign not found');

    const media = await this.resolveCampaignMedia(campaign);
    const html = this.generateNewsletterHTML(campaign.mediaType || 'all', media, campaign.body);
    let sent = 0;
    let failed = 0;
    for (const recipient of recipients) {
      try {
        await mailSender.sendMail({ to: recipient, subject: `[Test] ${campaign.subject}`, html, text: campaign.body });
        sent++;
      } catch (error) {
        logger.error('Failed to send newsletter campaign test', { campaignId: id, recipient, error });
        failed++;
      }
    }
    return { sent, failed, mediaItems: media.length, recipients: recipients.length };
  }

  async sendCampaign(id: string): Promise<NewsletterSendResult> {
    const mailSender = this.ensureMailSender();
    const repository = this.campaignRepository();
    const campaign = repository.getById(id);
    if (!campaign) throw new Error('Campaign not found');
    if (campaign.status !== 'draft') throw new Error('Campaign is not a draft');

    const media = await this.resolveCampaignMedia(campaign);
    const subscribers = await this.getActiveSubscriptions(campaign.mediaType ?? undefined);
    repository.replaceRecipients(id, subscribers.map(subscriber => ({
      subscriptionId: subscriber.id,
      email: subscriber.email,
    })));
    const recipients = repository.listRecipients(id);
    repository.markSending(id, recipients.length);

    const html = this.generateNewsletterHTML(campaign.mediaType || 'all', media, campaign.body);
    let sent = 0;
    let failed = 0;
    let lastErrorMessage: string | null = null;
    for (const recipient of recipients) {
      try {
        const result = await mailSender.sendMail({ to: recipient.email, subject: campaign.subject, html, text: campaign.body });
        repository.updateRecipientStatus(recipient.id, { status: 'sent', emailId: result.id });
        sent++;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        repository.updateRecipientStatus(recipient.id, { status: 'failed', errorMessage: message });
        lastErrorMessage = message;
        failed++;
      }
    }

    repository.complete(id, { sentCount: sent, failedCount: failed, lastErrorMessage });
    await db.insert(newsletterDigests).values({
      mediaType: campaign.mediaType || 'movie',
      mediaItemIds: media.map(item => item.id),
      recipientCount: sent,
    });
    return { sent, failed, mediaItems: media.length, recipients: recipients.length };
  }

  async getStatistics() {
    const allSubscriptions = await db.query.newsletterSubscriptions.findMany();
    const allDigests = await db.query.newsletterDigests.findMany();
    const activeSubscriptions = allSubscriptions.filter(s => s.active).length;
    const inactiveSubscriptions = allSubscriptions.filter(s => !s.active).length;
    const totalDigestsSent = allDigests.length;
    const totalRecipients = allDigests.reduce((sum, digest) => sum + digest.recipientCount, 0);
    return {
      subscriptions: { total: allSubscriptions.length, active: activeSubscriptions, inactive: inactiveSubscriptions },
      digests: {
        total: totalDigestsSent,
        totalRecipients,
        averageRecipients: totalDigestsSent > 0 ? (totalRecipients / totalDigestsSent).toFixed(2) : '0',
      },
    };
  }

  async getRecentDigests(limit = 20) {
    return db.query.newsletterDigests.findMany({
      orderBy: [desc(newsletterDigests.sentAt)],
      limit,
    });
  }
}

export const newsletterService = new NewsletterService();
