import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import MediaRepository from '../repositories/mediaRepository.js';
import ThumbnailRepository from '../repositories/thumbnailRepository.js';
import SeasonRepository from '../repositories/seasonRepository.js';
import CastRepository from '../repositories/castRepository.js';
import type { EpisodeRecord, SeasonRecordWithEpisodes } from '../repositories/seasonRepository.js';
import type { CastAppearance } from '../repositories/castRepository.js';
import { HttpError } from '../middleware/errorHandler.js';
import { apiLimiter, searchLimiter } from '../middleware/rateLimiter.js';
import { createShortCache, createMediumCache, createLongCache } from '../services/cacheService.js';
import { cacheMiddleware } from '../middleware/cacheMiddleware.js';

export interface V1RouterOptions {
  mediaRepository: MediaRepository;
  thumbnailRepository: ThumbnailRepository;
  seasonRepository: SeasonRepository;
  castRepository: CastRepository;
}

export const createV1Router = ({ mediaRepository, thumbnailRepository, seasonRepository, castRepository }: V1RouterOptions): Router => {
  const router = Router();

  // Create cache instances for different data types
  const statsCache = createShortCache(); // 1 minute for stats
  const listCache = createMediumCache(); // 5 minutes for lists
  const detailCache = createLongCache(); // 15 minutes for details

  // Zod schemas for query parameter validation
  const filterQuerySchema = z.object({
    type: z.enum(['movie', 'tv']).optional(),
    year: z.coerce.number().int().min(1800).max(2100).optional(),
    yearFrom: z.coerce.number().int().min(1800).max(2100).optional(),
    yearTo: z.coerce.number().int().min(1800).max(2100).optional(),
    search: z.string().min(1).max(200).optional(),
    genres: z.string().optional(),
    collection: z.string().optional(),
    onlyNew: z.string().optional(),
    newDays: z.coerce.number().int().min(1).max(365).optional(),
    limit: z.coerce.number().int().min(1).max(500).default(50),
    offset: z.coerce.number().int().min(0).default(0),
    sortBy: z.enum(['title', 'year', 'added', 'updated']).default('title'),
    sortOrder: z.enum(['asc', 'desc']).default('asc'),
  });

  const searchQuerySchema = z.object({
    q: z.string().min(1).max(200),
    type: z.enum(['movie', 'tv']).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(20),
  });

  const recentQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(200).default(20),
    type: z.enum(['movie', 'tv']).optional(),
  });

  const parseBooleanFlag = (value?: string) => {
    if (value == null) return false;
    const normalized = String(value).trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
  };

  // Helper function to build thumbnail URL with full backend URL
  const buildThumbnailUrl = (thumbnailPath: string | null, mediaType: string, req?: Request): string | null => {
    if (!thumbnailPath) return null;
    const type = mediaType === 'tv' ? 'series' : 'movies';
    const relativePath = `/api/thumbnails/${type}/${encodeURIComponent(thumbnailPath)}`;

    // Build full URL if request is available
    if (req) {
      const protocol = req.protocol;
      const host = req.get('host');
      return `${protocol}://${host}${relativePath}`;
    }

    return relativePath;
  };

  // Helper function to map media records to API responses (with bulk thumbnail loading)
  const mapMediaListToResponse = (items: any[], includeExtended = true, req?: Request) => {
    // Bulk load all thumbnails in one query
    const mediaIds = items.map(item => item.id);
    const thumbnailsMap = thumbnailRepository.listByMediaIds(mediaIds);

    return items.map(item => {
      const thumbnails = thumbnailsMap.get(item.id) || [];
      const thumbnailPath = thumbnails[0]?.path || null;
      const base = {
        ratingKey: item.plexId,
        title: item.title,
        year: item.year,
        guid: item.guid,
        summary: item.summary,
        mediaType: item.mediaType,
        addedAt: item.plexAddedAt,
        updatedAt: item.plexUpdatedAt,
        thumbFile: buildThumbnailUrl(thumbnailPath, item.mediaType, req),
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
    });
  };

  // Helper function for single item (backwards compatibility)
  const mapMediaToResponse = (item: any, includeExtended = true, req?: Request) => {
    return mapMediaListToResponse([item], includeExtended, req)[0];
  };

  const mapEpisodesToResponse = (episodes: EpisodeRecord[]) =>
    episodes.map((episode) => ({
      id: episode.id,
      ratingKey: episode.tautulliId,
      title: episode.title,
      episodeNumber: episode.episodeNumber,
      summary: episode.summary,
      duration: episode.duration,
      rating: episode.rating,
      airDate: episode.airDate,
      thumb: episode.thumb,
    }));

  const mapSeasonsToResponse = (seasonsWithEpisodes: SeasonRecordWithEpisodes[]) =>
    seasonsWithEpisodes.map((season) => ({
      id: season.id,
      ratingKey: season.tautulliId,
      seasonNumber: season.seasonNumber,
      title: season.title,
      summary: season.summary,
      poster: season.poster,
      episodeCount: season.episodeCount,
      episodes: mapEpisodesToResponse(season.episodes),
    }));

  const mapCastToResponse = (cast: CastAppearance[]) =>
    cast.map((appearance) => ({
      id: appearance.id,
      castMemberId: appearance.castMemberId,
      name: appearance.name,
      role: appearance.role,
      character: appearance.character,
      order: appearance.order,
      photo: appearance.photo,
    }));

  /**
   * GET /api/v1/movies
   * List all movies from database (includes extended metadata)
  */
  router.get('/movies', apiLimiter, cacheMiddleware({ cache: listCache }), (req: Request, res: Response, next: NextFunction) => {
    try {
      const allMedia = mediaRepository.listAll();
      const movies = allMedia.filter(m => m.mediaType === 'movie');

      // Map to frontend-compatible format with extended metadata (bulk thumbnail loading)
      const response = mapMediaListToResponse(movies, true, req);

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
  router.get('/movies/:id', apiLimiter, cacheMiddleware({ cache: detailCache }), (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const movie = mediaRepository.getByPlexId(id);

      if (!movie || movie.mediaType !== 'movie') {
        return next(new HttpError(404, 'Movie not found'));
      }

      const thumbnails = thumbnailRepository.listByMediaId(movie.id);
      const cast = castRepository.listByMediaId(movie.id);
      const response = {
        ...mapMediaToResponse(movie, true, req),
        thumbnails: thumbnails.map(t => t.path),
        cast: mapCastToResponse(cast),
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
   * List all series from database (includes extended metadata)
   */
  router.get('/series', apiLimiter, cacheMiddleware({ cache: listCache }), (req: Request, res: Response, next: NextFunction) => {
    try {
      const allMedia = mediaRepository.listAll();
      const series = allMedia.filter(m => m.mediaType === 'tv');

      // Map to frontend-compatible format with extended metadata (bulk thumbnail loading)
      const response = mapMediaListToResponse(series, true, req);

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
  router.get('/series/:id', apiLimiter, cacheMiddleware({ cache: detailCache }), (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const series = mediaRepository.getByPlexId(id);

      if (!series || series.mediaType !== 'tv') {
        return next(new HttpError(404, 'Series not found'));
      }

      const thumbnails = thumbnailRepository.listByMediaId(series.id);
      const seasons = seasonRepository.listByMediaIdWithEpisodes(series.id);
      const cast = castRepository.listByMediaId(series.id);
      const response = {
        ...mapMediaToResponse(series, true, req),
        thumbnails: thumbnails.map(t => t.path),
        seasons: mapSeasonsToResponse(seasons),
        cast: mapCastToResponse(cast),
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
  router.get('/stats', apiLimiter, cacheMiddleware({ cache: statsCache }), (req: Request, res: Response, next: NextFunction) => {
    try {
      const allMedia = mediaRepository.listAll();
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
  router.get('/filter', apiLimiter, cacheMiddleware({ cache: listCache }), (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate query parameters
      const validatedQuery = filterQuerySchema.parse(req.query);

      // Build filter options
      const filterOptions: any = {
        limit: validatedQuery.limit,
        offset: validatedQuery.offset,
        sortBy: validatedQuery.sortBy,
        sortOrder: validatedQuery.sortOrder,
      };

      if (validatedQuery.type) {
        filterOptions.mediaType = validatedQuery.type;
      }

      if (validatedQuery.year) {
        filterOptions.year = validatedQuery.year;
      }

      if (validatedQuery.yearFrom) {
        filterOptions.yearFrom = validatedQuery.yearFrom;
      }

      if (validatedQuery.yearTo) {
        filterOptions.yearTo = validatedQuery.yearTo;
      }

      if (validatedQuery.search) {
        filterOptions.search = validatedQuery.search;
      }

      const genres =
        validatedQuery.genres && typeof validatedQuery.genres === 'string'
          ? validatedQuery.genres
              .split(',')
              .map((entry) => entry.trim())
              .filter((entry) => entry.length > 0)
          : [];
      if (genres.length) {
        filterOptions.genres = genres;
      }

      if (validatedQuery.collection && validatedQuery.collection.trim()) {
        filterOptions.collection = validatedQuery.collection.trim();
      }

      if (parseBooleanFlag(validatedQuery.onlyNew)) {
        filterOptions.onlyNew = true;
        if (validatedQuery.newDays != null) {
          filterOptions.newDays = validatedQuery.newDays;
        }
      } else if (validatedQuery.newDays != null) {
        filterOptions.newDays = validatedQuery.newDays;
      }

      // Get filtered results and total count
      const items = mediaRepository.filter(filterOptions);
      const total = mediaRepository.count(filterOptions);

      // Map to frontend format with extended metadata (bulk thumbnail loading)
      const results = mapMediaListToResponse(items, true, req);

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
  router.get('/search', searchLimiter, cacheMiddleware({ cache: listCache }), (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate query parameters
      const validatedQuery = searchQuerySchema.parse(req.query);

      const filterOptions: any = {
        search: validatedQuery.q,
        limit: validatedQuery.limit,
        offset: 0,
        sortBy: 'title' as const,
        sortOrder: 'asc' as const,
      };

      if (validatedQuery.type) {
        filterOptions.mediaType = validatedQuery.type;
      }

      const items = mediaRepository.filter(filterOptions);
      const total = mediaRepository.count(filterOptions);

      // Map to frontend format with extended metadata (bulk thumbnail loading)
      const results = mapMediaListToResponse(items, true, req);

      res.setHeader('Cache-Control', 'public, max-age=180'); // 3 min cache
      res.json({ query: validatedQuery.q, total, results });
    } catch (error) {
      next(new HttpError(500, 'Failed to search media', { cause: error instanceof Error ? error : undefined }));
    }
  });

  /**
   * GET /api/v1/recent
   * Get recently added media
   * Query params: limit (default: 20), type (optional: 'movie' or 'tv')
   */
  router.get('/recent', apiLimiter, cacheMiddleware({ cache: statsCache }), (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate query parameters
      const validatedQuery = recentQuerySchema.parse(req.query);

      const items = mediaRepository.getRecent(validatedQuery.limit, validatedQuery.type);

      // Map to frontend format with extended metadata (bulk thumbnail loading)
      const results = mapMediaListToResponse(items, true, req);

      res.setHeader('Cache-Control', 'public, max-age=60'); // 1 min cache
      res.json({ items: results, count: results.length });
    } catch (error) {
      next(new HttpError(500, 'Failed to fetch recent media', { cause: error instanceof Error ? error : undefined }));
    }
  });

  return router;
};
