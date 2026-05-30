import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import NewsletterCampaignRepository from '../../src/repositories/newsletterCampaignRepository.js';
import { createTestDatabase, type TestDatabaseHandle } from '../helpers/testDatabase.js';

describe('NewsletterCampaignRepository', () => {
  let dbHandle: TestDatabaseHandle;
  let repository: NewsletterCampaignRepository;

  beforeEach(() => {
    dbHandle = createTestDatabase();
    repository = new NewsletterCampaignRepository(dbHandle.drizzle);
  });

  afterEach(() => {
    dbHandle.cleanup();
  });

  it('creates, lists and reads campaign details', () => {
    const campaign = repository.create({
      subject: 'New in Plex',
      body: 'Neue Titel sind da.',
      mediaType: 'movie',
      mediaItemIds: [1, 2],
    });

    expect(campaign.status).toBe('draft');
    expect(campaign.mediaItemIds).toEqual([1, 2]);
    expect(repository.list({ status: 'draft' })).toHaveLength(1);
    expect(repository.count({ status: 'draft' })).toBe(1);
    expect(repository.getDetail(campaign.id)?.recipients).toEqual([]);
  });

  it('only updates and deletes draft campaigns', () => {
    const campaign = repository.create({ subject: 'Before', body: 'Before' });

    expect(repository.updateDraft(campaign.id, { subject: 'After' })?.subject).toBe('After');
    repository.markSending(campaign.id, 0);

    expect(repository.updateDraft(campaign.id, { subject: 'Blocked' })).toBeNull();
    expect(repository.deleteDraft(campaign.id)).toBe(false);
    expect(repository.getById(campaign.id)?.subject).toBe('After');
  });

  it('stores recipient delivery status and campaign counters', () => {
    const campaign = repository.create({ subject: 'Send', body: 'Send body' });
    const [recipient] = repository.replaceRecipients(campaign.id, [
      { email: 'user@example.test' },
    ]);

    repository.markSending(campaign.id, 1);
    const sentRecipient = repository.updateRecipientStatus(recipient.id, {
      status: 'sent',
      emailId: 'email-1',
    });
    const completed = repository.complete(campaign.id, { sentCount: 1, failedCount: 0 });

    expect(sentRecipient?.status).toBe('sent');
    expect(sentRecipient?.emailId).toBe('email-1');
    expect(sentRecipient?.sentAt).toBeTruthy();
    expect(completed?.status).toBe('sent');
    expect(completed?.sentCount).toBe(1);
  });
});
