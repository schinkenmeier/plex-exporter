import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createNotificationsRouter } from '../../src/routes/notifications.js';
import type { MailResult, MailSender } from '../../src/services/smtpService.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

describe('notifications routes', () => {
  const createApp = (smtpService: MailSender | null) => {
    const app = express();
    app.use(express.json());
    app.use('/notifications', createNotificationsRouter({ smtpService }));
    app.use(errorHandler);
    return app;
  };

  it('responds with 503 when SMTP is not configured', async () => {
    const app = createApp(null);

    const response = await request(app).post('/notifications/test').send({});

    expect(response.status).toBe(503);
    expect(response.body.error.message).toBe('SMTP service is not configured.');
  });

  it('sends a notification using the SMTP service', async () => {
    const result: MailResult = { messageId: '123', accepted: ['user@example.com'], rejected: [] };
    const sendMail = vi.fn(async () => result);

    const app = createApp({ sendMail });

    const response = await request(app)
      .post('/notifications/test')
      .send({ to: 'user@example.com', subject: 'Hello', message: 'Test' });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      status: 'queued',
      messageId: '123',
      accepted: ['user@example.com'],
      rejected: [],
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('returns an error response when sending fails', async () => {
    const sendMail = vi.fn(async () => {
      throw new Error('SMTP failure');
    });

    const app = createApp({ sendMail });

    const response = await request(app)
      .post('/notifications/test')
      .send({ to: 'user@example.com', subject: 'Hello', message: 'Test' });

    expect(response.status).toBe(502);
    expect(response.body.error.message).toBe('SMTP failure');
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
});
