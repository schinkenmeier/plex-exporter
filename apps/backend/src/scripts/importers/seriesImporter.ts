import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { SqliteDatabase } from '../../db/connection.js';
import MediaRepository from '../../repositories/mediaRepository.js';
import ThumbnailRepository from '../../repositories/thumbnailRepository.js';
import type { PlexSeriesIndex, PlexSeriesDetails, ImportResult, ImportOptions } from './types.js';
import type { Logger } from '../utils/logger.js';

export class SeriesImporter {
  private mediaRepo: MediaRepository;
  private thumbRepo: ThumbnailRepository;

  constructor(
    private db: SqliteDatabase,
    private logger: Logger,
  ) {
    this.mediaRepo = new MediaRepository(db);
    this.thumbRepo = new ThumbnailRepository(db);
  }

  async import(
    indexPath: string,
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
      this.logger.info(`Reading series index from: ${indexPath}`);
      const content = readFileSync(indexPath, 'utf-8');
      const seriesIndex: PlexSeriesIndex[] = JSON.parse(content);

      if (!Array.isArray(seriesIndex)) {
        throw new Error('Series index file must contain an array');
      }

      this.logger.info(`Found ${seriesIndex.length} series to import`);

      if (options.dryRun) {
        this.logger.warn('DRY RUN MODE - No database changes will be made');
      }

      const detailsDir = path.join(path.dirname(indexPath), 'details');

      // Pre-load details outside of transaction (sync)
      const seriesWithDetails = seriesIndex.map(series => {
        let summary: string | null = null;

        if (series.href) {
          const detailsPath = path.join(detailsDir, series.href.replace('details/', ''));
          if (existsSync(detailsPath)) {
            try {
              const detailsContent = readFileSync(detailsPath, 'utf-8');
              const details: PlexSeriesDetails = JSON.parse(detailsContent);
              summary = details.summary || null;
            } catch (detailsError) {
              this.logger.warn(`Could not load details for ${series.title}: ${detailsPath}`);
            }
          }
        }

        return { ...series, detailsSummary: summary };
      });

      // Use transaction for better performance
      const importTransaction = this.db.transaction((seriesList: typeof seriesWithDetails) => {
        for (let i = 0; i < seriesList.length; i++) {
          const series = seriesList[i];

          try {
            const plexId = String(series.ratingKey);

            // Check if series already exists
            const existing = this.mediaRepo.getByPlexId(plexId);

            if (existing && !options.force) {
              this.logger.debug(`Skipping existing series: ${series.title} (${plexId})`);
              result.skipped++;
              continue;
            }

            // Extract GUID (prefer IMDB)
            const guid = this.extractGuid(series);

            // Prepare media data
            const mediaData = {
              plexId,
              title: series.title,
              year: series.year || null,
              guid,
              summary: series.detailsSummary,
              mediaType: 'tv',
              plexAddedAt: null, // Series index doesn't have addedAt
              plexUpdatedAt: null,
            };

            if (existing && options.force) {
              // Update existing
              this.logger.debug(`Updating series: ${series.title} (${plexId})`);
              this.mediaRepo.update(existing.id, mediaData);
              result.imported++;
            } else {
              // Insert new
              this.logger.debug(`Importing series: ${series.title} (${plexId})`);
              const created = this.mediaRepo.create(mediaData);

              // Handle thumbnail
              if (series.thumbFile) {
                this.thumbRepo.replaceForMedia(created.id, [series.thumbFile]);
              }

              result.imported++;
            }

            if ((i + 1) % 5 === 0 || i + 1 === seriesList.length) {
              this.logger.progress(i + 1, seriesList.length, series.title);
            }
          } catch (error) {
            result.errors++;
            this.logger.error(`Failed to import series: ${series.title}`, error as Error);
          }
        }
      });

      if (!options.dryRun) {
        importTransaction(seriesWithDetails);
      } else {
        result.skipped = seriesIndex.length;
      }

      result.duration = Date.now() - startTime;

      this.logger.success(
        `Import completed: ${result.imported} imported, ${result.skipped} skipped, ${result.errors} errors (${result.duration}ms)`,
      );

      return result;
    } catch (error) {
      this.logger.error('Series import failed', error as Error);
      throw error;
    }
  }

  private extractGuid(series: PlexSeriesIndex): string | null {
    if (!series.ids) return null;

    // Prefer IMDB, then TMDB, then TVDB
    if (series.ids.imdb) return `imdb://${series.ids.imdb}`;
    if (series.ids.tmdb) return `tmdb://${series.ids.tmdb}`;
    if (series.ids.tvdb) return `tvdb://${series.ids.tvdb}`;

    return null;
  }
}

export const createSeriesImporter = (db: SqliteDatabase, logger: Logger): SeriesImporter => {
  return new SeriesImporter(db, logger);
};
