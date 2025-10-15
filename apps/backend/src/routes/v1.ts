import { Router, type NextFunction, type Request, type Response } from 'express';
import { createSqliteConnection } from '../db/connection.js';
import MediaRepository from '../repositories/mediaRepository.js';
import ThumbnailRepository from '../repositories/thumbnailRepository.js';
import path from 'node:path';
import { HttpError } from '../middleware/errorHandler.js';

export const createV1Router = (): Router => {
  const router = Router();

  // Database connection
  const dbPath = process.env.SQLITE_PATH || path.join(process.cwd(), 'data', 'exports', 'plex-exporter.sqlite');
  const db = createSqliteConnection(dbPath);
  const mediaRepo = new MediaRepository(db);
  const thumbRepo = new ThumbnailRepository(db);

  // Helper function to map media record to API response
  const mapMediaToResponse = (item: any, includeExtended = true) => {
    const thumbnails = thumbRepo.listByMediaId(item.id);
    const base = {
      ratingKey: item.plexId,
      title: item.title,
      year: item.year,
      guid: item.guid,
      summary: item.summary,
      mediaType: item.mediaType,
      addedAt: item.plexAddedAt,
      updatedAt: item.plexUpdatedAt,
      thumbFile: thumbnails[0]?.path || null,
    };

    if (!includeExtended) return base;

    return {
      ...base,
      // Extended metadata
      genres: item.genres,
      directors: item.directors,
      countries: item.countries,
      collections: item.collections,
      rating: item.rating,
      audienceRating: item.audienceRating,
      contentRating: item.contentRating,
      studio: item.studio,
      tagline: item.tagline,
      duration: item.duration,
      originallyAvailableAt: item.originallyAvailableAt,
    };
  };

  /**
   * GET /api/v1/movies
   * List all movies from database
   */
  router.get('/movies', (req: Request, res: Response, next: NextFunction) => {
    try {
      const allMedia = mediaRepo.listAll();
      const movies = allMedia.filter(m => m.mediaType === 'movie');

      // Map to frontend-compatible format
      const response = movies.map(movie => ({
        ratingKey: movie.plexId,
        title: movie.title,
        year: movie.year,
        guid: movie.guid,
        summary: movie.summary,
        addedAt: movie.plexAddedAt,
        updatedAt: movie.plexUpdatedAt,
        // Get thumbnail for this movie
        thumbFile: thumbRepo.listByMediaId(movie.id)[0]?.path || null,
      }));

      res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min cache
      res.json(response);
    } catch (error) {
      next(new HttpError(500, 'Failed to fetch movies', { cause: error instanceof Error ? error : undefined }));
    }
  });

  /**
   * GET /api/v1/movies/:id
   * Get movie details by plexId (includes extended metadata)
   */
  router.get('/movies/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const movie = mediaRepo.getByPlexId(id);

      if (!movie || movie.mediaType !== 'movie') {
        return next(new HttpError(404, 'Movie not found'));
      }

      const thumbnails = thumbRepo.listByMediaId(movie.id);
      const response = {
        ...mapMediaToResponse(movie, true),
        thumbnails: thumbnails.map(t => t.path),
      };

      res.setHeader('Cache-Control', 'public, max-age=600'); // 10 min cache
      res.json(response);
    } catch (error) {
      next(
        new HttpError(500, 'Failed to fetch movie details', {
          cause: error instanceof Error ? error : undefined,
        }),
      );
    }
  });

  /**
   * GET /api/v1/series
   * List all series from database
   */
  router.get('/series', (req: Request, res: Response, next: NextFunction) => {
    try {
      const allMedia = mediaRepo.listAll();
      const series = allMedia.filter(m => m.mediaType === 'tv');

      // Map to frontend-compatible format
      const response = series.map(show => ({
        ratingKey: show.plexId,
        title: show.title,
        year: show.year,
        guid: show.guid,
        summary: show.summary,
        addedAt: show.plexAddedAt,
        updatedAt: show.plexUpdatedAt,
        // Get thumbnail for this series
        thumbFile: thumbRepo.listByMediaId(show.id)[0]?.path || null,
      }));

      res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min cache
      res.json(response);
    } catch (error) {
      next(new HttpError(500, 'Failed to fetch series', { cause: error instanceof Error ? error : undefined }));
    }
  });

  /**
   * GET /api/v1/series/:id
   * Get series details by plexId (includes extended metadata)
   */
  router.get('/series/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const series = mediaRepo.getByPlexId(id);

      if (!series || series.mediaType !== 'tv') {
        return next(new HttpError(404, 'Series not found'));
      }

      const thumbnails = thumbRepo.listByMediaId(series.id);
      const response = {
        ...mapMediaToResponse(series, true),
        thumbnails: thumbnails.map(t => t.path),
      };

      res.setHeader('Cache-Control', 'public, max-age=600'); // 10 min cache
      res.json(response);
    } catch (error) {
      next(
        new HttpError(500, 'Failed to fetch series details', {
          cause: error instanceof Error ? error : undefined,
        }),
      );
    }
  });

  /**
   * GET /api/v1/stats
   * Get database statistics
   */
  router.get('/stats', (req: Request, res: Response, next: NextFunction) => {
    try {
      const allMedia = mediaRepo.listAll();
      const movies = allMedia.filter(m => m.mediaType === 'movie');
      const series = allMedia.filter(m => m.mediaType === 'tv');

      const response = {
        totalMovies: movies.length,
        totalSeries: series.length,
        totalItems: allMedia.length,
      };

      res.setHeader('Cache-Control', 'public, max-age=60'); // 1 min cache
      res.json(response);
    } catch (error) {
      next(new HttpError(500, 'Failed to fetch stats', { cause: error instanceof Error ? error : undefined }));
    }
  });

  /**
   * GET /api/v1/filter
   * Filter media with query parameters
   * Query params: type, year, yearFrom, yearTo, search, limit, offset, sortBy, sortOrder
   */
  router.get('/filter', (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        type,
        year,
        yearFrom,
        yearTo,
        search,
        limit = '50',
        offset = '0',
        sortBy = 'title',
        sortOrder = 'asc',
      } = req.query;

      // Build filter options
      const filterOptions: any = {
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
        sortBy: sortBy as 'title' | 'year' | 'added' | 'updated',
        sortOrder: sortOrder as 'asc' | 'desc',
      };

      if (type === 'movie' || type === 'tv') {
        filterOptions.mediaType = type;
      }

      if (year) {
        filterOptions.year = parseInt(year as string, 10);
      }

      if (yearFrom) {
        filterOptions.yearFrom = parseInt(yearFrom as string, 10);
      }

      if (yearTo) {
        filterOptions.yearTo = parseInt(yearTo as string, 10);
      }

      if (search) {
        filterOptions.search = search as string;
      }

      // Get filtered results and total count
      const items = mediaRepo.filter(filterOptions);
      const total = mediaRepo.count(filterOptions);

      // Map to frontend format with extended metadata
      const results = items.map(item => mapMediaToResponse(item, true));

      const response = {
        items: results,
        pagination: {
          total,
          limit: filterOptions.limit,
          offset: filterOptions.offset,
          hasMore: filterOptions.offset + filterOptions.limit < total,
        },
      };

      res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min cache
      res.json(response);
    } catch (error) {
      next(new HttpError(500, 'Failed to filter media', { cause: error instanceof Error ? error : undefined }));
    }
  });

  /**
   * GET /api/v1/search
   * Search media by title or summary
   * Query param: q (search query), type (optional), limit (optional)
   */
  router.get('/search', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { q, type, limit = '20' } = req.query;

      if (!q || typeof q !== 'string') {
        return next(new HttpError(400, 'Search query parameter "q" is required'));
      }

      const filterOptions: any = {
        search: q,
        limit: parseInt(limit as string, 10),
        offset: 0,
        sortBy: 'title' as const,
        sortOrder: 'asc' as const,
      };

      if (type === 'movie' || type === 'tv') {
        filterOptions.mediaType = type;
      }

      const items = mediaRepo.filter(filterOptions);
      const total = mediaRepo.count(filterOptions);

      // Map to frontend format with extended metadata
      const results = items.map(item => mapMediaToResponse(item, true));

      res.setHeader('Cache-Control', 'public, max-age=180'); // 3 min cache
      res.json({ query: q, total, results });
    } catch (error) {
      next(new HttpError(500, 'Failed to search media', { cause: error instanceof Error ? error : undefined }));
    }
  });

  /**
   * GET /api/v1/recent
   * Get recently added media
   * Query params: limit (default: 20), type (optional: 'movie' or 'tv')
   */
  router.get('/recent', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { limit = '20', type } = req.query;

      const limitNum = parseInt(limit as string, 10);
      const mediaType = type === 'movie' || type === 'tv' ? type : undefined;

      const items = mediaRepo.getRecent(limitNum, mediaType);

      // Map to frontend format with extended metadata
      const results = items.map(item => mapMediaToResponse(item, true));

      res.setHeader('Cache-Control', 'public, max-age=60'); // 1 min cache
      res.json({ items: results, count: results.length });
    } catch (error) {
      next(new HttpError(500, 'Failed to fetch recent media', { cause: error instanceof Error ? error : undefined }));
    }
  });

  return router;
};
