import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeDrizzleDatabase, type SqliteDatabase } from '../db/index.js';
import { setGlobalDb } from '../db/globalDb.js';
import MediaRepository from '../repositories/mediaRepository.js';
import { newsletterService } from './newsletterService.js';
import type { MailSender } from './resendService.js';

describe('NewsletterService', () => {
  let sqliteDb: SqliteDatabase;
  let mediaRepository: MediaRepository;
  let sendMail: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const dbBundle = initializeDrizzleDatabase({ filePath: ':memory:' });
    sqliteDb = dbBundle.sqlite;
    setGlobalDb(dbBundle.db);
    mediaRepository = new MediaRepository(dbBundle.db);
    sendMail = vi.fn().mockResolvedValue({ id: 'email-1' });
    newsletterService.setMailSender({ sendMail } as unknown as MailSender);
  });

  afterEach(() => {
    newsletterService.setMailSender(null);
    sqliteDb.close();
  });

  it('includes all-media subscribers when sending a movie newsletter', async () => {
    mediaRepository.create({
      plexId: 'movie-1',
      title: 'Movie One',
      mediaType: 'movie',
    });

    await newsletterService.subscribe('all@example.com');
    await newsletterService.subscribe('movie@example.com', 'movie');
    await newsletterService.subscribe('tv@example.com', 'tv');

    const result = await newsletterService.sendNewsletter({ mediaType: 'movie' });

    expect(result).toMatchObject({ sent: 2, failed: 0, recipients: 2, mediaItems: 1 });
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(sendMail.mock.calls.map(([payload]) => payload.to).sort()).toEqual([
      'all@example.com',
      'movie@example.com',
    ]);
    expect(sendMail.mock.calls[0][0].html).toContain('background: linear-gradient');
    expect(sendMail.mock.calls[0][0].html).toContain('Recently Added to Your Plex Library');
  });

  it('sends campaign tests without changing campaign status', async () => {
    mediaRepository.create({
      plexId: 'tv-1',
      title: 'Series One',
      mediaType: 'tv',
    });

    const campaign = await newsletterService.createCampaign({
      subject: 'Weekly TV',
      body: 'Weekly TV body',
      mediaType: 'tv',
    });

    const result = await newsletterService.sendCampaignTest(campaign.id, ['admin@example.com']);
    const stored = await newsletterService.getCampaign(campaign.id);

    expect(result).toMatchObject({ sent: 1, failed: 0, recipients: 1, mediaItems: 1 });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'admin@example.com',
      subject: '[Test] Weekly TV',
    }));
    expect(stored?.status).toBe('draft');
  });

  it('marks a campaign sent and prevents a second send', async () => {
    mediaRepository.create({
      plexId: 'movie-2',
      title: 'Movie Two',
      mediaType: 'movie',
    });
    await newsletterService.subscribe('all@example.com');

    const campaign = await newsletterService.createCampaign({
      subject: 'Movie Campaign',
      body: 'Movie body',
      mediaType: 'movie',
    });

    const result = await newsletterService.sendCampaign(campaign.id);
    const stored = await newsletterService.getCampaign(campaign.id);

    expect(result).toMatchObject({ sent: 1, failed: 0, recipients: 1, mediaItems: 1 });
    expect(stored?.status).toBe('sent');
    await expect(newsletterService.sendCampaign(campaign.id)).rejects.toThrow(
      'Campaign is not a draft',
    );
  });
});
