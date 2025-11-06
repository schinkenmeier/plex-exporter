import { promises as fs } from 'node:fs';
import path from 'node:path';
import { existsSync } from 'node:fs';
import type TautulliService from './tautulliService.js';
import { createTautulliRateLimiter, type TautulliRateLimiter } from './tautulliRateLimiter.js';

export interface ImageDownloadItem {
  ratingKey: string;
  type: 'thumb' | 'art';
  timestamp: string;
  targetPath: string;
  mediaType: 'movie' | 'tv';
  category?: 'series' | 'season' | 'episode';
  seasonRatingKey?: string;
  episodeRatingKey?: string;
}

export interface ImageDownloadResult {
  ratingKey: string;
  type: 'thumb' | 'art';
  success: boolean;
  localPath?: string;
  targetPath: string;
  error?: string;
}

export interface ImageStorageServiceConfig {
  exportsBasePath?: string;
  maxConcurrentDownloads?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  tautulliService: TautulliService;
}

/**
 * Service for downloading and storing images from Tautulli
 * Handles batch downloads with rate limiting and retry logic
 */
export class ImageStorageService {
  private readonly basePath: string;
  private readonly maxConcurrent: number;
  private readonly maxRetries: number;
  private readonly retryDelay: number;
  private readonly tautulliService: TautulliService;
  private readonly rateLimiter: TautulliRateLimiter;
  private downloadQueue: ImageDownloadItem[] = [];
  private activeDownloads = 0;
  private readonly downloadPromises: Map<string, Promise<ImageDownloadResult>> = new Map();

  constructor(config: ImageStorageServiceConfig) {
    this.tautulliService = config.tautulliService;
    this.maxConcurrent = config.maxConcurrentDownloads ?? 5;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryDelay = config.retryDelayMs ?? 1000;
    this.basePath = this.resolveBasePath(config.exportsBasePath);
    this.rateLimiter = createTautulliRateLimiter({
      requestsPerSecond: 5,
      maxRetries: this.maxRetries,
      initialBackoffMs: this.retryDelay,
    });

    // Ensure base covers directory exists
    this.ensureDirectoryExists(path.join(this.basePath, 'covers'));
  }

  /**
   * Resolve the base path for storing images
   */
  private resolveBasePath(customPath?: string): string {
    if (customPath && existsSync(customPath)) {
      return customPath;
    }

    const candidates = [
      path.join(process.cwd(), '..', '..', 'data', 'exports'), // From apps/backend
      path.join(process.cwd(), 'data', 'exports'),             // From project root
      '/app/data/exports',                                      // Docker container
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    // Fallback: create directory if it doesn't exist
    const fallback = candidates[1];
    this.ensureDirectoryExists(fallback);
    return fallback;
  }

  /**
   * Ensure directory exists, create if it doesn't
   */
  ensureDirectoryExists(dirPath: string): void {
    if (!existsSync(dirPath)) {
      fs.mkdir(dirPath, { recursive: true }).catch((err) => {
        console.error(`[ImageStorage] Failed to create directory ${dirPath}:`, err);
      });
    }
  }

  /**
   * Check if image already exists locally
   */
  imageExists(localPath: string): boolean {
    const fullPath = path.join(this.basePath, localPath);
    return existsSync(fullPath);
  }

  /**
   * Get relative path for a media item image
   */
  getMediaImagePath(
    mediaType: 'movie' | 'tv',
    ratingKey: string,
    type: 'poster' | 'backdrop',
  ): string {
    return `covers/${mediaType}/${ratingKey}/${type === 'poster' ? 'poster.jpg' : 'backdrop.jpg'}`;
  }

  /**
   * Get relative path for a season poster
   */
  getSeasonImagePath(
    seriesRatingKey: string,
    seasonRatingKey: string,
  ): string {
    return `covers/tv/${seriesRatingKey}/seasons/${seasonRatingKey}/poster.jpg`;
  }

  /**
   * Get relative path for an episode thumb
   */
  getEpisodeImagePath(
    seriesRatingKey: string,
    seasonRatingKey: string,
    episodeRatingKey: string,
  ): string {
    return `covers/tv/${seriesRatingKey}/seasons/${seasonRatingKey}/episodes/${episodeRatingKey}/thumb.jpg`;
  }

  /**
   * Parse Tautulli image URL to extract id, type, and timestamp
   * URLs look like: /library/metadata/{id}/{type}/{timestamp}
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
   * Download a single image with retry logic
   */
  async downloadImage(
    item: ImageDownloadItem,
    retryCount = 0,
  ): Promise<ImageDownloadResult> {
    const cacheKey = `${item.ratingKey}-${item.type}-${item.timestamp}`;

    // Check if already downloading
    const existingPromise = this.downloadPromises.get(cacheKey);
    if (existingPromise) {
      return existingPromise;
    }

    // Check if already exists
    if (this.imageExists(item.targetPath)) {
      return {
        ratingKey: item.ratingKey,
        type: item.type,
        success: true,
        localPath: item.targetPath,
        targetPath: item.targetPath,
      };
    }

    const downloadPromise = this.rateLimiter.execute(async () => {
      try {
        const fullTargetPath = path.join(this.basePath, item.targetPath);
        const targetDir = path.dirname(fullTargetPath);
        this.ensureDirectoryExists(targetDir);

        console.log(`[ImageStorage] Downloading ${item.type} for metadata ID ${item.ratingKey}, timestamp ${item.timestamp}`);
        console.log(`[ImageStorage] Target path: ${fullTargetPath}`);

        const response = await this.tautulliService.fetchLibraryImage(
          item.ratingKey,
          item.type,
          item.timestamp,
        );
        console.log(`[ImageStorage] Received ${response.data.length} bytes from Tautulli`);
        await fs.writeFile(fullTargetPath, response.data);
        console.log(`[ImageStorage] Successfully wrote image to ${fullTargetPath}`);
        return {
          ratingKey: item.ratingKey,
          type: item.type,
          success: true,
          localPath: item.targetPath,
          targetPath: item.targetPath,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(
          `[ImageStorage] Failed to download image (attempt ${retryCount + 1}/${this.maxRetries}):`,
          errorMessage,
        );

        const shouldRetry =
          retryCount < this.maxRetries - 1 && !this.isNonImageContentError(errorMessage);

        if (shouldRetry) {
          await new Promise((resolve) => setTimeout(resolve, this.retryDelay * (retryCount + 1)));
          return this.downloadImage(item, retryCount + 1);
        }

        return {
          ratingKey: item.ratingKey,
          type: item.type,
          success: false,
          targetPath: item.targetPath,
          error: errorMessage,
        };
      } finally {
        this.downloadPromises.delete(cacheKey);
      }
    });

    this.downloadPromises.set(cacheKey, downloadPromise);
    return downloadPromise;
  }

  /**
   * Download multiple images in batch with concurrency control
   */
  async downloadBatch(items: ImageDownloadItem[]): Promise<ImageDownloadResult[]> {
    if (items.length === 0) {
      return [];
    }

    console.log(`[ImageStorage] Starting batch download of ${items.length} images`);

    const results: ImageDownloadResult[] = [];
    const queue = [...items];

    // Process downloads with concurrency limit
    const downloadWorkers: Promise<void>[] = [];
    for (let i = 0; i < Math.min(this.maxConcurrent, queue.length); i++) {
      const worker = async () => {
        while (queue.length > 0) {
          const item = queue.shift();
          if (!item) break;

          const result = await this.downloadImage(item);
          results.push(result);
        }
      };
      downloadWorkers.push(worker());
    }

    await Promise.all(downloadWorkers);

    const successCount = results.filter((r) => r.success).length;
    console.log(`[ImageStorage] Batch download completed: ${successCount}/${items.length} successful`);

    return results;
  }

  private isNonImageContentError(message: string): boolean {
    return message.toLowerCase().includes('non-image content');
  }
}

export default ImageStorageService;

