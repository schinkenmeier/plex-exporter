import { Router, type Request, type Response } from 'express';
import { createSqliteConnection } from '../db/connection.js';
import MediaRepository from '../repositories/mediaRepository.js';
import ThumbnailRepository from '../repositories/thumbnailRepository.js';
import path from 'node:path';

export const createV1Router = (): Router => {
  const router = Router();

  // Database connection
  const dbPath = process.env.SQLITE_PATH || path.join(process.cwd(), 'data', 'exports', 'plex-exporter.sqlite');
  const db = createSqliteConnection(dbPath);
  const mediaRepo = new MediaRepository(db);
  const thumbRepo = new ThumbnailRepository(db);

  /**
   * GET /api/v1/movies
   * List all movies from database
   */
  router.get('/movies', (req: Request, res: Response) => {
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
      console.error('[v1] Error fetching movies:', error);
      res.status(500).json({ error: 'Failed to fetch movies' });
    }
  });

  /**
   * GET /api/v1/movies/:id
   * Get movie details by plexId
   */
  router.get('/movies/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const movie = mediaRepo.getByPlexId(id);

      if (!movie || movie.mediaType !== 'movie') {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }

      const thumbnails = thumbRepo.listByMediaId(movie.id);

      const response = {
        ratingKey: movie.plexId,
        title: movie.title,
        year: movie.year,
        guid: movie.guid,
        summary: movie.summary,
        addedAt: movie.plexAddedAt,
        updatedAt: movie.plexUpdatedAt,
        thumbFile: thumbnails[0]?.path || null,
        thumbnails: thumbnails.map(t => t.path),
      };

      res.setHeader('Cache-Control', 'public, max-age=600'); // 10 min cache
      res.json(response);
    } catch (error) {
      console.error('[v1] Error fetching movie details:', error);
      res.status(500).json({ error: 'Failed to fetch movie details' });
    }
  });

  /**
   * GET /api/v1/series
   * List all series from database
   */
  router.get('/series', (req: Request, res: Response) => {
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
      console.error('[v1] Error fetching series:', error);
      res.status(500).json({ error: 'Failed to fetch series' });
    }
  });

  /**
   * GET /api/v1/series/:id
   * Get series details by plexId
   */
  router.get('/series/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const series = mediaRepo.getByPlexId(id);

      if (!series || series.mediaType !== 'tv') {
        res.status(404).json({ error: 'Series not found' });
        return;
      }

      const thumbnails = thumbRepo.listByMediaId(series.id);

      const response = {
        ratingKey: series.plexId,
        title: series.title,
        year: series.year,
        guid: series.guid,
        summary: series.summary,
        addedAt: series.plexAddedAt,
        updatedAt: series.plexUpdatedAt,
        thumbFile: thumbnails[0]?.path || null,
        thumbnails: thumbnails.map(t => t.path),
      };

      res.setHeader('Cache-Control', 'public, max-age=600'); // 10 min cache
      res.json(response);
    } catch (error) {
      console.error('[v1] Error fetching series details:', error);
      res.status(500).json({ error: 'Failed to fetch series details' });
    }
  });

  /**
   * GET /api/v1/stats
   * Get database statistics
   */
  router.get('/stats', (req: Request, res: Response) => {
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
      console.error('[v1] Error fetching stats:', error);
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });

  return router;
};
