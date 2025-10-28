import type { TautulliService, TautulliMetadata, TautulliMediaItem } from './tautulliService.js';
import type { MediaRepository } from '../repositories/mediaRepository.js';
import type { SeasonRepository } from '../repositories/seasonRepository.js';
import type { LibrarySectionRepository } from '../repositories/librarySectionRepository.js';
import type { TmdbService } from './tmdbService.js';

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
    const length = 100; // Fetch in batches of 100
    let hasMore = true;

    while (hasMore) {
      onProgress?.({
        phase: `Fetching media list (${allMedia.length} fetched so far)`,
        current: start,
        total: start + length,
        percentage: 0,
      });

      const batch = await this.tautulliService.getLibraryMediaList(sectionId, start, length);

      if (batch.length === 0) {
        hasMore = false;
      } else {
        allMedia.push(...batch);
        start += length;

        if (batch.length < length) {
          hasMore = false;
        }
      }
    }

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
        const metadata = await this.tautulliService.getMetadata(item.rating_key);

        // Check if already exists
        const existing = this.mediaRepo.getByPlexId(item.rating_key);

        // Skip if incremental and not changed
        if (options.incremental && existing && existing.plexUpdatedAt === metadata.updated_at?.toString()) {
          skipped++;
          continue;
        }

        const mediaData = this.mapTautulliToMediaItem(metadata, 'movie', sectionId);

        // Enrich with TMDB if requested
        if (options.enrichWithTmdb && this.tmdbService && metadata.guid) {
          try {
            const tmdbData = await this.enrichWithTmdb(metadata, 'movie');
            if (tmdbData) {
              Object.assign(mediaData, tmdbData);
            }
          } catch (error) {
            // Silently skip TMDB errors, continue with Tautulli data
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
        errors.push(`Failed to sync movie ${item.title}: ${errorMessage}`);
      }
    }

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
        const metadata = await this.tautulliService.getMetadata(item.rating_key);

        // Check if already exists
        const existing = this.mediaRepo.getByPlexId(item.rating_key);

        // Skip if incremental and not changed
        if (options.incremental && existing && existing.plexUpdatedAt === metadata.updated_at?.toString()) {
          skipped++;
          continue;
        }

        const mediaData = this.mapTautulliToMediaItem(metadata, 'tv', sectionId);

        // Enrich with TMDB if requested
        if (options.enrichWithTmdb && this.tmdbService && metadata.guid) {
          try {
            const tmdbData = await this.enrichWithTmdb(metadata, 'tv');
            if (tmdbData) {
              Object.assign(mediaData, tmdbData);
            }
          } catch (error) {
            // Silently skip TMDB errors
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
        errors.push(`Failed to sync series ${item.title}: ${errorMessage}`);
      }
    }

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

    for (const seasonMetadata of seasons) {
      onProgress?.({
        phase: `Processing Season ${seasonMetadata.media_index}`,
        current: 0,
        total: seasons.length,
        percentage: 0,
      });

      try {
        // Check if season exists
        const existingSeason = this.seasonRepo.getByTautulliId(seasonMetadata.rating_key);

        const seasonData = {
          mediaItemId,
          tautulliId: seasonMetadata.rating_key,
          seasonNumber: seasonMetadata.media_index ?? 0,
          title: seasonMetadata.title,
          summary: seasonMetadata.summary,
          poster: seasonMetadata.thumb,
          episodeCount: 0, // Will be updated after episodes
        };

        let seasonId: number;

        if (existingSeason) {
          const updated = this.seasonRepo.update(existingSeason.id, seasonData);
          seasonId = updated?.id ?? existingSeason.id;
        } else {
          const newSeason = this.seasonRepo.create(seasonData);
          seasonId = newSeason.id;
        }

        // Get all episodes for this season
        const episodes = await this.tautulliService.getEpisodes(seasonMetadata.rating_key);

        // Update episode count
        this.seasonRepo.update(seasonId, { episodeCount: episodes.length });

        // Sync episodes
        for (const episodeMetadata of episodes) {
          try {
            const existingEpisode = this.seasonRepo.getEpisodeByTautulliId(episodeMetadata.rating_key);

            const episodeData = {
              seasonId,
              tautulliId: episodeMetadata.rating_key,
              episodeNumber: episodeMetadata.media_index ?? 0,
              title: episodeMetadata.title,
              summary: episodeMetadata.summary,
              duration: episodeMetadata.duration,
              rating: episodeMetadata.rating?.toString(),
              airDate: episodeMetadata.originally_available_at,
              thumb: episodeMetadata.thumb,
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

  /**
   * Map Tautulli metadata to media item format
   */
  private mapTautulliToMediaItem(
    metadata: TautulliMetadata,
    type: 'movie' | 'tv',
    sectionId: number,
  ): {
    plexId: string;
    type: 'movie' | 'tv';
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
  } {
    return {
      plexId: metadata.rating_key,
      type,
      title: metadata.title,
      sortTitle: metadata.sort_title,
      year: metadata.year,
      rating: metadata.rating,
      contentRating: metadata.content_rating,
      summary: metadata.summary,
      tagline: metadata.tagline,
      duration: metadata.duration,
      poster: metadata.thumb,
      backdrop: metadata.art,
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
    };
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
    if (!this.tmdbService || !metadata.guid) {
      return null;
    }

    try {
      // Extract TMDB ID from guid (e.g., "plex://movie/5d776825880197001ec90d13")
      // This is a simplified extraction - you may need to adjust based on actual guid format
      const guidMatch = metadata.guid.match(/tmdb:\/\/(\d+)/);
      if (!guidMatch) {
        return null;
      }

      const tmdbId = parseInt(guidMatch[1], 10);
      const tmdbData = await this.tmdbService.fetchDetails(type, tmdbId, { language: 'de' });

      if (!tmdbData) {
        return null;
      }

      return {
        tmdbId,
        poster: tmdbData.poster ? `https://image.tmdb.org/t/p/w500${tmdbData.poster}` : undefined,
        backdrop: tmdbData.backdrops?.[0] ? `https://image.tmdb.org/t/p/w1280${tmdbData.backdrops[0]}` : undefined,
        tmdbRating: tmdbData.voteAverage ?? undefined,
        tmdbVoteCount: tmdbData.voteCount ?? undefined,
        tmdbEnriched: true,
      };
    } catch (error) {
      return null;
    }
  }
}
