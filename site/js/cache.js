/**
 * Enhanced Caching System with TTL and Storage Management
 */

const CACHE_PREFIX = 'plex_cache_';
const DEFAULT_TTL = 1000 * 60 * 60 * 24; // 24 hours
const MAX_CACHE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Set an item in cache with TTL
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttl - Time to live in milliseconds
 */
export function setCache(key, value, ttl = DEFAULT_TTL) {
  try {
    const cacheKey = CACHE_PREFIX + key;
    const item = {
      value,
      timestamp: Date.now(),
      ttl
    };
    localStorage.setItem(cacheKey, JSON.stringify(item));

    // Check if we're approaching storage limits
    checkCacheSize();
  } catch (error) {
    if (error.name === 'QuotaExceededError') {
      console.warn('[cache] Storage quota exceeded, cleaning old entries');
      cleanOldestEntries();
      // Try again after cleanup
      try {
        const cacheKey = CACHE_PREFIX + key;
        const item = { value, timestamp: Date.now(), ttl };
        localStorage.setItem(cacheKey, JSON.stringify(item));
      } catch (retryError) {
        console.error('[cache] Failed to cache after cleanup:', retryError);
      }
    } else {
      console.error('[cache] Failed to set cache:', error);
    }
  }
}

/**
 * Get an item from cache
 * @param {string} key - Cache key
 * @returns {any|null} Cached value or null if expired/not found
 */
export function getCache(key) {
  try {
    const cacheKey = CACHE_PREFIX + key;
    const cached = localStorage.getItem(cacheKey);

    if (!cached) return null;

    const item = JSON.parse(cached);
    const now = Date.now();

    // Check if expired
    if (item.timestamp + item.ttl < now) {
      localStorage.removeItem(cacheKey);
      return null;
    }

    return item.value;
  } catch (error) {
    console.error('[cache] Failed to get cache:', error);
    return null;
  }
}

/**
 * Remove an item from cache
 * @param {string} key - Cache key
 */
export function removeCache(key) {
  try {
    const cacheKey = CACHE_PREFIX + key;
    localStorage.removeItem(cacheKey);
  } catch (error) {
    console.error('[cache] Failed to remove cache:', error);
  }
}

/**
 * Clear all cache entries
 */
export function clearAllCache() {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(CACHE_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
    console.log('[cache] All cache cleared');
  } catch (error) {
    console.error('[cache] Failed to clear cache:', error);
  }
}

/**
 * Clear expired cache entries
 */
export function clearExpiredCache() {
  try {
    const keys = Object.keys(localStorage);
    const now = Date.now();
    let cleared = 0;

    keys.forEach(key => {
      if (key.startsWith(CACHE_PREFIX)) {
        try {
          const item = JSON.parse(localStorage.getItem(key));
          if (item.timestamp + item.ttl < now) {
            localStorage.removeItem(key);
            cleared++;
          }
        } catch (e) {
          // Invalid cache entry, remove it
          localStorage.removeItem(key);
          cleared++;
        }
      }
    });

    if (cleared > 0) {
      console.log(`[cache] Cleared ${cleared} expired entries`);
    }
  } catch (error) {
    console.error('[cache] Failed to clear expired cache:', error);
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  try {
    const keys = Object.keys(localStorage);
    const cacheKeys = keys.filter(k => k.startsWith(CACHE_PREFIX));
    const now = Date.now();

    let totalSize = 0;
    let validEntries = 0;
    let expiredEntries = 0;

    cacheKeys.forEach(key => {
      const value = localStorage.getItem(key);
      totalSize += value.length * 2; // Approximate size in bytes (UTF-16)

      try {
        const item = JSON.parse(value);
        if (item.timestamp + item.ttl >= now) {
          validEntries++;
        } else {
          expiredEntries++;
        }
      } catch (e) {
        expiredEntries++;
      }
    });

    return {
      totalEntries: cacheKeys.length,
      validEntries,
      expiredEntries,
      totalSize,
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(2)
    };
  } catch (error) {
    console.error('[cache] Failed to get cache stats:', error);
    return null;
  }
}

/**
 * Check cache size and clean if necessary
 */
function checkCacheSize() {
  try {
    const stats = getCacheStats();
    if (stats && stats.totalSize > MAX_CACHE_SIZE) {
      console.warn('[cache] Cache size exceeded limit, cleaning...');
      cleanOldestEntries(0.3); // Remove 30% of entries
    }
  } catch (error) {
    console.error('[cache] Failed to check cache size:', error);
  }
}

/**
 * Clean oldest cache entries
 * @param {number} percentage - Percentage of entries to remove (0-1)
 */
function cleanOldestEntries(percentage = 0.3) {
  try {
    const keys = Object.keys(localStorage);
    const cacheEntries = [];

    keys.forEach(key => {
      if (key.startsWith(CACHE_PREFIX)) {
        try {
          const item = JSON.parse(localStorage.getItem(key));
          cacheEntries.push({ key, timestamp: item.timestamp });
        } catch (e) {
          // Invalid entry, mark for removal
          cacheEntries.push({ key, timestamp: 0 });
        }
      }
    });

    // Sort by timestamp (oldest first)
    cacheEntries.sort((a, b) => a.timestamp - b.timestamp);

    // Remove oldest percentage
    const toRemove = Math.ceil(cacheEntries.length * percentage);
    for (let i = 0; i < toRemove; i++) {
      localStorage.removeItem(cacheEntries[i].key);
    }

    console.log(`[cache] Removed ${toRemove} oldest entries`);
  } catch (error) {
    console.error('[cache] Failed to clean oldest entries:', error);
  }
}

/**
 * Cached fetch wrapper
 * @param {string} url - URL to fetch
 * @param {object} options - Fetch options
 * @param {number} ttl - Cache TTL in milliseconds
 */
export async function cachedFetch(url, options = {}, ttl = DEFAULT_TTL) {
  const cacheKey = `fetch_${url}`;

  // Try to get from cache first
  const cached = getCache(cacheKey);
  if (cached !== null) {
    return cached;
  }

  // Fetch and cache
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    setCache(cacheKey, data, ttl);
    return data;
  } catch (error) {
    console.error(`[cache] Fetch failed for ${url}:`, error);
    throw error;
  }
}

// Auto-cleanup on page load
if (typeof window !== 'undefined') {
  // Clear expired entries on load
  clearExpiredCache();

  // Periodic cleanup every 5 minutes
  setInterval(clearExpiredCache, 5 * 60 * 1000);
}
