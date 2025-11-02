import type { TautulliService, TautulliMetadata, TautulliMediaItem } from './tautulliService.js';
import type { MediaRepository } from '../repositories/mediaRepository.js';
import type { SeasonRepository } from '../repositories/seasonRepository.js';
import type { LibrarySectionRepository } from '../repositories/librarySectionRepository.js';
import type { TmdbService } from './tmdbService.js';
import type { ImageStorageService } from './imageStorageService.js';

export interface SyncOptions {
  incremental?: boolean;
  enrichWithTmdb?: boolean;
  syncCovers?: boolean;
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

        // Update last synced timestamp
        this.librarySectionRepo.updateLastSynced(section.id, new Date().toISOString());
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
      const mediaItems = await this.fetchAllMediaFromLibrary(sectionId, onProgress);

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

      // Delete removed media (hard delete)
      if (!options.incremental) {
        const tautulliIds = mediaItems.map((item) => item.rating_key);
        deleted = await this.deleteRemovedMedia(sectionId, tautulliIds);
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
    onProgress?: ProgressCallback,
  ): Promise<TautulliMediaItem[]> {
    const allMedia: TautulliMediaItem[] = [];
    let start = 0;
    const length = 1000; // Fetch in batches of 1000 (more efficient)
    let hasMore = true;

    console.log(`[Tautulli Sync] Starting to fetch media from library section ${sectionId}`);

    while (hasMore) {
      onProgress?.({
        phase: `Fetching media list (${allMedia.length} fetched so far)`,
        current: start,
        total: start + length,
        percentage: 0,
      });

      const batch = await this.tautulliService.getLibraryMediaList(sectionId, start, length);
      console.log(`[Tautulli Sync] Batch fetched: start=${start}, length=${length}, received=${batch.length} items`);

      if (batch.length === 0) {
        console.log(`[Tautulli Sync] No more items to fetch (empty batch)`);
        hasMore = false;
      } else {
        allMedia.push(...batch);
        start += length;

        if (batch.length < length) {
          console.log(`[Tautulli Sync] Last batch received (${batch.length} < ${length})`);
          hasMore = false;
        }
      }
    }

    console.log(`[Tautulli Sync] Finished fetching. Total items retrieved: ${allMedia.length}`);
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

    console.log(`[Tautulli Sync] Starting to sync ${mediaItems.length} movies`);

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
          console.warn(`[Tautulli Sync] Incomplete metadata for "${item.title}" (rating_key: ${item.rating_key}), using list data as fallback`);
          metadata = item as unknown as TautulliMetadata;
        }

        // Check if already exists
        const existing = this.mediaRepo.getByPlexId(item.rating_key);

        // Skip if incremental and not changed
        if (options.incremental && existing && existing.plexUpdatedAt === metadata.updated_at?.toString()) {
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
            console.warn(`[Tautulli Sync] Image download failed for movie "${item.title}":`, errorMessage);
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
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.warn(`[Tautulli Sync] TMDb enrichment failed for movie "${item.title}" (rating_key: ${item.rating_key}):`, errorMessage);
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
        console.error(`[Tautulli Sync] Failed to sync movie "${item.title}" (rating_key: ${item.rating_key}):`, errorMessage);
        errors.push(`Failed to sync movie ${item.title}: ${errorMessage}`);
      }
    }

    console.log(`[Tautulli Sync] Movies sync completed:`, {
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

    console.log(`[Tautulli Sync] Starting to sync ${mediaItems.length} TV series`);

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
          console.warn(`[Tautulli Sync] Incomplete metadata for "${item.title}" (rating_key: ${item.rating_key}), using list data as fallback`);
          metadata = item as unknown as TautulliMetadata;
        }

        // Check if already exists
        const existing = this.mediaRepo.getByPlexId(item.rating_key);

        // Skip if incremental and not changed
        if (options.incremental && existing && existing.plexUpdatedAt === metadata.updated_at?.toString()) {
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
            console.warn(`[Tautulli Sync] Image download failed for series "${item.title}":`, errorMessage);
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
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.warn(`[Tautulli Sync] TMDb enrichment failed for series "${item.title}" (rating_key: ${item.rating_key}):`, errorMessage);
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
        await this.syncSeasonsAndEpisodes(item.rating_key, mediaItemId, onProgress);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Tautulli Sync] Failed to sync series "${item.title}" (rating_key: ${item.rating_key}):`, errorMessage);
        errors.push(`Failed to sync series ${item.title}: ${errorMessage}`);
      }
    }

    console.log(`[Tautulli Sync] TV series sync completed:`, {
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
    onProgress?: ProgressCallback,
  ): Promise<void> {
    // Get all seasons
    const seasons = await this.tautulliService.getSeasons(showRatingKey);

    const reportedSeasonKeys = new Set<string>();
    const reportedEpisodeKeys = new Set<string>();
    const seasonsWithEpisodeSyncFailure = new Set<number>();

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

        const seasonPoster = this.convertTautulliThumbnailUrl(seasonMetadata.thumb);

        const seasonData = {
          mediaItemId,
          tautulliId: seasonMetadata.rating_key,
          seasonNumber: seasonMetadata.media_index ?? 0,
          title: seasonMetadata.title,
          summary: seasonMetadata.summary,
          poster: seasonPoster ?? null,
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

            const episodeThumb = this.convertTautulliThumbnailUrl(episodeMetadata.thumb);

            const episodeData = {
              seasonId: resolvedSeasonId,
              tautulliId: episodeMetadata.rating_key,
              episodeNumber: episodeMetadata.media_index ?? 0,
              title: episodeMetadata.title,
              summary: episodeMetadata.summary,
              duration: episodeMetadata.duration,
              rating: episodeMetadata.rating?.toString(),
              airDate: episodeMetadata.originally_available_at,
              thumb: episodeThumb ?? null,
            };

            if (existingEpisode) {
              this.seasonRepo.updateEpisode(existingEpisode.id, episodeData);
            } else {
              this.seasonRepo.createEpisode(episodeData);
            }
          } catch (error) {
            // Skip episode errors
          }
        }
      } catch (error) {
        // Skip season errors
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
  }

  /**
   * Delete media items that no longer exist in Tautulli
   */
  private async deleteRemovedMedia(sectionId: number, currentTautulliIds: string[]): Promise<number> {
    const existingMedia = this.mediaRepo.filter({
      librarySectionId: sectionId,
      limit: 10000, // Fetch all for deletion check
    });

    let deleted = 0;

    for (const media of existingMedia) {
      if (!currentTautulliIds.includes(media.plexId)) {
        this.mediaRepo.delete(media.id);
        deleted++;
      }
    }

    return deleted;
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
  } {
    const posterUrl = this.convertTautulliThumbnailUrl(metadata.thumb);
    const backdropUrl = this.convertTautulliThumbnailUrl(metadata.art);

    // Extract IDs from GUID
    const ids = this.extractIdsFromGuid(metadata.guid);

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
      plexAddedAt: metadata.added_at?.toString(),
      plexUpdatedAt: metadata.updated_at?.toString(),
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
      console.warn(`[Tautulli Sync] ImageStorageService not available for ${ratingKey}`);
      return {};
    }
    if (!syncCovers) {
      console.log(`[Tautulli Sync] syncCovers is disabled, skipping image download for ${ratingKey}`);
      return {};
    }
    console.log(`[Tautulli Sync] Starting image download for ${metadata.title} (${ratingKey})`);
    const result: { poster?: string; backdrop?: string } = {};
    const downloadItems: Array<{
      ratingKey: string;
      type: 'thumb' | 'art';
      timestamp: string;
      targetPath: string;
      mediaType: 'movie' | 'tv';
    }> = [];

    // Parse poster URL
    if (metadata.thumb) {
      console.log(`[Tautulli Sync] Parsing poster URL: ${metadata.thumb}`);
      const posterInfo = this.parseTautulliImageUrl(metadata.thumb);
      if (posterInfo) {
        const posterPath = this.imageStorageService.getMediaImagePath(mediaType, ratingKey, 'poster');
        console.log(`[Tautulli Sync] Poster path: ${posterPath}, metadata ID: ${posterInfo.id}, timestamp: ${posterInfo.timestamp}`);
        downloadItems.push({
          ratingKey: posterInfo.id,
          type: posterInfo.type,
          timestamp: posterInfo.timestamp,
          targetPath: posterPath,
          mediaType,
        });
        result.poster = posterPath;
      } else {
        console.warn(`[Tautulli Sync] Could not parse poster URL: ${metadata.thumb}`);
      }
    } else {
      console.log(`[Tautulli Sync] No poster URL found for ${ratingKey}`);
    }

    // Parse backdrop URL
    if (metadata.art) {
      console.log(`[Tautulli Sync] Parsing backdrop URL: ${metadata.art}`);
      const backdropInfo = this.parseTautulliImageUrl(metadata.art);
      if (backdropInfo) {
        const backdropPath = this.imageStorageService.getMediaImagePath(mediaType, ratingKey, 'backdrop');
        console.log(`[Tautulli Sync] Backdrop path: ${backdropPath}, metadata ID: ${backdropInfo.id}, timestamp: ${backdropInfo.timestamp}`);
        downloadItems.push({
          ratingKey: backdropInfo.id,
          type: backdropInfo.type,
          timestamp: backdropInfo.timestamp,
          targetPath: backdropPath,
          mediaType,
        });
        result.backdrop = backdropPath;
      } else {
        console.warn(`[Tautulli Sync] Could not parse backdrop URL: ${metadata.art}`);
      }
    } else {
      console.log(`[Tautulli Sync] No backdrop URL found for ${ratingKey}`);
    }

    // Download images in batch
    if (downloadItems.length > 0) {
      console.log(`[Tautulli Sync] Downloading ${downloadItems.length} images for ${ratingKey}`);
      try {
        await this.imageStorageService.downloadBatch(downloadItems);
        console.log(`[Tautulli Sync] Successfully downloaded images for ${ratingKey}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Tautulli Sync] Failed to download images for ${ratingKey}:`, errorMessage);
        throw error;
      }
    } else {
      console.warn(`[Tautulli Sync] No images to download for ${ratingKey}`);
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
    tmdbEnriched: boolean;
  } | null> {
    if (!this.tmdbService) {
      console.warn(`[TMDb Enrichment] TMDb service not available`);
      return null;
    }

    if (!metadata.guid) {
      console.warn(`[TMDb Enrichment] No GUID found for "${metadata.title}"`);
      return null;
    }

    try {
      // Try to extract TMDB ID from guid (e.g., "tmdb://12345")
      const guidMatch = metadata.guid.match(/tmdb:\/\/(\d+)/);
      let tmdbId: number | null = null;

      if (guidMatch) {
        tmdbId = parseInt(guidMatch[1], 10);
        console.log(`[TMDb Enrichment] Found TMDb ID in GUID for "${metadata.title}": ${tmdbId}`);
      } else {
        // Fallback: Search by title + year if no TMDb ID in GUID
        console.log(`[TMDb Enrichment] No TMDb ID in GUID for "${metadata.title}", searching by title...`);

        if (!metadata.title) {
          console.warn(`[TMDb Enrichment] Cannot search without title for rating_key: ${metadata.rating_key}`);
          return null;
        }

        try {
          const searchResults = await this.tmdbService.searchMovie(metadata.title, {
            year: metadata.year,
            language: 'de',
          });
          if (searchResults && searchResults.length > 0) {
            tmdbId = searchResults[0].id;
            console.log(`[TMDb Enrichment] Found TMDb ID via search for "${metadata.title}": ${tmdbId}`);
          } else {
            console.warn(`[TMDb Enrichment] No TMDb search results for "${metadata.title}" (${metadata.year})`);
            return null;
          }
        } catch (searchError) {
          console.warn(`[TMDb Enrichment] Search failed for "${metadata.title}":`, searchError);
          return null;
        }
      }

      if (!tmdbId) {
        return null;
      }

      console.log(`[TMDb Enrichment] Fetching TMDb details for "${metadata.title}" (TMDb ID: ${tmdbId}, type: ${type})`);
      const tmdbData = await this.tmdbService.fetchDetails(type, tmdbId, { language: 'de' });

      if (!tmdbData) {
        console.warn(`[TMDb Enrichment] No TMDb data returned for "${metadata.title}" (TMDb ID: ${tmdbId})`);
        return null;
      }

      const result = {
        tmdbId,
        // tmdbData.poster is already a full URL from getPosterUrl(), don't add prefix
        poster: tmdbData.poster ?? undefined,
        // backdrops come as paths, need full URL
        backdrop: tmdbData.backdrops?.[0]
          ? (tmdbData.backdrops[0].startsWith('http')
            ? tmdbData.backdrops[0]
            : `https://image.tmdb.org/t/p/w1280${tmdbData.backdrops[0]}`)
          : undefined,
        tmdbRating: tmdbData.voteAverage ?? undefined,
        tmdbVoteCount: tmdbData.voteCount ?? undefined,
        tmdbEnriched: true,
      };

      console.log(`[TMDb Enrichment] Successfully enriched "${metadata.title}":`, {
        tmdbId,
        hasPoster: !!result.poster,
        hasBackdrop: !!result.backdrop,
        rating: result.tmdbRating,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[TMDb Enrichment] Error enriching "${metadata.title}":`, errorMessage);
      throw error; // Re-throw to be caught by caller
    }
  }
}
