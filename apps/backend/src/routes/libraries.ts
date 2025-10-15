import { Router } from 'express';

import type { TautulliClient } from '../services/tautulliService.js';

export interface LibrariesRouterOptions {
  tautulliService: TautulliClient | null;
}

export const createLibrariesRouter = ({
  tautulliService,
}: LibrariesRouterOptions) => {
  const router = Router();

  router.get('/', async (_req, res) => {
    if (!tautulliService) {
      res.status(503).json({ error: 'Tautulli service is not configured.' });
      return;
    }

    try {
      const libraries = await tautulliService.getLibraries();
      res.json({ libraries });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to fetch libraries from Tautulli.';
      res.status(502).json({ error: message });
    }
  });

  return router;
};

export default createLibrariesRouter;
