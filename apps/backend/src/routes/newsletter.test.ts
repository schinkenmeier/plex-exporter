import express, { type Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeDrizzleDatabase, type SqliteDatabase } from '../db/index.js';
import { setGlobalDb } from '../db/globalDb.js';
import { createBasicAuthMiddleware } from '../middleware/basicAuth.js';
import { errorHandler } from '../middleware/errorHandler.js';
import MediaRepository from '../repositories/mediaRepository.js';
import { newsletterService } from '../services/newsletterService.js';
import type { MailSender } from '../services/resendService.js';
import { adminNewsletterRouter } from './newsletter.js';

const authHeader = `Basic ${Buffer.from('admin:secret').toString('base64')}`;

describe('Newsletter admin routes', () => {
  let app: Express;
  let sqliteDb: SqliteDatabase;
  let mediaRepository: MediaRepository;
  let sendMail: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const dbBundle = initializeDrizzleDatabase({ filePath: ':memory:' });
    sqliteDb = dbBundle.sqlite;
    setGlobalDb(dbBundle.db);
    mediaRepository = new MediaRepository(dbBundle.db);
    sendMail = vi.fn().mockResolvedValue({ id: 'email-1' });
    newsletterService.setMailSender({ sendMail } as unknown as MailSender);

    mediaRepository.create({
      plexId: 'movie-1',
      title: 'Route Movie',
      mediaType: 'movie',
    });
    await newsletterService.subscribe('subscriber@example.com');

    app = express();
    app.use(express.json());
    app.use(
      '/admin/api/newsletter',
      createBasicAuthMiddleware({ username: 'admin', password: 'secret' }),
      adminNewsletterRouter,
    );
    app.use(errorHandler);
  });

  afterEach(() => {
    newsletterService.setMailSender(null);
    sqliteDb.close();
  });

  it('requires admin authentication for campaign routes', async () => {
    const response = await request(app).get('/admin/api/newsletter/campaigns');

    expect(response.status).toBe(401);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('creates, tests, and sends a campaign through admin routes', async () => {
    const createResponse = await request(app)
      .post('/admin/api/newsletter/campaigns')
      .set('Authorization', authHeader)
      .send({ subject: 'Route Campaign', body: 'Route campaign body', mediaType: 'movie' });

    expect(createResponse.status).toBe(201);
    const campaignId = createResponse.body.data.id;

    const testResponse = await request(app)
      .post(`/admin/api/newsletter/campaigns/${campaignId}/test`)
      .set('Authorization', authHeader)
      .send({ email: 'admin@example.com' });

    expect(testResponse.status).toBe(200);
    expect(testResponse.body.data).toMatchObject({ sent: 1, recipients: 1 });

    const sendResponse = await request(app)
      .post(`/admin/api/newsletter/campaigns/${campaignId}/send`)
      .set('Authorization', authHeader)
      .send();

    expect(sendResponse.status).toBe(200);
    expect(sendResponse.body.data).toMatchObject({ sent: 1, recipients: 1 });
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it('keeps the legacy newsletter send route working', async () => {
    const response = await request(app)
      .post('/admin/api/newsletter/send')
      .set('Authorization', authHeader)
      .send({ mediaType: 'movie' });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ sent: 1, recipients: 1, mediaItems: 1 });
  });
});
