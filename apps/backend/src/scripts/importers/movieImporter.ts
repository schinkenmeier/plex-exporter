import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { DrizzleDatabase } from '../../db/index.js';
import MediaRepository from '../../repositories/mediaRepository.js';
import ThumbnailRepository from '../../repositories/thumbnailRepository.js';
import type { PlexMovie, ImportResult, ImportOptions } from './types.js';
import type { MediaCreateInput } from '../../repositories/mediaRepository.js';
import type { Logger } from '../utils/logger.js';

export class MovieImporter {
  private mediaRepo: MediaRepository;
  private thumbRepo: ThumbnailRepository;

  constructor(
    drizzle: DrizzleDatabase,
    private logger: Logger,
  ) {
    this.mediaRepo = new MediaRepository(drizzle);
    this.thumbRepo = new ThumbnailRepository(drizzle);
  }

  async import(
    filePath: string,
    options: ImportOptions = {},
  ): Promise<ImportResult> {
    const startTime = Date.now();
    const result: ImportResult = {
      imported: 0,
      skipped: 0,
      errors: 0,
      duration: 0,
    };

    try {
      this.logger.info(`Reading movies from: ${filePath}`);
      const content = await readFile(filePath, 'utf-8');
      const movies: PlexMovie[] = JSON.parse(content);

      if (!Array.isArray(movies)) {
        throw new Error('Movies file must contain an array');
      }

      this.logger.info(`Found ${movies.length} movies to import`);

      if (options.dryRun) {
        this.logger.warn('DRY RUN MODE - No database changes will be made');
      }

      if (!options.dryRun) {
        for (let i = 0; i < movies.length; i++) {
          const movie = movies[i];

          try {
            const plexId = String(movie.ratingKey);

            const existing = this.mediaRepo.getByPlexId(plexId);

            if (existing && !options.force) {
              this.logger.debug(`Skipping existing movie: ${movie.title} (${plexId})`);
              result.skipped++;
              continue;
            }

            const guid = this.extractGuid(movie);

            const mediaData: MediaCreateInput = {
              plexId,
              title: movie.title,
              year: movie.year || null,
              guid,
              summary: movie.summary || null,
              mediaType: 'movie',
              plexAddedAt: movie.addedAt,
              plexUpdatedAt: null,
              genres: movie.genres?.map((g) => g.tag).filter(Boolean) || null,
              directors: movie.directors?.map((d) => d.tag).filter(Boolean) || null,
              countries: movie.countries?.map((c) => c.tag).filter(Boolean) || null,
              collections: movie.collections?.map((c) => c.tag).filter(Boolean) || null,
              rating: movie.rating || null,
              audienceRating: movie.audienceRating || null,
              contentRating: movie.contentRating || null,
              studio: movie.studio || null,
              tagline: movie.tagline || null,
              duration: movie.duration || null,
              originallyAvailableAt: movie.originallyAvailableAt || null,
            };

            if (existing && options.force) {
              this.logger.debug(`Updating movie: ${movie.title} (${plexId})`);
              this.mediaRepo.update(existing.id, mediaData);
              result.imported++;
            } else {
              this.logger.debug(`Importing movie: ${movie.title} (${plexId})`);
              const created = this.mediaRepo.create(mediaData);

              if (movie.thumbFile) {
                this.thumbRepo.replaceForMedia(created.id, [movie.thumbFile]);
              }

              result.imported++;
            }

            if ((i + 1) % 10 === 0 || i + 1 === movies.length) {
              this.logger.progress(i + 1, movies.length, movie.title);
            }
          } catch (error) {
            result.errors++;
            this.logger.error(`Failed to import movie: ${movie.title}`, error as Error);
          }
        }
      } else {
        result.skipped = movies.length;
      }

      result.duration = Date.now() - startTime;

      this.logger.success(
        `Import completed: ${result.imported} imported, ${result.skipped} skipped, ${result.errors} errors (${result.duration}ms)`,
      );

      return result;
    } catch (error) {
      this.logger.error('Movie import failed', error as Error);
      throw error;
    }
  }

  private extractGuid(movie: PlexMovie): string | null {
    // Try guids array first (newer Plex format)
    if (movie.guids && Array.isArray(movie.guids) && movie.guids.length > 0) {
      return movie.guids[0].id;
    }

    // Fall back to guid field
    if (movie.guid) {
      return movie.guid;
    }

    return null;
  }
}

export const createMovieImporter = (
  drizzle: DrizzleDatabase,
  logger: Logger,
): MovieImporter => {
  return new MovieImporter(drizzle, logger);
};
