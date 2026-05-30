import express, { type Response, type Router } from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import type TautulliService from '../services/tautulliService.js';

export interface ThumbnailRouterOptions {
  exportsBasePath?: string;
  tautulliService?: TautulliService;
  getTautulliService?: () => TautulliService | null;
}

/**
 * Creates a router for serving thumbnail images from the exports directory
 */
export const createThumbnailRouter = (options: ThumbnailRouterOptions = {}): Router => {
  const router = express.Router();

  // Determine the base path for thumbnails
  // Try environment variable first, then fall back to default paths
  const resolveBasePath = (): string => {
    if (options.exportsBasePath && existsSync(options.exportsBasePath)) {
      return options.exportsBasePath;
    }

    const candidates = [
      path.join(process.cwd(), '..', '..', 'data', 'exports'), // From apps/backend
      path.join(process.cwd(), 'data', 'exports'),             // From project root
      '/app/data/exports',                                      // Docker container
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    throw new Error('Could not find exports directory for thumbnail serving');
  };

  let basePath: string | null = null;
  try {
    basePath = resolveBasePath();
  } catch (err) {
    console.error('[thumbnails] Failed to resolve base path:', err);
  }

  const requireBasePath = (res: Response): string | null => {
    if (!basePath) {
      res.status(503).json({ error: 'Thumbnail service unavailable' });
      return null;
    }

    return basePath;
  };

  /**
   * Serve movie thumbnails
   * GET /thumbnails/movies/:filename(*)
   * Supports paths like: Movie - Title [ID].images/Title.thumb.jpg
   */
  router.get(/^\/movies\/(.+)$/, (req, res) => {
    const resolvedBasePath = requireBasePath(res);
    if (!resolvedBasePath) return;

    const filename = (req.params as any)[0]; // Get everything after /movies/

    // Security: Prevent directory traversal
    if (!filename || filename.includes('..') || filename.startsWith('/')) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    const filePath = path.join(resolvedBasePath, 'movies', filename);

    // Additional security: Ensure the resolved path is still within the movies directory
    const resolvedPath = path.resolve(filePath);
    const allowedBasePath = path.resolve(resolvedBasePath, 'movies');
    if (!resolvedPath.startsWith(allowedBasePath)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!existsSync(filePath)) {
      return res.status(404).json({ error: 'Thumbnail not found' });
    }

    // Allow embedding from the frontend dev server and set cache headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours
    res.sendFile(filePath);
  });

  /**
   * Serve series thumbnails
   * GET /thumbnails/series/:filename(*)
   * Supports paths like: Series - Title [ID].images/Title.thumb.jpg
   */
  router.get(/^\/series\/(.+)$/, (req, res) => {
    const resolvedBasePath = requireBasePath(res);
    if (!resolvedBasePath) return;

    const filename = (req.params as any)[0]; // Get everything after /series/

    // Security: Prevent directory traversal
    if (!filename || filename.includes('..') || filename.startsWith('/')) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    const filePath = path.join(resolvedBasePath, 'series', filename);

    // Additional security: Ensure the resolved path is still within the series directory
    const resolvedPath = path.resolve(filePath);
    const allowedBasePath = path.resolve(resolvedBasePath, 'series');
    if (!resolvedPath.startsWith(allowedBasePath)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!existsSync(filePath)) {
      return res.status(404).json({ error: 'Thumbnail not found' });
    }

    // Allow embedding from the frontend dev server and set cache headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours
    res.sendFile(filePath);
  });

  /**
   * Serve downloaded Plex covers (movies + tv)
   * GET /thumbnails/covers/:path(*)
   * Supports nested paths like covers/movie/{ratingKey}/poster.jpg
   */
  router.get(/^\/covers\/(.+)$/, (req, res) => {
    const resolvedBasePath = requireBasePath(res);
    if (!resolvedBasePath) return;

    const relativePath = (req.params as any)[0];

    if (!relativePath || relativePath.includes('..') || relativePath.startsWith('/')) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    const coverRoot = path.resolve(resolvedBasePath, 'covers');
    const resolvedPath = path.resolve(coverRoot, relativePath);
    if (!resolvedPath.startsWith(coverRoot)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const candidatePaths: string[] = [];
    const ext = path.extname(resolvedPath);
    candidatePaths.push(resolvedPath);
    if (!ext) {
      const commonExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
      for (const extension of commonExtensions) {
        candidatePaths.push(`${resolvedPath}${extension}`);
      }
    }

    const existingPath = candidatePaths.find((candidate) => existsSync(candidate));
    if (!existingPath) {
      return res.status(404).json({ error: 'Thumbnail not found' });
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours
    res.sendFile(existingPath);
  });

  /**
   * Proxy Tautulli images
   * GET /thumbnails/tautulli/library/metadata/:id/:type/:timestamp
   * where :type is either 'thumb' or 'art'
   * Proxies image requests to Tautulli with authentication
   */
  const resolveTautulliService = () => {
    if (typeof options.getTautulliService === 'function') {
      return options.getTautulliService();
    }
    return options.tautulliService ?? null;
  };

  if (options.tautulliService || options.getTautulliService) {
    router.get('/tautulli/library/metadata/:id/:type/:timestamp', async (req, res) => {
      const tautulliService = resolveTautulliService();
      if (!tautulliService) {
        return res.status(503).json({ error: 'Tautulli integration is not configured' });
      }

      if (typeof tautulliService.fetchLibraryImage !== 'function') {
        return res.status(503).json({ error: 'Tautulli image proxy is not available' });
      }

      const { id, type, timestamp } = req.params;

      if (!id || !timestamp || !type || (type !== 'thumb' && type !== 'art')) {
        return res.status(400).json({ error: 'Invalid parameters' });
      }

      try {
        const response = await tautulliService.fetchLibraryImage(id, type, timestamp);

        // Forward the image with proper headers
        res.setHeader('Content-Type', response.headers?.['content-type'] || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours
        res.setHeader('Access-Control-Allow-Origin', '*'); // Allow CORS for images
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); // Allow cross-origin embedding
        res.send(response.data);
      } catch (error) {
        console.error('[Tautulli Proxy] Failed to fetch image:', error);
        res.status(502).json({ error: 'Failed to fetch image from Tautulli' });
      }
    });
  }

  return router;
};
