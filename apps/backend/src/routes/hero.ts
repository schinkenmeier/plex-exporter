import { Router, type Request, type Response, type NextFunction } from 'express';

import { HttpError } from '../middleware/errorHandler.js';
import type { HeroPipelineService } from '../services/heroPipeline.js';

export interface HeroRouterOptions {
  heroPipeline: HeroPipelineService;
}

const normalizeKind = (kind: string | undefined): 'movies' | 'series' => {
  if (!kind) return 'movies';
  const lowered = kind.toLowerCase();
  if (lowered === 'series' || lowered === 'shows' || lowered === 'show') return 'series';
  return 'movies';
};

const parseForceFlag = (value: unknown): boolean => {
  if (Array.isArray(value)) return parseForceFlag(value[value.length - 1]);
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'force';
};

export const createHeroRouter = ({ heroPipeline }: HeroRouterOptions): Router => {
  const router = Router();

  router.get('/:kind', async (req: Request, res: Response, next: NextFunction) => {
    const kind = normalizeKind(req.params.kind);
    const force = parseForceFlag(req.query.force ?? req.query.refresh);

    try {
      const payload = await heroPipeline.getPool(kind, { force });
      const now = Date.now();
      const ttlSeconds = Math.max(60, Math.floor(Math.max(0, payload.expiresAt - now) / 1000));
      res.setHeader('Cache-Control', `public, max-age=${ttlSeconds}`);
      res.json(payload);
    } catch (error) {
      next(
        new HttpError(500, 'Failed to build hero pool', {
          cause: error instanceof Error ? error : undefined,
        }),
      );
    }
  });

  return router;
};

export default createHeroRouter;
