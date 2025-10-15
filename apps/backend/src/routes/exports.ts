import { Router, Request, Response, NextFunction } from 'express';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ExportsRouterOptions {
  exportsPath?: string;
}

// Determine exports path - check multiple possible locations
const resolveExportsPath = (): string => {
  const candidates = [
    path.join(process.cwd(), '..', '..', 'data', 'exports'), // Running from apps/backend (check first)
    path.join(process.cwd(), 'data', 'exports'),           // Running from project root
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      // Verify it actually contains movies or series directories
      const hasMovies = existsSync(path.join(candidate, 'movies'));
      const hasSeries = existsSync(path.join(candidate, 'series'));

      if (hasMovies || hasSeries) {
        console.log(`[exports] Using exports path: ${candidate}`);
        return candidate;
      }
    }
  }

  console.warn('[exports] No valid exports path found, using default');
  return candidates[1]; // Default to project root structure
};

const DEFAULT_EXPORTS_PATH = resolveExportsPath();

/**
 * Creates router for serving Plex export data
 * Serves static JSON files from data/exports/ directory
 */
export const createExportsRouter = (options: ExportsRouterOptions = {}) => {
  const router = Router();
  const exportsPath = options.exportsPath || DEFAULT_EXPORTS_PATH;

  // Cache headers helper
  const setCacheHeaders = (res: Response, maxAge: number = 300) => {
    res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
    res.setHeader('ETag', `"${Date.now()}"`);
  };

  // Error handler helper
  const handleError = (res: Response, error: Error, status: number = 500) => {
    console.error('[exports] Error:', error.message);
    res.status(status).json({
      error: error.message || 'Internal server error',
      timestamp: new Date().toISOString(),
    });
  };

  /**
   * GET /api/exports/movies
   * Returns movies.json from data/exports/movies/
   */
  router.get('/movies', async (_req: Request, res: Response) => {
    const filePath = path.join(exportsPath, 'movies', 'movies.json');

    try {
      if (!existsSync(filePath)) {
        return res.status(404).json({
          error: 'Movies export not found',
          path: 'data/exports/movies/movies.json',
        });
      }

      const content = await readFile(filePath, 'utf-8');
      const data = JSON.parse(content);

      setCacheHeaders(res, 300); // 5 minutes
      res.json(data);
    } catch (error) {
      handleError(res, error as Error);
    }
  });

  /**
   * GET /api/exports/series
   * Returns series_index.json from data/exports/series/
   */
  router.get('/series', async (_req: Request, res: Response) => {
    const filePath = path.join(exportsPath, 'series', 'series_index.json');

    try {
      if (!existsSync(filePath)) {
        return res.status(404).json({
          error: 'Series index not found',
          path: 'data/exports/series/series_index.json',
        });
      }

      const content = await readFile(filePath, 'utf-8');
      const data = JSON.parse(content);

      setCacheHeaders(res, 300); // 5 minutes
      res.json(data);
    } catch (error) {
      handleError(res, error as Error);
    }
  });

  /**
   * GET /api/exports/series/:id/details
   * Returns detailed series data from data/exports/series/details/:id.json
   */
  router.get('/series/:id/details', async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id || !/^[\w-]+$/.test(id)) {
      return res.status(400).json({
        error: 'Invalid series ID',
        details: 'ID must contain only alphanumeric characters, hyphens, and underscores',
      });
    }

    const filePath = path.join(exportsPath, 'series', 'details', `${id}.json`);

    try {
      if (!existsSync(filePath)) {
        return res.status(404).json({
          error: 'Series details not found',
          id,
          path: `data/exports/series/details/${id}.json`,
        });
      }

      const content = await readFile(filePath, 'utf-8');
      const data = JSON.parse(content);

      setCacheHeaders(res, 600); // 10 minutes (details change less frequently)
      res.json(data);
    } catch (error) {
      handleError(res, error as Error);
    }
  });

  /**
   * GET /api/exports/stats
   * Returns statistics about available exports
   */
  router.get('/stats', async (_req: Request, res: Response) => {
    try {
      const moviesPath = path.join(exportsPath, 'movies', 'movies.json');
      const seriesPath = path.join(exportsPath, 'series', 'series_index.json');

      const stats = {
        movies: {
          available: existsSync(moviesPath),
          count: 0,
        },
        series: {
          available: existsSync(seriesPath),
          count: 0,
        },
        lastUpdated: new Date().toISOString(),
      };

      // Try to get counts
      if (stats.movies.available) {
        try {
          const content = await readFile(moviesPath, 'utf-8');
          const data = JSON.parse(content);
          stats.movies.count = Array.isArray(data) ? data.length : 0;
        } catch {
          // Ignore count errors
        }
      }

      if (stats.series.available) {
        try {
          const content = await readFile(seriesPath, 'utf-8');
          const data = JSON.parse(content);
          stats.series.count = Array.isArray(data) ? data.length : 0;
        } catch {
          // Ignore count errors
        }
      }

      setCacheHeaders(res, 60); // 1 minute
      res.json(stats);
    } catch (error) {
      handleError(res, error as Error);
    }
  });

  return router;
};

export default createExportsRouter;
