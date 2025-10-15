import { Router } from 'express';

import type TautulliSnapshotRepository from '../repositories/tautulliSnapshotRepository.js';
import type { TautulliClient } from '../services/tautulliService.js';

export interface LibrariesRouterOptions {
  tautulliService: TautulliClient | null;
  snapshotRepository: TautulliSnapshotRepository | null;
}

export const createLibrariesRouter = ({
  tautulliService,
  snapshotRepository,
}: LibrariesRouterOptions) => {
  const router = Router();

  router.get('/', async (_req, res) => {
    if (!tautulliService) {
      res.status(503).json({ error: 'Tautulli service is not configured.' });
      return;
    }

    if (!snapshotRepository) {
      res.status(500).json({ error: 'Snapshot repository is not configured.' });
      return;
    }

    try {
      const libraries = await tautulliService.getLibraries();

      try {
        snapshotRepository.recordSnapshot({ libraries });
      } catch (snapshotError) {
        // eslint-disable-next-line no-console
        console.error('Failed to persist Tautulli snapshot.', snapshotError);
      }

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
