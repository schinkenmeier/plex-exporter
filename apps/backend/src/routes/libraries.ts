import { Router, type NextFunction, type Request, type Response } from 'express';

import type TautulliSnapshotRepository from '../repositories/tautulliSnapshotRepository.js';
import type { TautulliClient } from '../services/tautulliService.js';
import { HttpError } from '../middleware/errorHandler.js';
import logger from '../services/logger.js';

export interface LibrariesRouterOptions {
  tautulliService: TautulliClient | null;
  snapshotRepository: TautulliSnapshotRepository | null;
}

export const createLibrariesRouter = ({
  tautulliService,
  snapshotRepository,
}: LibrariesRouterOptions) => {
  const router = Router();

  router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
    if (!tautulliService) {
      return next(new HttpError(503, 'Tautulli service is not configured.'));
    }

    if (!snapshotRepository) {
      return next(new HttpError(500, 'Snapshot repository is not configured.'));
    }

    try {
      const libraries = await tautulliService.getLibraries();

      try {
        snapshotRepository.recordSnapshot({ libraries });
      } catch (snapshotError) {
        logger.warn('Failed to persist Tautulli snapshot.', {
          error: snapshotError instanceof Error
            ? { name: snapshotError.name, message: snapshotError.message }
            : { value: snapshotError },
        });
      }

      res.json({ libraries });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to fetch libraries from Tautulli.';
      next(new HttpError(502, message));
    }
  });

  return router;
};

export default createLibrariesRouter;
