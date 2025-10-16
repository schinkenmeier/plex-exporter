import { Router, Request, Response, NextFunction } from 'express';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import logger from '../services/logger.js';
import { HttpError } from '../middleware/errorHandler.js';
import {
  createExportService,
  ExportNotFoundError,
  ExportValidationError,
} from '../services/exportService.js';

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
        logger.info('Using exports path', { namespace: 'exports', path: candidate });
        return candidate;
      }
    }
  }

  logger.warn('No valid exports path found, using default', { namespace: 'exports' });
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
  const exportService = createExportService({ root: exportsPath });

  // Cache headers helper
  const setCacheHeaders = (res: Response, maxAge: number = 300) => {
    res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
    res.setHeader('ETag', `"${Date.now()}"`);
  };

  // Error handler helper
  /**
   * GET /api/exports/movies
   * Returns movies.json from data/exports/movies/
   */
  router.get('/movies', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await exportService.loadMovies();
      setCacheHeaders(res, 300); // 5 minutes
      res.json(data);
    } catch (error) {
      if (error instanceof ExportNotFoundError) {
        return next(
          new HttpError(404, 'Movies export not found', {
            details: error.details ?? { path: 'data/exports/movies/movies.json' },
          }),
        );
      }
      if (error instanceof ExportValidationError) {
        return next(
          new HttpError(500, 'Invalid movies export data', {
            details: error.details,
            cause: error,
          }),
        );
      }
      return next(
        new HttpError(500, 'Failed to read movies export', {
          details: { path: path.join(exportsPath, 'movies', 'movies.json') },
          cause: error instanceof Error ? error : undefined,
        }),
      );
    }
  });

  /**
   * GET /api/exports/series
   * Returns series_index.json from data/exports/series/
   */
  router.get('/series', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await exportService.loadSeries();
      setCacheHeaders(res, 300); // 5 minutes
      res.json(data);
    } catch (error) {
      if (error instanceof ExportNotFoundError) {
        return next(
          new HttpError(404, 'Series index not found', {
            details: error.details ?? { path: 'data/exports/series/series_index.json' },
          }),
        );
      }
      if (error instanceof ExportValidationError) {
        return next(
          new HttpError(500, 'Invalid series export data', {
            details: error.details,
            cause: error,
          }),
        );
      }
      return next(
        new HttpError(500, 'Failed to read series index', {
          details: { path: path.join(exportsPath, 'series', 'series_index.json') },
          cause: error instanceof Error ? error : undefined,
        }),
      );
    }
  });

  /**
   * GET /api/exports/series/:id/details
   * Returns detailed series data from data/exports/series/details/:id.json
   */
  router.get('/series/:id/details', async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;

    if (!id || !/^[\w-]+$/.test(id)) {
      return next(
        new HttpError(400, 'Invalid series ID', {
          details: {
            reason: 'ID must contain only alphanumeric characters, hyphens, and underscores',
          },
        }),
      );
    }

    try {
      const data = await exportService.loadSeriesDetails(id);
      if (!data) {
        return next(
          new HttpError(404, 'Series details not found', {
            details: { id, path: `data/exports/series/details/${id}.json` },
          }),
        );
      }
      setCacheHeaders(res, 600); // 10 minutes (details change less frequently)
      res.json(data);
    } catch (error) {
      if (error instanceof ExportValidationError) {
        return next(
          new HttpError(500, 'Invalid series detail data', {
            details: error.details ?? { id },
            cause: error,
          }),
        );
      }
      return next(
        new HttpError(500, 'Failed to read series details', {
          details: { id, path: path.join(exportsPath, 'series', 'details', `${id}.json`) },
          cause: error instanceof Error ? error : undefined,
        }),
      );
    }
  });

  /**
   * GET /api/exports/stats
   * Returns statistics about available exports
   */
  router.get('/stats', async (_req: Request, res: Response, next: NextFunction) => {
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
      next(
        error instanceof HttpError
          ? error
          : new HttpError(500, 'Failed to read export statistics', {
              cause: error instanceof Error ? error : undefined,
            }),
      );
    }
  });

  return router;
};

export default createExportsRouter;
