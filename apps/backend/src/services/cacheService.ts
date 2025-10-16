import { LRUCache } from 'lru-cache';

export interface CacheOptions {
  /** Maximum number of items to store */
  max?: number;
  /** Time to live in milliseconds */
  ttl?: number;
  /** Update age on access */
  updateAgeOnGet?: boolean;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  maxSize: number;
}

/**
 * Generic LRU cache service for API responses and computed data
 *
 * Features:
 * - Automatic expiration based on TTL
 * - LRU eviction when max size reached
 * - Cache statistics for monitoring
 * - Type-safe key-value storage
 */
export class CacheService<K extends {} = string, V extends {} = any> {
  private cache: LRUCache<K, V, unknown>;
  private stats: CacheStats;

  constructor(options: CacheOptions = {}) {
    const defaultOptions = {
      max: 500, // Store up to 500 items
      ttl: 5 * 60 * 1000, // 5 minutes default TTL
      updateAgeOnGet: true, // Refresh TTL on access
    };

    this.cache = new LRUCache<K, V, unknown>({
      ...defaultOptions,
      ...options,
    });

    this.stats = {
      hits: 0,
      misses: 0,
      size: 0,
      maxSize: options.max ?? defaultOptions.max,
    };
  }

  /**
   * Get a value from cache
   * Returns undefined if not found or expired
   */
  get(key: K): V | undefined {
    const value = this.cache.get(key);

    if (value !== undefined) {
      this.stats.hits++;
    } else {
      this.stats.misses++;
    }

    return value;
  }

  /**
   * Set a value in cache with optional custom TTL
   */
  set(key: K, value: V, ttl?: number): void {
    this.cache.set(key, value, { ttl });
    this.stats.size = this.cache.size;
  }

  /**
   * Check if key exists in cache
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * Delete a specific key from cache
   */
  delete(key: K): boolean {
    const deleted = this.cache.delete(key);
    this.stats.size = this.cache.size;
    return deleted;
  }

  /**
   * Clear all cached items
   */
  clear(): void {
    this.cache.clear();
    this.stats.size = 0;
  }

  /**
   * Get or compute a value
   * If the key exists in cache, return it
   * Otherwise, compute it using the factory function and cache it
   */
  async getOrCompute(
    key: K,
    factory: () => Promise<V> | V,
    ttl?: number
  ): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await factory();
    this.set(key, value, ttl);
    return value;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return {
      ...this.stats,
      size: this.cache.size,
    };
  }

  /**
   * Get cache hit rate (0-1)
   */
  getHitRate(): number {
    const total = this.stats.hits + this.stats.misses;
    return total === 0 ? 0 : this.stats.hits / total;
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats.hits = 0;
    this.stats.misses = 0;
  }
}

/**
 * Create pre-configured cache instances for common use cases
 */

/**
 * Short-lived cache for frequently accessed data (1 minute)
 * Example: Stats endpoint, recent items
 */
export const createShortCache = <K extends {} = string, V extends {} = any>() =>
  new CacheService<K, V>({
    max: 100,
    ttl: 1 * 60 * 1000, // 1 minute
    updateAgeOnGet: true,
  });

/**
 * Medium-lived cache for moderately changing data (5 minutes)
 * Example: Movie/series lists, filter results
 */
export const createMediumCache = <K extends {} = string, V extends {} = any>() =>
  new CacheService<K, V>({
    max: 500,
    ttl: 5 * 60 * 1000, // 5 minutes
    updateAgeOnGet: true,
  });

/**
 * Long-lived cache for rarely changing data (15 minutes)
 * Example: Individual movie/series details, thumbnails
 */
export const createLongCache = <K extends {} = string, V extends {} = any>() =>
  new CacheService<K, V>({
    max: 1000,
    ttl: 15 * 60 * 1000, // 15 minutes
    updateAgeOnGet: true,
  });

/**
 * Create a cache key from request parameters
 */
export const createCacheKey = (
  endpoint: string,
  params: Record<string, any> = {}
): string => {
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');

  return sortedParams ? `${endpoint}?${sortedParams}` : endpoint;
};
