import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { createWatchlistRouter } from '../../src/routes/watchlist.js';
import SettingsRepository from '../../src/repositories/settingsRepository.js';
import WatchlistRequestRepository from '../../src/repositories/watchlistRequestRepository.js';
import { watchlistEmailService } from '../../src/services/watchlistEmailService.js';
import { createTestDatabase, type TestDatabaseHandle } from '../helpers/testDatabase.js';

const createApp = (dbHandle: TestDatabaseHandle) => {
  const app = express();
  const settingsRepository = new SettingsRepository(dbHandle.drizzle);
  const watchlistRequestRepository = new WatchlistRequestRepository(dbHandle.drizzle);

  app.use(express.json());
  app.use('/api/watchlist', createWatchlistRouter({
    settingsRepository,
    watchlistRequestRepository,
  }));

  return { app, watchlistRequestRepository };
};

describe('watchlist public routes', () => {
  let dbHandle: TestDatabaseHandle | null = null;

  afterEach(() => {
    watchlistEmailService.setMailSender(null);
    dbHandle?.cleanup();
    dbHandle = null;
  });

  it('persists a watchlist request even when email delivery is unavailable', async () => {
    dbHandle = createTestDatabase();
    const { app, watchlistRequestRepository } = createApp(dbHandle);

    const response = await request(app)
      .post('/api/watchlist/send-email')
      .send({
        email: 'user@example.test',
        message: 'Bitte vormerken',
        items: [
          {
            title: 'Example Movie',
            type: 'movie',
            year: 2026,
            summary: 'A test movie',
            poster: null,
          },
        ],
      });

    expect(response.status).toBe(202);
    expect(response.body).toEqual(expect.objectContaining({
      success: true,
      emailSent: false,
      requestId: expect.any(String),
    }));

    const stored = watchlistRequestRepository.getById(response.body.requestId);
    expect(stored).toEqual(expect.objectContaining({
      requesterEmail: 'user@example.test',
      status: 'new',
      message: 'Bitte vormerken',
    }));
    expect(stored?.items).toHaveLength(1);
  });
});
