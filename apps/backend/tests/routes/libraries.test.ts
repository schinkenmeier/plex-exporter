import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createLibrariesRouter } from '../../src/routes/libraries.js';
import type { TautulliClient, TautulliLibrarySummary } from '../../src/services/tautulliService.js';

describe('libraries routes', () => {
  const createApp = (tautulliService: TautulliClient | null) => {
    const app = express();
    app.use('/libraries', createLibrariesRouter({ tautulliService }));
    return app;
  };

  it('responds with 503 when Tautulli is not configured', async () => {
    const app = createApp(null);

    const response = await request(app).get('/libraries');

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('Tautulli service is not configured.');
  });

  it('returns libraries from the Tautulli service', async () => {
    const libraries: TautulliLibrarySummary[] = [
      { section_id: 1, section_name: 'Movies', friendly_name: 'Movies' },
    ];
    const getLibraries = vi.fn(async () => libraries);

    const app = createApp({ getLibraries });

    const response = await request(app).get('/libraries');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ libraries });
    expect(getLibraries).toHaveBeenCalledTimes(1);
  });

  it('handles errors from the Tautulli service', async () => {
    const getLibraries = vi.fn(async () => {
      throw new Error('Tautulli unavailable');
    });

    const app = createApp({ getLibraries });

    const response = await request(app).get('/libraries');

    expect(response.status).toBe(502);
    expect(response.body.error).toBe('Tautulli unavailable');
    expect(getLibraries).toHaveBeenCalledTimes(1);
  });
});
