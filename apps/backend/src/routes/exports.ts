import { Router, Request, Response, NextFunction } from 'express';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  computeFacets,
  filterMediaItemsPaged,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  type MediaFilterOptions,
  type SortKey,
} from '@plex-exporter/shared';

import logger from '../services/logger.js';
import { HttpError } from '../middleware/errorHandler.js';
import {
  createExportService,
  ExportNotFoundError,
  ExportValidationError,
  type LoadLibraryOptions,
  type MovieExportEntry,
  type ShowExportEntry,
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

const truthy = new Set(['1', 'true', 'yes', 'on']);

const DEFAULT_PAGE = 1;
const MAX_PAGE = 1000;
const MAX_OFFSET = MAX_PAGE_SIZE * MAX_PAGE;

const parseBoolean = (value: unknown, defaultValue: boolean): boolean => {
  if (value === undefined) return defaultValue;
  if (Array.isArray(value)) return parseBoolean(value[value.length - 1], defaultValue);
  const str = String(value).trim().toLowerCase();
  if (!str) return defaultValue;
  if (truthy.has(str)) return true;
  if (str === '0' || str === 'false' || str === 'no' || str === 'off') return false;
  return defaultValue;
};

const parseNumberParam = (value: unknown): number | null => {
  if (value === undefined) return null;
  if (Array.isArray(value)) return parseNumberParam(value[value.length - 1]);
  const str = String(value).trim();
  if (!str) return null;
  const num = Number(str);
  return Number.isFinite(num) ? num : null;
};

const parseGenresParam = (value: unknown): string[] => {
  if (value === undefined) return [];
  const rawValues = Array.isArray(value) ? value : String(value).split(',');
  return rawValues
    .map((entry) => String(entry ?? '').trim())
    .filter((entry): entry is string => entry.length > 0);
};

const parseCollectionParam = (value: unknown): string | undefined => {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return parseCollectionParam(value[value.length - 1]);
  const str = String(value).trim();
  return str || undefined;
};

const parseSortParam = (value: unknown): SortKey | undefined => {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return parseSortParam(value[value.length - 1]);
  const str = String(value).trim();
  const supported: SortKey[] = ['title-asc', 'title-desc', 'year-desc', 'year-asc', 'added-desc'];
  return supported.includes(str as SortKey) ? (str as SortKey) : undefined;
};

const parseLibraryKind = (value: unknown): 'movie' | 'show' | 'all' => {
  if (Array.isArray(value)) return parseLibraryKind(value[value.length - 1]);
  const str = String(value ?? '').trim().toLowerCase();
  if (str === 'show' || str === 'shows' || str === 'series') return 'show';
  if (str === 'all') return 'all';
  return 'movie';
};

interface PaginationParams {
  page: number;
  pageSize: number;
  offset: number;
  limit: number;
}

const createPaginationError = (parameter: string, value: unknown, reason: string) =>
  new HttpError(400, 'Invalid pagination parameter', {
    details: { parameter, value, reason },
  });

const ensureIntegerInRange = (value: number, parameter: string, bounds: { min?: number; max?: number }) => {
  if (!Number.isInteger(value)) {
    throw createPaginationError(parameter, value, 'Value must be an integer');
  }
  const { min, max } = bounds;
  if (min != null && value < min) {
    throw createPaginationError(parameter, value, `Value must be ≥ ${min}`);
  }
  if (max != null && value > max) {
    throw createPaginationError(parameter, value, `Value must be ≤ ${max}`);
  }
  return value;
};

const parsePaginationParams = (query: Request['query']): PaginationParams => {
  const pageRaw = parseNumberParam(query.page);
  const pageSizeRaw =
    parseNumberParam(query.pageSize) ??
    parseNumberParam(query.page_size) ??
    parseNumberParam(query['page-size']);
  const offsetRaw = parseNumberParam(query.offset);
  const limitRaw = parseNumberParam(query.limit);

  const hasPageParams = pageRaw != null || pageSizeRaw != null;
  const hasOffsetParams = offsetRaw != null || limitRaw != null;

  if (hasPageParams || !hasOffsetParams) {
    const page = ensureIntegerInRange(pageRaw ?? DEFAULT_PAGE, 'page', { min: DEFAULT_PAGE, max: MAX_PAGE });
    const pageSize = ensureIntegerInRange(pageSizeRaw ?? DEFAULT_PAGE_SIZE, 'pageSize', {
      min: 1,
      max: MAX_PAGE_SIZE,
    });
    const offset = (page - 1) * pageSize;
    if (offset > MAX_OFFSET) {
      throw createPaginationError('page', page, `Resulting offset exceeds maximum of ${MAX_OFFSET}`);
    }
    return {
      page,
      pageSize,
      offset,
      limit: pageSize,
    };
  }

  const offset = ensureIntegerInRange(offsetRaw ?? 0, 'offset', { min: 0, max: MAX_OFFSET });
  const limit = ensureIntegerInRange(limitRaw ?? DEFAULT_PAGE_SIZE, 'limit', { min: 1, max: MAX_PAGE_SIZE });
  const page = Math.floor(offset / limit) + 1;
  return {
    page,
    pageSize: limit,
    offset,
    limit,
  };
};

const mapFiltersFromQuery = (query: Request['query']): MediaFilterOptions => {
  const yearFrom = parseNumberParam(query.yearFrom ?? query.year_from ?? query['year-from']);
  const yearTo = parseNumberParam(query.yearTo ?? query.year_to ?? query['year-to']);
  const newDays = parseNumberParam(query.newDays ?? query.new_days ?? query['new-days']);
  const genres = parseGenresParam(query.genres ?? query.genre);

  const filters: MediaFilterOptions = {
    query: typeof query.query === 'string' ? query.query : typeof query.q === 'string' ? query.q : undefined,
    onlyNew: parseBoolean(query.onlyNew ?? query.only_new ?? query['only-new'], false),
    yearFrom: yearFrom ?? undefined,
    yearTo: yearTo ?? undefined,
    genres: genres.length > 0 ? genres : undefined,
    collection: parseCollectionParam(query.collection ?? query.collectionTag ?? query['collection-tag']),
    sort: parseSortParam(query.sort),
  };

  if (newDays != null) {
    filters.newDays = newDays;
  }

  return filters;
};

type ExportServiceInstance = ReturnType<typeof createExportService>;

const loadMoviesSafe = async (
  service: ExportServiceInstance,
  options?: LoadLibraryOptions,
): Promise<MovieExportEntry[]> => {
  try {
    return await service.loadMovies(options);
  } catch (error) {
    if (error instanceof ExportNotFoundError) {
      logger.warn('Movies export missing for search request', { namespace: 'exports' });
      return [];
    }
    throw error;
  }
};

const loadShowsSafe = async (
  service: ExportServiceInstance,
  options?: LoadLibraryOptions,
): Promise<ShowExportEntry[]> => {
  try {
    return await service.loadSeries(options);
  } catch (error) {
    if (error instanceof ExportNotFoundError) {
      logger.warn('Series export missing for search request', { namespace: 'exports' });
      return [];
    }
    throw error;
  }
};

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

  router.get('/search', async (req: Request, res: Response, next: NextFunction) => {
    const includeItems = parseBoolean(
      req.query.includeItems ?? req.query.include_items ?? req.query['include-items'],
      true,
    );
    const includeFacets = parseBoolean(
      req.query.includeFacets ?? req.query.include_facets ?? req.query['include-facets'],
      true,
    );
    const kind = parseLibraryKind(req.query.kind ?? req.query.library ?? req.query.view);
    const filters = mapFiltersFromQuery(req.query);
    const forceReload = parseBoolean(req.query.force, false);
    const libraryOptions: LoadLibraryOptions | undefined = forceReload ? { force: true } : undefined;

    try {
      const needsMovies = includeFacets || kind === 'movie' || kind === 'all';
      const needsShows = includeFacets || kind === 'show' || kind === 'all';

      const [movies, shows] = await Promise.all([
        needsMovies ? loadMoviesSafe(exportService, libraryOptions) : Promise.resolve<MovieExportEntry[]>([]),
        needsShows ? loadShowsSafe(exportService, libraryOptions) : Promise.resolve<ShowExportEntry[]>([]),
      ]);

      const payload: Record<string, unknown> = {
        kind,
        filters: {
          ...filters,
          genres: filters.genres ?? [],
        },
      };

      if (includeFacets) {
        payload.facets = computeFacets(movies, shows);
      }

      if (includeItems) {
        let pagination: PaginationParams;
        try {
          pagination = parsePaginationParams(req.query);
        } catch (error) {
          return next(error instanceof HttpError ? error : new HttpError(400, 'Invalid pagination parameter'));
        }

        const pool = kind === 'all' ? [...movies, ...shows] : kind === 'show' ? shows : movies;
        const { items, total } = filterMediaItemsPaged(pool, filters, {
          offset: pagination.offset,
          limit: pagination.limit,
        });
        payload.items = items;
        payload.total = total;
        payload.page = pagination.page;
        payload.pageSize = pagination.pageSize;
      }

      setCacheHeaders(res, includeItems ? 60 : 300);
      res.json(payload);
    } catch (error) {
      if (error instanceof ExportValidationError) {
        return next(
          new HttpError(500, 'Invalid export data for search request', {
            details: error.details,
            cause: error,
          }),
        );
      }
      return next(
        new HttpError(500, 'Failed to process export search request', {
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
