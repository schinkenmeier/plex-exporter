import type { Request, Response, NextFunction } from 'express';
import { CacheService, createCacheKey } from '../services/cacheService.js';

export interface CacheMiddlewareOptions {
  /** Cache service instance */
  cache: CacheService;
  /** Custom TTL for this endpoint (overrides cache default) */
  ttl?: number;
  /** Function to generate cache key (default uses URL + query params) */
  keyGenerator?: (req: Request) => string;
  /** Skip caching if this function returns true */
  skipIf?: (req: Request) => boolean;
}

/**
 * Cache middleware for Express routes
 *
 * Caches the response body and sends it on subsequent requests
 * Sets Cache-Control headers for client-side caching
 *
 * @example
 * router.get('/movies', cacheMiddleware({ cache: movieCache, ttl: 60000 }), handler);
 */
export const cacheMiddleware = (options: CacheMiddlewareOptions) => {
  const {
    cache,
    ttl,
    keyGenerator = defaultKeyGenerator,
    skipIf = () => false,
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip caching if condition is met
    if (skipIf(req)) {
      return next();
    }

    const cacheKey = keyGenerator(req);

    // Try to get from cache
    const cached = cache.get(cacheKey);
    if (cached) {
      // Add cache hit header
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('Cache-Control', 'public, max-age=60'); // Tell client to cache for 1 minute
      return res.json(cached);
    }

    // Cache miss - intercept response
    res.setHeader('X-Cache', 'MISS');

    // Store original json method
    const originalJson = res.json.bind(res);

    // Override json method to cache the response
    res.json = function (body: any): Response {
      // Cache the response body
      cache.set(cacheKey, body, ttl);

      // Call original json method
      return originalJson(body);
    };

    next();
  };
};

/**
 * Default cache key generator
 * Uses the full URL path + query parameters
 */
const defaultKeyGenerator = (req: Request): string => {
  return createCacheKey(req.path, req.query as Record<string, any>);
};

/**
 * Create a cache key generator that includes user/auth context
 * Useful for user-specific cached data
 */
export const createAuthCacheKeyGenerator = (req: Request): string => {
  const authHeader = req.headers.authorization || 'anonymous';
  return `${authHeader}:${defaultKeyGenerator(req)}`;
};

/**
 * Helper to create a cache middleware with common presets
 */
export const createCachePreset = (cache: CacheService, ttlMinutes: number) => {
  return cacheMiddleware({
    cache,
    ttl: ttlMinutes * 60 * 1000,
  });
};
