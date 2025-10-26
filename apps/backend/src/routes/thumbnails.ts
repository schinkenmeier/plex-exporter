import express, { type Router } from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';

export interface ThumbnailRouterOptions {
  exportsBasePath?: string;
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

  let basePath: string;
  try {
    basePath = resolveBasePath();
  } catch (err) {
    console.error('[thumbnails] Failed to resolve base path:', err);
    // Return a router that always returns 503
    router.use((req, res) => {
      res.status(503).json({ error: 'Thumbnail service unavailable' });
    });
    return router;
  }

  /**
   * Serve movie thumbnails
   * GET /thumbnails/movies/:filename(*)
   * Supports paths like: Movie - Title [ID].images/Title.thumb.jpg
   */
  router.get('/movies/*', (req, res) => {
    const filename = (req.params as any)[0]; // Get everything after /movies/

    // Security: Prevent directory traversal
    if (!filename || filename.includes('..') || filename.startsWith('/')) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    const filePath = path.join(basePath, 'movies', filename);

    // Additional security: Ensure the resolved path is still within the movies directory
    const resolvedPath = path.resolve(filePath);
    const allowedBasePath = path.resolve(basePath, 'movies');
    if (!resolvedPath.startsWith(allowedBasePath)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!existsSync(filePath)) {
      return res.status(404).json({ error: 'Thumbnail not found' });
    }

    // Set cache headers for better performance
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours
    res.sendFile(filePath);
  });

  /**
   * Serve series thumbnails
   * GET /thumbnails/series/:filename(*)
   * Supports paths like: Series - Title [ID].images/Title.thumb.jpg
   */
  router.get('/series/*', (req, res) => {
    const filename = (req.params as any)[0]; // Get everything after /series/

    // Security: Prevent directory traversal
    if (!filename || filename.includes('..') || filename.startsWith('/')) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    const filePath = path.join(basePath, 'series', filename);

    // Additional security: Ensure the resolved path is still within the series directory
    const resolvedPath = path.resolve(filePath);
    const allowedBasePath = path.resolve(basePath, 'series');
    if (!resolvedPath.startsWith(allowedBasePath)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!existsSync(filePath)) {
      return res.status(404).json({ error: 'Thumbnail not found' });
    }

    // Set cache headers for better performance
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours
    res.sendFile(filePath);
  });

  return router;
};
