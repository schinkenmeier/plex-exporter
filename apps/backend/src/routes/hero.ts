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

const encodeThumbnailPath = (rawPath: string): string => {
  const normalized = rawPath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter((segment) => segment && segment !== '.');
  return segments.map((segment) => encodeURIComponent(segment)).join('/');
};

/**
 * Convert local thumbnail paths to full backend URLs
 */
const convertThumbnailToUrl = (path: string | null, mediaType: 'movie' | 'tv', req: Request): string | null => {
  if (!path) return null;
  const trimmed = path.trim();
  if (!trimmed) return null;

  const protocol = req.protocol || 'http';
  const host = req.get('host') || 'localhost';
  const buildAbsolute = (value: string) => {
    const normalized = value.startsWith('/') ? value : `/${value}`;
    return `${protocol}://${host}${normalized}`;
  };

  const normalized = trimmed.replace(/\\/g, '/');

  let tautulliProbe = normalized;
  if (/^https?:\/\//i.test(normalized)) {
    try {
      const parsed = new URL(normalized);
      tautulliProbe = `${parsed.pathname || ''}${parsed.search || ''}`;
    } catch {
      tautulliProbe = normalized;
    }
  } else if (normalized.startsWith('//')) {
    const slashIndex = normalized.indexOf('/', 2);
    tautulliProbe = slashIndex >= 0 ? normalized.slice(slashIndex) : '';
  }

  const tautulliMatch =
    tautulliProbe.match(/\/library\/metadata\/(\d+)\/(thumb|art)\/(\d+)/) ??
    tautulliProbe.match(/^library\/metadata\/(\d+)\/(thumb|art)\/(\d+)/);
  if (tautulliMatch) {
    const [, id, type, timestamp] = tautulliMatch;
    return buildAbsolute(`/api/thumbnails/tautulli/library/metadata/${id}/${type}/${timestamp}`);
  }

  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('data:')) {
    return trimmed;
  }

  if (trimmed.startsWith('//')) {
    return `${protocol}:${trimmed}`;
  }

  let localPath = normalized.replace(/^\.\/+/, '');
  if (localPath.startsWith('/api/thumbnails/')) {
    return buildAbsolute(localPath);
  }
  if (localPath.startsWith('api/thumbnails/')) {
    return buildAbsolute(`/${localPath}`);
  }

  const traversalPattern = /(^|\/)\.\.(\/|$)/;

  if (localPath.startsWith('/covers/')) {
    const stripped = localPath.replace(/^\/?covers\/?/, '');
    if (traversalPattern.test(stripped)) {
      return null;
    }
    const encoded = encodeThumbnailPath(stripped);
    return buildAbsolute(`/api/thumbnails/covers${encoded ? `/${encoded}` : ''}`);
  }

  if (localPath.startsWith('covers/')) {
    const stripped = localPath.replace(/^covers\/?/, '');
    if (traversalPattern.test(stripped)) {
      return null;
    }
    const encoded = encodeThumbnailPath(stripped);
    return buildAbsolute(`/api/thumbnails/covers${encoded ? `/${encoded}` : ''}`);
  }

  if (traversalPattern.test(localPath)) {
    return null;
  }

  const type = mediaType === 'tv' ? 'series' : 'movies';
  const trimmedPath = localPath.startsWith('/') ? localPath.slice(1) : localPath;
  const encoded = encodeThumbnailPath(trimmedPath);
  return buildAbsolute(`/api/thumbnails/${type}${encoded ? `/${encoded}` : ''}`);
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
        poster: convertThumbnailToUrl(item.poster, item.type, req) ?? item.poster,
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
