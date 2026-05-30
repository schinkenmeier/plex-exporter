import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createBasicAuthMiddleware } from '../../src/middleware/basicAuth.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { adminNewsletterRouter, publicNewsletterRouter } from '../../src/routes/newsletter.js';
import welcomeEmailRouter from '../../src/routes/welcomeEmail.js';
import { newsletterService } from '../../src/services/newsletterService.js';
import { welcomeEmailService } from '../../src/services/welcomeEmailService.js';

vi.mock('../../src/services/newsletterService.js', () => ({
  newsletterService: {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    getActiveSubscriptions: vi.fn(),
    sendNewsletter: vi.fn(),
    getStatistics: vi.fn(),
    getRecentlyAddedMedia: vi.fn(),
    getRecentDigests: vi.fn(),
    listCampaigns: vi.fn(),
    getCampaign: vi.fn(),
    getCampaignRecord: vi.fn(),
    createCampaign: vi.fn(),
    updateCampaign: vi.fn(),
    deleteCampaign: vi.fn(),
    sendCampaignTest: vi.fn(),
    sendCampaign: vi.fn(),
  },
}));

vi.mock('../../src/services/welcomeEmailService.js', () => ({
  welcomeEmailService: {
    hasReceivedWelcomeEmail: vi.fn(),
    sendWelcomeEmail: vi.fn(),
    getAllWelcomeEmails: vi.fn(),
    deleteWelcomeEmailById: vi.fn(),
    deleteWelcomeEmailsByEmail: vi.fn(),
    clearWelcomeEmails: vi.fn(),
    getStatistics: vi.fn(),
  },
}));

const authHeader = `Basic ${Buffer.from('admin:secret').toString('base64')}`;

const createApp = () => {
  const app = express();
  const basicAuth = createBasicAuthMiddleware({ username: 'admin', password: 'secret' });

  app.use(express.json());
  app.use('/api/newsletter', publicNewsletterRouter);
  app.use('/admin/api/newsletter', basicAuth, adminNewsletterRouter);
  app.use('/admin/api/welcome-email', basicAuth, welcomeEmailRouter);
  app.use(errorHandler);

  return app;
};

const createBearerOnlyApp = () => {
  const app = express();
  const auth = createBasicAuthMiddleware({
    username: null,
    password: null,
    bearerToken: 'admin-token',
  });

  app.use('/admin/protected', auth, (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);

  return app;
};

const sendRequest = (app: express.Express, method: string, path: string) => {
  switch (method) {
    case 'GET':
      return request(app).get(path);
    case 'POST':
      return request(app).post(path);
    case 'DELETE':
      return request(app).delete(path);
    default:
      throw new Error(`Unsupported method: ${method}`);
  }
};

describe('email route security boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps public newsletter subscribe and unsubscribe flows reachable without Basic Auth', async () => {
    vi.mocked(newsletterService.subscribe).mockResolvedValue({
      id: 'sub-1',
      email: 'user@example.test',
      mediaType: 'movie',
      active: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });
    vi.mocked(newsletterService.unsubscribe).mockResolvedValue(undefined);

    const app = createApp();

    const subscribeResponse = await request(app)
      .post('/api/newsletter/subscribe')
      .send({ email: 'user@example.test', mediaType: 'movie' });

    expect(subscribeResponse.status).toBe(200);
    expect(newsletterService.subscribe).toHaveBeenCalledWith('user@example.test', 'movie');

    const unsubscribeResponse = await request(app)
      .post('/api/newsletter/unsubscribe')
      .send({ email: 'user@example.test' });

    expect(unsubscribeResponse.status).toBe(200);
    expect(newsletterService.unsubscribe).toHaveBeenCalledWith('user@example.test');
  });

  it('accepts public newsletter subscribe for all media types without storing null', async () => {
    vi.mocked(newsletterService.subscribe).mockResolvedValue({
      id: 'sub-1',
      email: 'user@example.test',
      mediaType: null,
      active: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });

    const response = await request(createApp())
      .post('/api/newsletter/subscribe')
      .send({ email: 'user@example.test', mediaType: null });

    expect(response.status).toBe(200);
    expect(newsletterService.subscribe).toHaveBeenCalledWith('user@example.test', undefined);
  });

  it.each([
    ['POST', '/api/newsletter/send'],
    ['GET', '/api/newsletter/subscriptions'],
    ['GET', '/api/newsletter/stats'],
    ['GET', '/api/newsletter/recent-media'],
    ['GET', '/api/newsletter/digests'],
    ['GET', '/api/newsletter/campaigns'],
    ['POST', '/api/newsletter/campaigns'],
    ['POST', '/api/newsletter/campaigns/campaign-1/send'],
  ])('does not expose newsletter admin operation on public path %s %s', async (method, path) => {
    const response = await sendRequest(createApp(), method, path);

    expect(response.status).toBe(404);
    expect(newsletterService.sendNewsletter).not.toHaveBeenCalled();
    expect(newsletterService.getActiveSubscriptions).not.toHaveBeenCalled();
    expect(newsletterService.getStatistics).not.toHaveBeenCalled();
    expect(newsletterService.getRecentlyAddedMedia).not.toHaveBeenCalled();
    expect(newsletterService.getRecentDigests).not.toHaveBeenCalled();
    expect(newsletterService.listCampaigns).not.toHaveBeenCalled();
    expect(newsletterService.createCampaign).not.toHaveBeenCalled();
    expect(newsletterService.sendCampaign).not.toHaveBeenCalled();
  });

  it.each([
    ['GET', '/admin/api/newsletter/subscriptions'],
    ['POST', '/admin/api/newsletter/send'],
    ['GET', '/admin/api/newsletter/stats'],
    ['GET', '/admin/api/newsletter/recent-media'],
    ['GET', '/admin/api/newsletter/digests'],
    ['GET', '/admin/api/newsletter/campaigns'],
    ['POST', '/admin/api/newsletter/campaigns'],
    ['POST', '/admin/api/newsletter/campaigns/campaign-1/send'],
  ])('requires Basic Auth for %s %s', async (method, path) => {
    const response = await sendRequest(createApp(), method, path);

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toContain('Basic');
  });

  it('serves newsletter admin endpoints with valid Basic Auth', async () => {
    vi.mocked(newsletterService.getStatistics).mockResolvedValue({
      subscriptions: { total: 1, active: 1, inactive: 0 },
      digests: { total: 0, totalRecipients: 0, averageRecipients: '0' },
    });

    const response = await request(createApp())
      .get('/admin/api/newsletter/stats')
      .set('Authorization', authHeader);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        subscriptions: { total: 1, active: 1, inactive: 0 },
        digests: { total: 0, totalRecipients: 0, averageRecipients: '0' },
      },
    });
  });

  it('advertises Bearer auth when only ADMIN_API_TOKEN is configured and auth is missing', async () => {
    const response = await request(createBearerOnlyApp()).get('/admin/protected');

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toContain('Bearer');
    expect(response.body.error.message).toBe('Authentication required');
  });

  it('advertises Bearer auth when only ADMIN_API_TOKEN is configured and bearer auth fails', async () => {
    const response = await request(createBearerOnlyApp())
      .get('/admin/protected')
      .set('Authorization', 'Bearer wrong-token');

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toContain('Bearer');
    expect(response.body.error.message).toBe('Authentication required');
  });

  it('accepts Bearer auth when only ADMIN_API_TOKEN is configured', async () => {
    const response = await request(createBearerOnlyApp())
      .get('/admin/protected')
      .set('Authorization', 'Bearer admin-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it.each([
    ['POST', '/api/welcome-email'],
    ['GET', '/api/welcome-email/check/user%40example.test'],
    ['GET', '/api/welcome-email/history'],
    ['DELETE', '/api/welcome-email/history/00000000-0000-4000-8000-000000000000'],
    ['DELETE', '/api/welcome-email/recipient/user%40example.test'],
    ['DELETE', '/api/welcome-email/history'],
    ['GET', '/api/welcome-email/stats'],
  ])('does not expose welcome email operation on public path %s %s', async (method, path) => {
    const response = await sendRequest(createApp(), method, path);

    expect(response.status).toBe(404);
    expect(welcomeEmailService.sendWelcomeEmail).not.toHaveBeenCalled();
    expect(welcomeEmailService.hasReceivedWelcomeEmail).not.toHaveBeenCalled();
    expect(welcomeEmailService.getAllWelcomeEmails).not.toHaveBeenCalled();
    expect(welcomeEmailService.deleteWelcomeEmailById).not.toHaveBeenCalled();
    expect(welcomeEmailService.deleteWelcomeEmailsByEmail).not.toHaveBeenCalled();
    expect(welcomeEmailService.clearWelcomeEmails).not.toHaveBeenCalled();
    expect(welcomeEmailService.getStatistics).not.toHaveBeenCalled();
  });

  it.each([
    ['POST', '/admin/api/welcome-email'],
    ['GET', '/admin/api/welcome-email/check/user%40example.test'],
    ['GET', '/admin/api/welcome-email/history'],
    ['DELETE', '/admin/api/welcome-email/history/00000000-0000-4000-8000-000000000000'],
    ['DELETE', '/admin/api/welcome-email/recipient/user%40example.test'],
    ['DELETE', '/admin/api/welcome-email/history'],
    ['GET', '/admin/api/welcome-email/stats'],
  ])('requires Basic Auth for %s %s', async (method, path) => {
    const response = await sendRequest(createApp(), method, path);

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toContain('Basic');
  });

  it('serves welcome email admin endpoints with valid Basic Auth', async () => {
    vi.mocked(welcomeEmailService.hasReceivedWelcomeEmail).mockResolvedValue(true);

    const response = await request(createApp())
      .get('/admin/api/welcome-email/check/user%40example.test')
      .set('Authorization', authHeader);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, hasReceived: true });
    expect(welcomeEmailService.hasReceivedWelcomeEmail).toHaveBeenCalledWith('user@example.test');
  });
});
