import type { TautulliService, TautulliMetadata, TautulliMediaItem } from './tautulliService.js';
import type { MediaRecord, MediaRepository } from '../repositories/mediaRepository.js';
import type { SeasonRepository } from '../repositories/seasonRepository.js';
import type { LibrarySectionRepository } from '../repositories/librarySectionRepository.js';
import type { TmdbService, TmdbHeroDetails } from './tmdbService.js';
import type { ImageStorageService } from './imageStorageService.js';
import { normalizeTimestamp } from '../utils/timestamps.js';
import logger from './logger.js';

export interface SyncOptions {
  incremental?: boolean;
  enrichWithTmdb?: boolean;
  syncCovers?: boolean;
  refreshMediaInfo?: boolean;
}

export interface SyncProgress {
  phase: string;
  current: number;
  total: number;
  percentage: number;
}

export interface SyncResult {
  librarySection: string;
  sectionId: number;
  mediaType: 'movie' | 'tv';
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
  errors: string[];
  duration: number;
}

export interface SyncStats {
  totalCreated: number;
  totalUpdated: number;
  totalDeleted: number;
  totalSkipped: number;
  totalErrors: number;
  results: SyncResult[];
  startTime: number;
  endTime: number;
  duration: number;
}

type ProgressCallback = (progress: SyncProgress) => void;

export class TautulliSyncService {
  constructor(
    private readonly tautulliService: TautulliService,
    private readonly mediaRepo: MediaRepository,
    private readonly seasonRepo: SeasonRepository,
    private readonly librarySectionRepo: LibrarySectionRepository,
    private readonly tmdbService?: TmdbService,
    private readonly imageStorageService?: ImageStorageService,
  ) {}

  /**
   * Sync all enabled library sections
   */
  async syncAll(
    options: SyncOptions = {},
    onProgress?: ProgressCallback,
  ): Promise<SyncStats> {
    const startTime = Date.now();
    const enabledSections = this.librarySectionRepo.listEnabled();

    if (enabledSections.length === 0) {
      throw new Error('No enabled library sections found. Please configure library sections first.');
    }

    const results: SyncResult[] = [];

    for (let i = 0; i < enabledSections.length; i++) {
      const section = enabledSections[i];

      onProgress?.({
        phase: `Syncing ${section.sectionName}`,
        current: i + 1,
        total: enabledSections.length,
        percentage: Math.round(((i + 1) / enabledSections.length) * 100),
      });

      try {
        const result = await this.syncLibrarySection(section.sectionId, options, onProgress);
        results.push(result);

        if (result.errors.length === 0) {
          this.librarySectionRepo.updateLastSynced(section.id, new Date().toISOString());
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({
          librarySection: section.sectionName,
          sectionId: section.sectionId,
          mediaType: section.sectionType === 'show' ? 'tv' : 'movie',
          created: 0,
          updated: 0,
          deleted: 0,
          skipped: 0,
          errors: [errorMessage],
          duration: 0,
        });
      }
    }

    const endTime = Date.now();

    return {
      totalCreated: results.reduce((sum, r) => sum + r.created, 0),
      totalUpdated: results.reduce((sum, r) => sum + r.updated, 0),
      totalDeleted: results.reduce((sum, r) => sum + r.deleted, 0),
      totalSkipped: results.reduce((sum, r) => sum + r.skipped, 0),
      totalErrors: results.reduce((sum, r) => sum + r.errors.length, 0),
      results,
      startTime,
      endTime,
      duration: endTime - startTime,
    };
  }

  /**
   * Sync a specific library section
   */
  async syncLibrarySection(
    sectionId: number,
    options: SyncOptions = {},
    onProgress?: ProgressCallback,
  ): Promise<SyncResult> {
    const startTime = Date.now();
    const section = this.librarySectionRepo.getBySectionId(sectionId);

    if (!section) {
      throw new Error(`Library section with ID ${sectionId} not found`);
    }

    const errors: string[] = [];
    let created = 0;
    let updated = 0;
    let deleted = 0;
    let skipped = 0;

    try {
      // Fetch all media from Tautulli for this library
      const mediaItems = await this.fetchAllMediaFromLibrary(sectionId, options, onProgress);

      onProgress?.({
        phase: `Processing ${mediaItems.length} items from ${section.sectionName}`,
        current: 0,
        total: mediaItems.length,
        percentage: 0,
      });

      // Sync based on media type
      if (section.sectionType === 'movie') {
        const result = await this.syncMovies(mediaItems, sectionId, options, onProgress);
        created = result.created;
        updated = result.updated;
        skipped = result.skipped;
        errors.push(...result.errors);
      } else if (section.sectionType === 'show') {
        const result = await this.syncSeries(mediaItems, sectionId, options, onProgress);
        created = result.created;
        updated = result.updated;
        skipped = result.skipped;
        errors.push(...result.errors);
      }

      if (errors.length === 0) {
        const tautulliIds = mediaItems.map((item) => item.rating_key);
        deleted = await this.deleteRemovedMedia(sectionId, tautulliIds);
      } else {
        logger.warn('Skipping deletion because sync reported errors', {
          namespace: 'tautulli-sync',
          sectionId,
          errorCount: errors.length,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(errorMessage);
    }

    return {
      librarySection: section.sectionName,
      sectionId,
      mediaType: section.sectionType === 'show' ? 'tv' : 'movie',
      created,
      updated,
      deleted,
      skipped,
      errors,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Fetch all media items from a library (handles pagination)
   */
  private async fetchAllMediaFromLibrary(
    sectionId: number,
    options: SyncOptions = {},
    onProgress?: ProgressCallback,
  ): Promise<TautulliMediaItem[]> {
    const allMedia: TautulliMediaItem[] = [];
    const seenRatingKeys = new Set<string>();
    let start = 0;
    const length = 1000; // Fetch in batches of 1000 (more efficient)
    let hasMore = true;
    const shouldRefresh = options.refreshMediaInfo ?? true;
    let expectedTotal: number | null = null;

    logger.info('Starting to fetch media from library section', { namespace: 'tautulli-sync', sectionId });

    while (hasMore) {
      onProgress?.({
        phase: `Fetching media list (${allMedia.length} fetched so far)`,
        current: start,
        total: start + length,
        percentage: 0,
      });

      const page = await this.tautulliService.getLibraryMediaPage(
        sectionId,
        start,
        length,
        shouldRefresh && start === 0,
      );
      const batch = page.items;
      expectedTotal = Number.isFinite(page.recordsFiltered) ? page.recordsFiltered : expectedTotal;

      logger.debug('Fetched Tautulli media batch', {
        namespace: 'tautulli-sync',
        sectionId,
        start,
        length,
        received: batch.length,
        expectedTotal,
      });

      if (batch.length === 0) {
        logger.debug('No more items to fetch', { namespace: 'tautulli-sync', sectionId });
        hasMore = false;
      } else {
        for (const item of batch) {
          const key = String(item.rating_key || '');
          if (!key || seenRatingKeys.has(key)) {
            continue;
          }
          seenRatingKeys.add(key);
          allMedia.push(item);
        }

        // Advance by the amount actually returned to avoid gaps when the API caps page size.
        start += batch.length;

        if (expectedTotal !== null) {
          hasMore = allMedia.length < expectedTotal;
          if (!hasMore) {
            logger.debug('Reached expected media total', {
              namespace: 'tautulli-sync',
              sectionId,
              total: allMedia.length,
              expectedTotal,
            });
          }
        } else if (batch.length < length) {
          logger.debug('Last media batch received', {
            namespace: 'tautulli-sync',
            sectionId,
            batchLength: batch.length,
            requestedLength: length,
          });
          hasMore = false;
        }
      }
    }

    logger.info('Finished fetching media from Tautulli', {
      namespace: 'tautulli-sync',
      sectionId,
      count: allMedia.length,
    });
    return allMedia;
  }

  /**
   * Sync movies from Tautulli
   */
  private async syncMovies(
    mediaItems: TautulliMediaItem[],
    sectionId: number,
    options: SyncOptions,
    onProgress?: ProgressCallback,
  ): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> {
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    logger.info('Starting movie sync', { namespace: 'tautulli-sync', count: mediaItems.length });

    for (let i = 0; i < mediaItems.length; i++) {
      const item = mediaItems[i];

      onProgress?.({
        phase: `Processing movie: ${item.title}`,
        current: i + 1,
        total: mediaItems.length,
        percentage: Math.round(((i + 1) / mediaItems.length) * 100),
      });

      try {
        // Get detailed metadata
        let metadata = await this.tautulliService.getMetadata(item.rating_key);

        // Fallback: If metadata is incomplete, use data from the list item
        if (!metadata.title || !metadata.rating_key) {
          logger.warn('Incomplete movie metadata, using list data fallback', {
            namespace: 'tautulli-sync',
            title: item.title,
            ratingKey: item.rating_key,
          });
          metadata = item as unknown as TautulliMetadata;
        }

        // Check if already exists
        const existing = this.mediaRepo.getByPlexId(item.rating_key);

        // Skip if incremental and not changed
        const normalizedMetadataUpdatedAt = normalizeTimestamp(metadata.updated_at);
        const needsUserUiTmdbBackfill =
          options.enrichWithTmdb &&
          this.tmdbService &&
          existing?.tmdbEnriched &&
          (!existing.languages?.length ||
            !existing.originalLanguage ||
            !existing.trailerYoutubeId);
        if (
          options.incremental &&
          existing &&
          existing.plexUpdatedAt &&
          normalizedMetadataUpdatedAt &&
          existing.plexUpdatedAt === normalizedMetadataUpdatedAt &&
          !needsUserUiTmdbBackfill
        ) {
          skipped++;
          continue;
        }

        const mediaData = this.mapTautulliToMediaItem(metadata, 'movie', sectionId, item.rating_key);

        // Download images from Tautulli first (if syncCovers is enabled)
        if (options.syncCovers) {
          try {
            const downloadedImages = await this.downloadTautulliImages(
              metadata,
              'movie',
              item.rating_key,
              options.syncCovers,
            );
            // Override poster/backdrop with local paths if downloaded
            if (downloadedImages.poster) {
              mediaData.poster = downloadedImages.poster;
            }
            if (downloadedImages.backdrop) {
              mediaData.backdrop = downloadedImages.backdrop;
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.warn('Image download failed for movie', {
              namespace: 'tautulli-sync',
              title: item.title,
              error: errorMessage,
            });
            // Continue without images
          }
        }

        // Enrich with TMDB if requested (after images are downloaded from Tautulli)
        if (options.enrichWithTmdb && this.tmdbService && metadata.guid) {
          try {
            const tmdbData = await this.enrichWithTmdb(metadata, 'movie');
            if (tmdbData) {
              // Only override poster/backdrop if TMDb provides them and we don't have local ones
              if (tmdbData.poster && !mediaData.poster) {
                mediaData.poster = tmdbData.poster;
              }
              if (tmdbData.backdrop && !mediaData.backdrop) {
                mediaData.backdrop = tmdbData.backdrop;
              }
              // Update other TMDb fields
              if (tmdbData.tmdbId !== undefined) mediaData.tmdbId = tmdbData.tmdbId;
              if (tmdbData.tmdbRating !== undefined) mediaData.tmdbRating = tmdbData.tmdbRating;
              if (tmdbData.tmdbVoteCount !== undefined) mediaData.tmdbVoteCount = tmdbData.tmdbVoteCount;
              if (tmdbData.languages !== undefined) mediaData.languages = tmdbData.languages;
              if (tmdbData.originalLanguage !== undefined) mediaData.originalLanguage = tmdbData.originalLanguage;
              if (tmdbData.trailerYoutubeId !== undefined) mediaData.trailerYoutubeId = tmdbData.trailerYoutubeId;
              if (tmdbData.trailerSite !== undefined) mediaData.trailerSite = tmdbData.trailerSite;
              if (tmdbData.trailerName !== undefined) mediaData.trailerName = tmdbData.trailerName;
              if (tmdbData.trailerUrl !== undefined) mediaData.trailerUrl = tmdbData.trailerUrl;
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.warn('TMDb enrichment failed for movie', {
              namespace: 'tautulli-sync',
              title: item.title,
              ratingKey: item.rating_key,
              error: errorMessage,
            });
            errors.push(`TMDb enrichment failed for ${item.title}: ${errorMessage}`);
            // Continue with Tautulli data
          }
        }

        if (existing) {
          this.mediaRepo.update(existing.id, {
            ...mediaData,
            lastSyncedAt: new Date().toISOString(),
          });
          updated++;
        } else {
          this.mediaRepo.create({
            ...mediaData,
            lastSyncedAt: new Date().toISOString(),
          });
          created++;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to sync movie', {
          namespace: 'tautulli-sync',
          title: item.title,
          ratingKey: item.rating_key,
          error: errorMessage,
        });
        errors.push(`Failed to sync movie ${item.title}: ${errorMessage}`);
      }
    }

    logger.info('Movie sync completed', {
      namespace: 'tautulli-sync',
      total: mediaItems.length,
      created,
      updated,
      skipped,
      errorCount: errors.length,
    });

    return { created, updated, skipped, errors };
  }

  /**
   * Sync TV series from Tautulli
   */
  private async syncSeries(
    mediaItems: TautulliMediaItem[],
    sectionId: number,
    options: SyncOptions,
    onProgress?: ProgressCallback,
  ): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> {
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    logger.info('Starting TV series sync', { namespace: 'tautulli-sync', count: mediaItems.length });

    for (let i = 0; i < mediaItems.length; i++) {
      const item = mediaItems[i];

      onProgress?.({
        phase: `Processing series: ${item.title}`,
        current: i + 1,
        total: mediaItems.length,
        percentage: Math.round(((i + 1) / mediaItems.length) * 100),
      });

      try {
        // Get detailed metadata for the show
        let metadata = await this.tautulliService.getMetadata(item.rating_key);

        // Fallback: If metadata is incomplete, use data from the list item
        if (!metadata.title || !metadata.rating_key) {
          logger.warn('Incomplete series metadata, using list data fallback', {
            namespace: 'tautulli-sync',
            title: item.title,
            ratingKey: item.rating_key,
          });
          metadata = item as unknown as TautulliMetadata;
        }

        // Check if already exists
        const existing = this.mediaRepo.getByPlexId(item.rating_key);

        // Skip if incremental and not changed
        const normalizedMetadataUpdatedAt = normalizeTimestamp(metadata.updated_at);
        const needsUserUiTmdbBackfill =
          options.enrichWithTmdb &&
          this.tmdbService &&
          existing?.tmdbEnriched &&
          (!existing.languages?.length ||
            !existing.originalLanguage ||
            !existing.trailerYoutubeId);
        if (
          options.incremental &&
          existing &&
          existing.plexUpdatedAt &&
          normalizedMetadataUpdatedAt &&
          existing.plexUpdatedAt === normalizedMetadataUpdatedAt &&
          !needsUserUiTmdbBackfill
        ) {
          skipped++;
          continue;
        }

        const mediaData = this.mapTautulliToMediaItem(metadata, 'tv', sectionId, item.rating_key);

        // Download images from Tautulli first (if syncCovers is enabled)
        if (options.syncCovers) {
          try {
            const downloadedImages = await this.downloadTautulliImages(
              metadata,
              'tv',
              item.rating_key,
              options.syncCovers,
            );
            // Override poster/backdrop with local paths if downloaded
            if (downloadedImages.poster) {
              mediaData.poster = downloadedImages.poster;
            }
            if (downloadedImages.backdrop) {
              mediaData.backdrop = downloadedImages.backdrop;
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.warn('Image download failed for series', {
              namespace: 'tautulli-sync',
              title: item.title,
              error: errorMessage,
            });
            // Continue without images
          }
        }

        // Enrich with TMDB if requested (after images are downloaded from Tautulli)
        if (options.enrichWithTmdb && this.tmdbService && metadata.guid) {
          try {
            const tmdbData = await this.enrichWithTmdb(metadata, 'tv');
            if (tmdbData) {
              // Only override poster/backdrop if TMDb provides them and we don't have local ones
              if (tmdbData.poster && !mediaData.poster) {
                mediaData.poster = tmdbData.poster;
              }
              if (tmdbData.backdrop && !mediaData.backdrop) {
                mediaData.backdrop = tmdbData.backdrop;
              }
              // Update other TMDb fields
              if (tmdbData.tmdbId !== undefined) mediaData.tmdbId = tmdbData.tmdbId;
              if (tmdbData.tmdbRating !== undefined) mediaData.tmdbRating = tmdbData.tmdbRating;
              if (tmdbData.tmdbVoteCount !== undefined) mediaData.tmdbVoteCount = tmdbData.tmdbVoteCount;
              if (tmdbData.languages !== undefined) mediaData.languages = tmdbData.languages;
              if (tmdbData.originalLanguage !== undefined) mediaData.originalLanguage = tmdbData.originalLanguage;
              if (tmdbData.trailerYoutubeId !== undefined) mediaData.trailerYoutubeId = tmdbData.trailerYoutubeId;
              if (tmdbData.trailerSite !== undefined) mediaData.trailerSite = tmdbData.trailerSite;
              if (tmdbData.trailerName !== undefined) mediaData.trailerName = tmdbData.trailerName;
              if (tmdbData.trailerUrl !== undefined) mediaData.trailerUrl = tmdbData.trailerUrl;
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.warn('TMDb enrichment failed for series', {
              namespace: 'tautulli-sync',
              title: item.title,
              ratingKey: item.rating_key,
              error: errorMessage,
            });
            errors.push(`TMDb enrichment failed for ${item.title}: ${errorMessage}`);
            // Continue with Tautulli data
          }
        }

        let mediaItemId: number;

        if (existing) {
          this.mediaRepo.update(existing.id, {
            ...mediaData,
            lastSyncedAt: new Date().toISOString(),
          });
          mediaItemId = existing.id;
          updated++;
        } else {
          const newMedia = this.mediaRepo.create({
            ...mediaData,
            lastSyncedAt: new Date().toISOString(),
          });
          mediaItemId = newMedia.id;
          created++;
        }

        // Sync seasons and episodes
        const seasonErrors = await this.syncSeasonsAndEpisodes(
          item.rating_key,
          mediaItemId,
          options,
          onProgress,
        );
        errors.push(...seasonErrors.map((message) => `Failed to sync series ${item.title}: ${message}`));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to sync series', {
          namespace: 'tautulli-sync',
          title: item.title,
          ratingKey: item.rating_key,
          error: errorMessage,
        });
        errors.push(`Failed to sync series ${item.title}: ${errorMessage}`);
      }
    }

    logger.info('TV series sync completed', {
      namespace: 'tautulli-sync',
      total: mediaItems.length,
      created,
      updated,
      skipped,
      errorCount: errors.length,
    });

    return { created, updated, skipped, errors };
  }

  /**
   * Sync seasons and episodes for a TV show
   */
  private async syncSeasonsAndEpisodes(
    showRatingKey: string,
    mediaItemId: number,
    options: SyncOptions = {},
    onProgress?: ProgressCallback,
  ): Promise<string[]> {
    // Get all seasons
    const seasons = await this.tautulliService.getSeasons(showRatingKey);

    const reportedSeasonKeys = new Set<string>();
    const reportedEpisodeKeys = new Set<string>();
    const seasonsWithEpisodeSyncFailure = new Set<number>();
    const errors: string[] = [];

    for (const seasonMetadata of seasons) {
      onProgress?.({
        phase: `Processing Season ${seasonMetadata.media_index}`,
        current: 0,
        total: seasons.length,
        percentage: 0,
      });

      let seasonId: number | undefined;

      try {
        reportedSeasonKeys.add(seasonMetadata.rating_key);
        // Check if season exists
        const existingSeason = this.seasonRepo.getByTautulliId(seasonMetadata.rating_key);

        let seasonPoster = this.convertTautulliThumbnailUrl(seasonMetadata.thumb) ?? null;

        if (options.syncCovers && this.imageStorageService && seasonMetadata.thumb) {
          const posterInfo = this.parseTautulliImageUrl(seasonMetadata.thumb);

          if (posterInfo) {
            const posterPath = this.imageStorageService.getSeasonImagePath(
              showRatingKey,
              seasonMetadata.rating_key,
            );

            try {
              const downloadResult = await this.imageStorageService.downloadImage({
                ratingKey: posterInfo.id,
                type: posterInfo.type,
                timestamp: posterInfo.timestamp,
                targetPath: posterPath,
                mediaType: 'tv',
                category: 'season',
                seasonRatingKey: seasonMetadata.rating_key,
              });

              if (downloadResult.success && downloadResult.localPath) {
                seasonPoster = downloadResult.localPath;
              } else if (!downloadResult.success && downloadResult.error) {
                logger.warn('Season image download unsuccessful', {
                  namespace: 'tautulli-sync',
                  title: seasonMetadata.title,
                  ratingKey: seasonMetadata.rating_key,
                  error: downloadResult.error,
                });
              }
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              logger.warn('Season image download failed', {
                namespace: 'tautulli-sync',
                title: seasonMetadata.title,
                ratingKey: seasonMetadata.rating_key,
                error: errorMessage,
              });
            }
          }
        }

        const seasonData = {
          mediaItemId,
          tautulliId: seasonMetadata.rating_key,
          seasonNumber: seasonMetadata.media_index ?? 0,
          title: seasonMetadata.title,
          summary: seasonMetadata.summary,
          poster: seasonPoster,
          episodeCount: 0, // Will be updated after episodes
        };

        const resolvedSeasonId = existingSeason
          ? this.seasonRepo.update(existingSeason.id, seasonData)?.id ?? existingSeason.id
          : this.seasonRepo.create(seasonData).id;

        seasonId = resolvedSeasonId;

        // Get all episodes for this season
        const episodes = await this.tautulliService.getEpisodes(seasonMetadata.rating_key);

        // Update episode count
        this.seasonRepo.update(resolvedSeasonId, { episodeCount: episodes.length });

        // Sync episodes
        for (const episodeMetadata of episodes) {
          try {
            reportedEpisodeKeys.add(episodeMetadata.rating_key);
            const existingEpisode = this.seasonRepo.getEpisodeByTautulliId(episodeMetadata.rating_key);

            let episodeThumb = this.convertTautulliThumbnailUrl(episodeMetadata.thumb) ?? null;

            if (options.syncCovers && this.imageStorageService && episodeMetadata.thumb) {
              const thumbInfo = this.parseTautulliImageUrl(episodeMetadata.thumb);

              if (thumbInfo) {
                const thumbPath = this.imageStorageService.getEpisodeImagePath(
                  showRatingKey,
                  seasonMetadata.rating_key,
                  episodeMetadata.rating_key,
                );

                try {
                  const downloadResult = await this.imageStorageService.downloadImage({
                    ratingKey: thumbInfo.id,
                    type: thumbInfo.type,
                    timestamp: thumbInfo.timestamp,
                    targetPath: thumbPath,
                    mediaType: 'tv',
                    category: 'episode',
                    seasonRatingKey: seasonMetadata.rating_key,
                    episodeRatingKey: episodeMetadata.rating_key,
                  });

                  if (downloadResult.success && downloadResult.localPath) {
                    episodeThumb = downloadResult.localPath;
                  } else if (!downloadResult.success && downloadResult.error) {
                    logger.warn('Episode image download unsuccessful', {
                      namespace: 'tautulli-sync',
                      title: episodeMetadata.title,
                      ratingKey: episodeMetadata.rating_key,
                      error: downloadResult.error,
                    });
                  }
                } catch (error) {
                  const errorMessage = error instanceof Error ? error.message : String(error);
                  logger.warn('Episode image download failed', {
                    namespace: 'tautulli-sync',
                    title: episodeMetadata.title,
                    ratingKey: episodeMetadata.rating_key,
                    error: errorMessage,
                  });
                }
              }
            }

            const episodeData = {
              seasonId: resolvedSeasonId,
              tautulliId: episodeMetadata.rating_key,
              episodeNumber: episodeMetadata.media_index ?? 0,
              title: episodeMetadata.title,
              summary: episodeMetadata.summary,
              duration: episodeMetadata.duration,
              rating: episodeMetadata.rating?.toString(),
              airDate: episodeMetadata.originally_available_at,
              thumb: episodeThumb,
            };

            if (existingEpisode) {
              this.seasonRepo.updateEpisode(existingEpisode.id, episodeData);
            } else {
              this.seasonRepo.createEpisode(episodeData);
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            errors.push(
              `Episode sync failed for "${episodeMetadata.title}" (rating_key: ${episodeMetadata.rating_key}): ${errorMessage}`,
            );
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(
          `Season sync failed for "${seasonMetadata.title}" (rating_key: ${seasonMetadata.rating_key}): ${errorMessage}`,
        );
        if (seasonId !== undefined) {
          seasonsWithEpisodeSyncFailure.add(seasonId);
        }
      }
    }

    // Delete episodes not reported by Tautulli anymore
    const existingEpisodes = this.seasonRepo.listEpisodeIdentifiersByMediaId(mediaItemId);
    for (const episode of existingEpisodes) {
      if (seasonsWithEpisodeSyncFailure.has(episode.seasonId)) {
        continue;
      }
      if (!reportedEpisodeKeys.has(episode.tautulliId)) {
        this.seasonRepo.deleteEpisodeById(episode.id);
      }
    }

    // Delete seasons not reported by Tautulli anymore
    const existingSeasons = this.seasonRepo.listSeasonIdentifiersByMediaId(mediaItemId);
    for (const season of existingSeasons) {
      if (!reportedSeasonKeys.has(season.tautulliId)) {
        this.seasonRepo.deleteSeasonById(season.id);
      }
    }

    return errors;
  }

  /**
   * Delete media items that no longer exist in Tautulli
   */
  private async deleteRemovedMedia(sectionId: number, currentTautulliIds: string[]): Promise<number> {
    const currentIdSet = new Set(currentTautulliIds.filter(Boolean));
    const existingMedia = this.mediaRepo.filter({
      librarySectionId: sectionId,
      limit: 10000, // Fetch all for deletion check
    });

    let deleted = 0;

    for (const media of existingMedia) {
      if (!currentIdSet.has(media.plexId)) {
        await this.removeMediaAssets(media);
        this.mediaRepo.delete(media.id);
        deleted++;
      }
    }

    return deleted;
  }

  private async removeMediaAssets(media: MediaRecord): Promise<void> {
    if (!this.imageStorageService) {
      return;
    }

    try {
      await this.imageStorageService.removeMediaAssets(media.mediaType, media.plexId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('Failed to delete stored images', {
        namespace: 'tautulli-sync',
        title: media.title,
        plexId: media.plexId,
        error: message,
      });
    }
  }

  private convertTautulliThumbnailUrl(tautulliUrl?: string | null): string | undefined {
    if (!tautulliUrl) return undefined;

    let normalized = tautulliUrl;

    if (!normalized.startsWith('/')) {
      try {
        const parsed = new URL(normalized, this.tautulliService.getBaseUrl());
        normalized = parsed.pathname + (parsed.search ?? '');
      } catch {
        normalized = tautulliUrl;
      }
    }

    const match = normalized.match(/\/library\/metadata\/(\d+)\/(thumb|art)\/(\d+)/);
    if (match) {
      const [, id, type, timestamp] = match;
      return `/api/thumbnails/tautulli/library/metadata/${id}/${type}/${timestamp}`;
    }

    return tautulliUrl;
  }

  /**
   * Map Tautulli metadata to media item format
   */
  private mapTautulliToMediaItem(
    metadata: TautulliMetadata,
    type: 'movie' | 'tv',
    sectionId: number,
    ratingKey?: string,
  ): {
    plexId: string;
    mediaType: 'movie' | 'tv';
    title: string;
    sortTitle?: string;
    year?: number;
    rating?: number;
    contentRating?: string;
    summary?: string;
    tagline?: string;
    duration?: number;
    poster?: string;
    backdrop?: string;
    studio?: string;
    librarySectionId: number;
    genres?: string[];
    directors?: string[];
    writers?: string[];
    countries?: string[];
    collections?: string[];
    audienceRating?: number;
    originallyAvailableAt?: string;
    guid?: string;
    plexAddedAt?: string;
    plexUpdatedAt?: string;
    tmdbId?: number;
    imdbId?: string;
    tmdbRating?: number;
    tmdbVoteCount?: number;
    languages?: string[];
    originalLanguage?: string;
    trailerYoutubeId?: string;
    trailerSite?: string;
    trailerName?: string;
    trailerUrl?: string;
    addedAt?: string;
  } {
    const posterUrl = this.convertTautulliThumbnailUrl(metadata.thumb);
    const backdropUrl = this.convertTautulliThumbnailUrl(metadata.art);

    // Extract IDs from GUID
    const ids = this.extractIdsFromGuid(metadata.guid);
    const normalizedAddedAt = normalizeTimestamp(metadata.added_at);
    const normalizedUpdatedAt = normalizeTimestamp(metadata.updated_at);

    return {
      plexId: ratingKey || metadata.rating_key,
      mediaType: type,
      title: metadata.title,
      sortTitle: metadata.sort_title,
      year: metadata.year,
      rating: metadata.rating,
      contentRating: metadata.content_rating,
      summary: metadata.summary,
      tagline: metadata.tagline,
      duration: metadata.duration,
      poster: posterUrl,
      backdrop: backdropUrl,
      studio: metadata.studio,
      librarySectionId: sectionId,
      genres: metadata.genres,
      directors: metadata.directors,
      writers: metadata.writers,
      countries: metadata.countries,
      collections: metadata.collections,
      audienceRating: metadata.audience_rating,
      originallyAvailableAt: metadata.originally_available_at,
      guid: metadata.guid,
      plexAddedAt: normalizedAddedAt ?? metadata.added_at?.toString(),
      plexUpdatedAt: normalizedUpdatedAt ?? metadata.updated_at?.toString(),
      addedAt: normalizedAddedAt ?? metadata.added_at?.toString(),
      tmdbId: ids.tmdbId,
      imdbId: ids.imdbId,
    };
  }

  /**
   * Download images from Tautulli and store them locally
   */
  private async downloadTautulliImages(
    metadata: TautulliMetadata,
    mediaType: 'movie' | 'tv',
    ratingKey: string,
    syncCovers?: boolean,
  ): Promise<{ poster?: string; backdrop?: string }> {
    if (!this.imageStorageService) {
      logger.warn('ImageStorageService not available', { namespace: 'tautulli-sync', ratingKey });
      return {};
    }
    if (!syncCovers) {
      logger.debug('syncCovers disabled, skipping image download', { namespace: 'tautulli-sync', ratingKey });
      return {};
    }
    logger.debug('Starting Tautulli image download', {
      namespace: 'tautulli-sync',
      title: metadata.title,
      ratingKey,
    });
    const result: { poster?: string; backdrop?: string } = {};
    const downloadItems: Array<{
      ratingKey: string;
      type: 'thumb' | 'art';
      timestamp: string;
      targetPath: string;
      mediaType: 'movie' | 'tv';
    }> = [];
    const targetToAssetType = new Map<string, 'poster' | 'backdrop'>();

    // Parse poster URL
    if (metadata.thumb) {
      logger.debug('Parsing poster URL', { namespace: 'tautulli-sync', ratingKey });
      const posterInfo = this.parseTautulliImageUrl(metadata.thumb);
      if (posterInfo) {
        const posterPath = this.imageStorageService.getMediaImagePath(mediaType, ratingKey, 'poster');
        logger.debug('Resolved poster download path', {
          namespace: 'tautulli-sync',
          ratingKey,
          posterPath,
          metadataId: posterInfo.id,
          timestamp: posterInfo.timestamp,
        });
        downloadItems.push({
          ratingKey: posterInfo.id,
          type: posterInfo.type,
          timestamp: posterInfo.timestamp,
          targetPath: posterPath,
          mediaType,
        });
        targetToAssetType.set(posterPath, 'poster');
      } else {
        logger.warn('Could not parse poster URL', { namespace: 'tautulli-sync', ratingKey });
      }
    } else {
      logger.debug('No poster URL found', { namespace: 'tautulli-sync', ratingKey });
    }

    // Parse backdrop URL
    if (metadata.art) {
      logger.debug('Parsing backdrop URL', { namespace: 'tautulli-sync', ratingKey });
      const backdropInfo = this.parseTautulliImageUrl(metadata.art);
      if (backdropInfo) {
        const backdropPath = this.imageStorageService.getMediaImagePath(mediaType, ratingKey, 'backdrop');
        logger.debug('Resolved backdrop download path', {
          namespace: 'tautulli-sync',
          ratingKey,
          backdropPath,
          metadataId: backdropInfo.id,
          timestamp: backdropInfo.timestamp,
        });
        downloadItems.push({
          ratingKey: backdropInfo.id,
          type: backdropInfo.type,
          timestamp: backdropInfo.timestamp,
          targetPath: backdropPath,
          mediaType,
        });
        targetToAssetType.set(backdropPath, 'backdrop');
      } else {
        logger.warn('Could not parse backdrop URL', { namespace: 'tautulli-sync', ratingKey });
      }
    } else {
      logger.debug('No backdrop URL found', { namespace: 'tautulli-sync', ratingKey });
    }

    // Download images in batch
    if (downloadItems.length > 0) {
      logger.debug('Downloading Tautulli images', {
        namespace: 'tautulli-sync',
        ratingKey,
        count: downloadItems.length,
      });
      try {
        const downloadResults = await this.imageStorageService.downloadBatch(downloadItems);
        logger.debug('Tautulli image download results received', {
          namespace: 'tautulli-sync',
          ratingKey,
          count: downloadResults.length,
        });

        for (const downloadResult of downloadResults) {
          const assetType = targetToAssetType.get(downloadResult.targetPath);
          if (!assetType) {
            continue;
          }

          if (downloadResult.success && downloadResult.localPath) {
            if (assetType === 'poster') {
              result.poster = downloadResult.localPath;
            } else if (assetType === 'backdrop') {
              result.backdrop = downloadResult.localPath;
            }
          } else if (!downloadResult.success) {
            logger.warn('Failed to download image asset', {
              namespace: 'tautulli-sync',
              assetType,
              title: metadata.title,
              ratingKey,
              error: downloadResult.error ?? 'Unknown error',
            });
          }
        }

        logger.debug('Completed image download evaluation', { namespace: 'tautulli-sync', ratingKey });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Failed to download images', { namespace: 'tautulli-sync', ratingKey, error: errorMessage });
        logger.warn('Falling back to Tautulli-hosted images', {
          namespace: 'tautulli-sync',
          title: metadata.title,
          ratingKey,
        });
      }
    } else {
      logger.warn('No images to download', { namespace: 'tautulli-sync', ratingKey });
    }

    return result;
  }

  /**
   * Parse Tautulli image URL to extract id, type, and timestamp
   */
  private parseTautulliImageUrl(url?: string): { id: string; type: 'thumb' | 'art'; timestamp: string } | null {
    if (!url) return null;
    const match = url.match(/\/library\/metadata\/(\d+)\/(thumb|art)\/(\d+)/);
    if (!match) return null;
    return {
      id: match[1],
      type: match[2] as 'thumb' | 'art',
      timestamp: match[3],
    };
  }

  /**
   * Extract TMDb ID and IMDB ID from GUID
   */
  private extractIdsFromGuid(guid?: string): { tmdbId?: number; imdbId?: string } {
    if (!guid) {
      return {};
    }
    const trimmed = guid.trim();
    if (!trimmed) {
      return {};
    }
    const result: { tmdbId?: number; imdbId?: string } = {};
    // Handle direct IMDB ID format (starts with "tt")
    if (trimmed.startsWith('tt') && /^tt\d+$/.test(trimmed)) {
      result.imdbId = trimmed;
      return result;
    }
    // Split by comma in case of multiple GUIDs
    const guidParts = trimmed.includes(',') ? trimmed.split(',') : [trimmed];
    for (const guidPart of guidParts) {
      const part = guidPart.trim();
      if (!part) continue;
      const [schemePart, restPart] = part.split('://');
      // If no ://, check if it's a direct ID
      if (!restPart) {
        if (part.startsWith('tt') && /^tt\d+$/.test(part)) {
          result.imdbId = part;
        }
        continue;
      }
      const scheme = schemePart.toLowerCase();
      const rest = restPart.split('?')[0].replace(/^\/+/, '');
      const tail = rest.split('/').pop() || rest;
      if (!tail) continue;
      // Extract TMDb ID
      if (scheme.includes('tmdb') || scheme.includes('themoviedb')) {
        const tmdbId = parseInt(tail, 10);
        if (!isNaN(tmdbId)) {
          result.tmdbId = tmdbId;
        }
      }
      // Extract IMDB ID
      if (scheme.includes('imdb')) {
        const imdbId = tail.startsWith('tt') ? tail : `tt${tail}`;
        result.imdbId = imdbId;
      }
    }
    return result;
  }

  /**
   * Enrich media with TMDB data (for covers and additional metadata)
   */
  private async enrichWithTmdb(
    metadata: TautulliMetadata,
    type: 'movie' | 'tv',
  ): Promise<{
    tmdbId?: number;
    poster?: string;
    backdrop?: string;
    tmdbRating?: number;
    tmdbVoteCount?: number;
    languages?: string[];
    originalLanguage?: string;
    trailerYoutubeId?: string;
    trailerSite?: string;
    trailerName?: string;
    trailerUrl?: string;
    tmdbEnriched: boolean;
  } | null> {
    if (!this.tmdbService) {
      logger.warn('TMDb service not available for enrichment', { namespace: 'tautulli-sync' });
      return null;
    }

    const extractedIds = this.extractIdsFromGuid(metadata.guid);
    const titleForSearch =
      typeof metadata.title === 'string' && metadata.title.trim().length > 0
        ? metadata.title.trim()
        : null;
    const languagesToTry = ['de', 'de-DE', 'en-US'];

    const tryFetchById = async (tmdbId?: number | null) => {
      if (!tmdbId) return null;
      for (const language of languagesToTry) {
        const details = await this.tmdbService!.fetchDetails(type, tmdbId, { language });
        if (details) {
          return this.buildTmdbEnrichment(details, tmdbId);
        }
      }
      return null;
    };

    const tryFetchByImdb = async (imdbId?: string) => {
      if (!imdbId) return null;
      for (const language of languagesToTry) {
        const details = await this.tmdbService!.fetchDetailsByImdb(type, imdbId, { language });
        if (details) {
          return this.buildTmdbEnrichment(details);
        }
      }
      return null;
    };

    const trySearch = async () => {
      if (!titleForSearch) {
        logger.warn('Cannot search TMDb without title', {
          namespace: 'tautulli-sync',
          ratingKey: metadata.rating_key,
        });
        return null;
      }

      const releaseYear = this.resolveReleaseYear(metadata);

      for (const language of languagesToTry) {
        const results =
          type === 'movie'
            ? await this.tmdbService!.searchMovie(titleForSearch, { year: releaseYear, language })
            : await this.tmdbService!.searchTv(titleForSearch, { year: releaseYear, language });

        if (!results?.length) {
          continue;
        }

        for (const candidate of results.slice(0, 3)) {
          const details = await this.tmdbService!.fetchDetails(type, candidate.id, { language });
          if (details) {
            return this.buildTmdbEnrichment(details, candidate.id);
          }
        }
      }

      return null;
    };

    try {
      const fromTmdbId = await tryFetchById(extractedIds.tmdbId);
      if (fromTmdbId) {
        return fromTmdbId;
      }

      const fromImdb = await tryFetchByImdb(extractedIds.imdbId);
      if (fromImdb) {
        return fromImdb;
      }

      return await trySearch();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('TMDb enrichment failed', {
        namespace: 'tautulli-sync',
        title: metadata.title,
        ratingKey: metadata.rating_key,
        error: message,
      });
      return null;
    }
  }

  private buildTmdbEnrichment(details: TmdbHeroDetails, forcedId?: number) {
    const primaryBackdrop =
      Array.isArray(details.backdrops) && details.backdrops.length > 0
        ? details.backdrops[0]
        : undefined;

    return {
      tmdbId: forcedId ?? details.id ?? undefined,
      poster: details.poster ?? undefined,
      backdrop: primaryBackdrop,
      tmdbRating: details.voteAverage ?? undefined,
      tmdbVoteCount: details.voteCount ?? undefined,
      languages: details.languages?.length ? details.languages : undefined,
      originalLanguage: details.originalLanguage ?? undefined,
      trailerYoutubeId: details.trailerYoutubeId ?? undefined,
      trailerSite: details.trailerSite ?? undefined,
      trailerName: details.trailerName ?? undefined,
      trailerUrl: details.trailerUrl ?? undefined,
      tmdbEnriched: true,
    };
  }

  private resolveReleaseYear(metadata: TautulliMetadata): number | undefined {
    if (typeof metadata.year === 'number' && Number.isFinite(metadata.year)) {
      return metadata.year;
    }

    const candidate = metadata.originally_available_at ?? metadata.added_at?.toString() ?? null;
    if (!candidate) {
      return undefined;
    }

    const match = candidate.match(/^(\d{4})/);
    if (match) {
      const parsed = Number.parseInt(match[1], 10);
      return Number.isFinite(parsed) ? parsed : undefined;
    }

    return undefined;
  }
}
