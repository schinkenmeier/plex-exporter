import { Router, type Request, type Response, type NextFunction } from 'express';

import { HttpError } from '../middleware/errorHandler.js';
import type { HeroPipelineService } from '../services/heroPipeline.js';
import { heroLimiter } from '../middleware/rateLimiter.js';

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

/**
 * Convert local thumbnail paths to full backend URLs
 */
const convertThumbnailToUrl = (path: string | null, mediaType: 'movie' | 'tv', req: Request): string | null => {
  if (!path) return null;

  // If already a full URL, return as-is
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  // Convert local path to thumbnail URL
  const type = mediaType === 'tv' ? 'series' : 'movies';
  const protocol = req.protocol;
  const host = req.get('host');
  return `${protocol}://${host}/api/thumbnails/${type}/${encodeURIComponent(path)}`;
};

export const createHeroRouter = ({ heroPipeline }: HeroRouterOptions): Router => {
  const router = Router();

  router.get('/:kind', heroLimiter, async (req: Request, res: Response, next: NextFunction) => {
    const kind = normalizeKind(req.params.kind);
    const force = parseForceFlag(req.query.force ?? req.query.refresh);

    try {
      const payload = await heroPipeline.getPool(kind, { force });

      // Convert local thumbnail paths to full URLs
      const items = payload.items.map(item => ({
        ...item,
        backdrops: item.backdrops.map(bd => convertThumbnailToUrl(bd, item.type, req) ?? bd),
        poster: convertThumbnailToUrl(item.poster, item.type, req),
      }));

      const now = Date.now();
      const ttlSeconds = Math.max(60, Math.floor(Math.max(0, payload.expiresAt - now) / 1000));
      res.setHeader('Cache-Control', `public, max-age=${ttlSeconds}`);
      res.json({ ...payload, items });
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
