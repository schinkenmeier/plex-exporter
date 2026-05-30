import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { DrizzleDatabase } from '../db/index.js';
import {
  newsletterCampaignRecipients,
  newsletterCampaignRecipientStatuses,
  newsletterCampaigns,
  newsletterCampaignStatuses,
  type NewsletterCampaign,
  type NewsletterCampaignRecipient,
} from '../db/schema.js';

export type NewsletterCampaignStatus = (typeof newsletterCampaignStatuses)[number];
export type NewsletterCampaignRecipientStatus = (typeof newsletterCampaignRecipientStatuses)[number];

export interface NewsletterCampaignRecipientInput {
  email: string;
  subscriptionId?: string | null;
}

export interface NewsletterCampaignCreateInput {
  subject: string;
  body: string;
  mediaType?: 'movie' | 'tv' | null;
  mediaItemIds?: number[];
}

export interface NewsletterCampaignListOptions {
  status?: NewsletterCampaignStatus;
  limit?: number;
  offset?: number;
}

export interface NewsletterCampaignUpdateInput {
  subject?: string;
  body?: string;
  mediaType?: 'movie' | 'tv' | null;
  mediaItemIds?: number[];
}

export interface NewsletterCampaignRecipientStatusUpdateInput {
  status: NewsletterCampaignRecipientStatus;
  emailId?: string | null;
  errorMessage?: string | null;
}

export type NewsletterCampaignRecord = Omit<NewsletterCampaign, 'status'> & {
  status: NewsletterCampaignStatus;
};

export type NewsletterCampaignRecipientRecord = Omit<NewsletterCampaignRecipient, 'status'> & {
  status: NewsletterCampaignRecipientStatus;
};

export interface NewsletterCampaignDetail extends NewsletterCampaignRecord {
  recipients: NewsletterCampaignRecipientRecord[];
}

export const isNewsletterCampaignStatus = (value: string): value is NewsletterCampaignStatus =>
  newsletterCampaignStatuses.includes(value as NewsletterCampaignStatus);

const mapCampaign = (campaign: NewsletterCampaign): NewsletterCampaignRecord => ({
  ...campaign,
  status: campaign.status as NewsletterCampaignStatus,
});

const mapRecipient = (
  recipient: NewsletterCampaignRecipient,
): NewsletterCampaignRecipientRecord => ({
  ...recipient,
  status: recipient.status as NewsletterCampaignRecipientStatus,
});

const getCount = (row?: { count: number | bigint | string } | null): number =>
  Number(row?.count ?? 0);

export class NewsletterCampaignRepository {
  constructor(private readonly db: DrizzleDatabase) {}

  create(input: NewsletterCampaignCreateInput): NewsletterCampaignRecord {
    const [campaign] = this.db
      .insert(newsletterCampaigns)
      .values({
        id: randomUUID(),
        subject: input.subject,
        body: input.body,
        mediaType: input.mediaType ?? null,
        mediaItemIds: input.mediaItemIds ?? [],
        status: 'draft',
      })
      .returning()
      .all();

    if (!campaign) {
      throw new Error('Failed to create newsletter campaign');
    }

    return mapCampaign(campaign);
  }

  getById(id: string): NewsletterCampaignRecord | null {
    const row = this.db
      .select()
      .from(newsletterCampaigns)
      .where(eq(newsletterCampaigns.id, id))
      .limit(1)
      .get();

    return row ? mapCampaign(row) : null;
  }

  getDetail(id: string): NewsletterCampaignDetail | null {
    const campaign = this.getById(id);
    if (!campaign) {
      return null;
    }

    return {
      ...campaign,
      recipients: this.listRecipients(id),
    };
  }

  list(options: NewsletterCampaignListOptions = {}): NewsletterCampaignRecord[] {
    const limit = options.limit && options.limit > 0 ? options.limit : 50;
    const offset = options.offset && options.offset > 0 ? options.offset : 0;
    const query = this.db.select().from(newsletterCampaigns);
    const filtered = options.status
      ? query.where(eq(newsletterCampaigns.status, options.status))
      : query;

    return filtered
      .orderBy(desc(newsletterCampaigns.createdAt))
      .limit(limit)
      .offset(offset)
      .all()
      .map(mapCampaign);
  }

  count(options: Pick<NewsletterCampaignListOptions, 'status'> = {}): number {
    const query = this.db.select({ count: sql<number>`count(*)` }).from(newsletterCampaigns);
    const result = options.status
      ? query.where(eq(newsletterCampaigns.status, options.status)).get()
      : query.get();
    return getCount(result);
  }

  updateDraft(
    id: string,
    input: NewsletterCampaignUpdateInput,
  ): NewsletterCampaignRecord | null {
    const existing = this.getById(id);
    if (!existing || existing.status !== 'draft') {
      return null;
    }

    const changes: Partial<typeof newsletterCampaigns.$inferInsert> = {};
    if (input.subject !== undefined) changes.subject = input.subject;
    if (input.body !== undefined) changes.body = input.body;
    if (input.mediaType !== undefined) changes.mediaType = input.mediaType;
    if (input.mediaItemIds !== undefined) changes.mediaItemIds = input.mediaItemIds;

    if (Object.keys(changes).length === 0) {
      return existing;
    }

    this.db
      .update(newsletterCampaigns)
      .set({ ...changes, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(newsletterCampaigns.id, id))
      .run();

    return this.getById(id);
  }

  deleteDraft(id: string): boolean {
    const existing = this.getById(id);
    if (!existing || existing.status !== 'draft') {
      return false;
    }

    const result = this.db.delete(newsletterCampaigns).where(eq(newsletterCampaigns.id, id)).run();
    return result.changes > 0;
  }

  listRecipients(campaignId: string): NewsletterCampaignRecipientRecord[] {
    return this.db
      .select()
      .from(newsletterCampaignRecipients)
      .where(eq(newsletterCampaignRecipients.campaignId, campaignId))
      .orderBy(newsletterCampaignRecipients.createdAt)
      .all()
      .map(mapRecipient);
  }

  replaceRecipients(
    campaignId: string,
    recipients: NewsletterCampaignRecipientInput[],
  ): NewsletterCampaignRecipientRecord[] {
    this.db.transaction((tx) => {
      tx.delete(newsletterCampaignRecipients)
        .where(eq(newsletterCampaignRecipients.campaignId, campaignId))
        .run();

      if (recipients.length > 0) {
        tx.insert(newsletterCampaignRecipients)
          .values(
            recipients.map((recipient) => ({
              id: randomUUID(),
              campaignId,
              email: recipient.email,
              subscriptionId: recipient.subscriptionId ?? null,
              status: 'pending' as const,
            })),
          )
          .run();
      }

      tx.update(newsletterCampaigns)
        .set({
          recipientCount: recipients.length,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(newsletterCampaigns.id, campaignId))
        .run();
    });

    return this.listRecipients(campaignId);
  }

  markSending(campaignId: string, recipientCount: number): NewsletterCampaignRecord | null {
    this.db
      .update(newsletterCampaigns)
      .set({
        status: 'sending',
        recipientCount,
        sentCount: 0,
        failedCount: 0,
        lastErrorMessage: null,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(newsletterCampaigns.id, campaignId))
      .run();

    return this.getById(campaignId);
  }

  complete(
    campaignId: string,
    input: { sentCount: number; failedCount: number; lastErrorMessage?: string | null },
  ): NewsletterCampaignRecord | null {
    this.db
      .update(newsletterCampaigns)
      .set({
        status: input.failedCount > 0 && input.sentCount === 0 ? 'failed' : 'sent',
        sentCount: input.sentCount,
        failedCount: input.failedCount,
        lastErrorMessage: input.lastErrorMessage ?? null,
        sentAt: new Date().toISOString(),
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(newsletterCampaigns.id, campaignId))
      .run();

    return this.getById(campaignId);
  }

  updateRecipientStatus(
    recipientId: string,
    input: NewsletterCampaignRecipientStatusUpdateInput,
  ): NewsletterCampaignRecipientRecord | null {
    const existing = this.db
      .select()
      .from(newsletterCampaignRecipients)
      .where(eq(newsletterCampaignRecipients.id, recipientId))
      .limit(1)
      .get();

    if (!existing) {
      return null;
    }

    this.db
      .update(newsletterCampaignRecipients)
      .set({
        status: input.status,
        emailId: input.emailId ?? existing.emailId,
        errorMessage: input.errorMessage ?? existing.errorMessage,
        sentAt: input.status === 'sent' ? new Date().toISOString() : existing.sentAt,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(newsletterCampaignRecipients.id, recipientId))
      .run();

    this.refreshDeliveryCounts(existing.campaignId);

    const updated = this.db
      .select()
      .from(newsletterCampaignRecipients)
      .where(eq(newsletterCampaignRecipients.id, recipientId))
      .limit(1)
      .get();

    return updated ? mapRecipient(updated) : null;
  }

  private refreshDeliveryCounts(campaignId: string): void {
    const sent = getCount(
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(newsletterCampaignRecipients)
        .where(
          and(
            eq(newsletterCampaignRecipients.campaignId, campaignId),
            eq(newsletterCampaignRecipients.status, 'sent'),
          ),
        )
        .get(),
    );

    const failed = getCount(
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(newsletterCampaignRecipients)
        .where(
          and(
            eq(newsletterCampaignRecipients.campaignId, campaignId),
            eq(newsletterCampaignRecipients.status, 'failed'),
          ),
        )
        .get(),
    );

    this.db
      .update(newsletterCampaigns)
      .set({ sentCount: sent, failedCount: failed, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(newsletterCampaigns.id, campaignId))
      .run();
  }
}

export default NewsletterCampaignRepository;
