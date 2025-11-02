import { describe, it, expect, beforeEach } from 'vitest';
import { CacheService, createCacheKey } from './cacheService.js';

describe('CacheService', () => {
  let cache: CacheService<string, any>;

  beforeEach(() => {
    cache = new CacheService({
      max: 10,
      ttl: 100, // 100ms for fast tests
    });
  });

  describe('basic operations', () => {
    it('should set and get values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should check if key exists', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
    });

    it('should delete keys', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);

      const deleted = cache.delete('key1');
      expect(deleted).toBe(true);
      expect(cache.has('key1')).toBe(false);
    });

    it('should clear all keys', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      expect(cache.getStats().size).toBe(2);

      cache.clear();
      expect(cache.getStats().size).toBe(0);
    });
  });

  describe('TTL expiration', () => {
    it('should expire values after TTL', async () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(cache.get('key1')).toBeUndefined();
    });

    it('should allow custom TTL per entry', async () => {
      cache.set('key1', 'value1', 50); // 50ms TTL
      cache.set('key2', 'value2', 200); // 200ms TTL

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBe('value2');
    });
  });

  describe('statistics', () => {
    it('should track cache hits and misses', () => {
      cache.set('key1', 'value1');

      cache.get('key1'); // hit
      cache.get('key2'); // miss
      cache.get('key1'); // hit
      cache.get('key3'); // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(2);
    });

    it('should calculate hit rate', () => {
      cache.set('key1', 'value1');

      cache.get('key1'); // hit
      cache.get('key2'); // miss
      cache.get('key1'); // hit
      cache.get('key3'); // miss

      expect(cache.getHitRate()).toBe(0.5); // 2 hits / 4 total = 0.5
    });

    it('should reset statistics', () => {
      cache.set('key1', 'value1');
      cache.get('key1');
      cache.get('key2');

      cache.resetStats();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });

    it('should track cache size', () => {
      expect(cache.getStats().size).toBe(0);

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      expect(cache.getStats().size).toBe(2);

      cache.delete('key1');
      expect(cache.getStats().size).toBe(1);
    });
  });

  describe('getOrCompute', () => {
    it('should return cached value if available', async () => {
      cache.set('key1', 'cached-value');

      let factoryCalled = false;
      const factory = () => {
        factoryCalled = true;
        return 'new-value';
      };

      const result = await cache.getOrCompute('key1', factory);

      expect(result).toBe('cached-value');
      expect(factoryCalled).toBe(false);
    });

    it('should call factory and cache result if not cached', async () => {
      let factoryCalled = false;
      const factory = () => {
        factoryCalled = true;
        return 'new-value';
      };

      const result = await cache.getOrCompute('key1', factory);

      expect(result).toBe('new-value');
      expect(factoryCalled).toBe(true);
      expect(cache.get('key1')).toBe('new-value');
    });

    it('should support async factory functions', async () => {
      const factory = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'async-value';
      };

      const result = await cache.getOrCompute('key1', factory);

      expect(result).toBe('async-value');
      expect(cache.get('key1')).toBe('async-value');
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used items when max size reached', () => {
      // Cache max is 10
      for (let i = 0; i < 10; i++) {
        cache.set(`key${i}`, `value${i}`);
      }

      expect(cache.getStats().size).toBe(10);
      expect(cache.has('key0')).toBe(true);

      // Add one more item, should evict key0 (least recently used)
      cache.set('key10', 'value10');

      expect(cache.getStats().size).toBe(10);
      expect(cache.has('key0')).toBe(false);
      expect(cache.has('key10')).toBe(true);
    });

    it('should update LRU order on access', () => {
      for (let i = 0; i < 10; i++) {
        cache.set(`key${i}`, `value${i}`);
      }

      // Access key0 to make it most recently used
      cache.get('key0');

      // Add a new item, should evict key1 (now least recently used)
      cache.set('key10', 'value10');

      expect(cache.has('key0')).toBe(true);
      expect(cache.has('key1')).toBe(false);
    });
  });
});

describe('createCacheKey', () => {
  it('should create key from endpoint only', () => {
    const key = createCacheKey('/api/movies');
    expect(key).toBe('/api/movies');
  });

  it('should create key from endpoint and params', () => {
    const key = createCacheKey('/api/search', { q: 'test', limit: 10 });
    expect(key).toContain('/api/search?');
    expect(key).toContain('q=test');
    expect(key).toContain('limit=10');
  });

  it('should sort parameters for consistent keys', () => {
    const key1 = createCacheKey('/api/filter', { b: '2', a: '1', c: '3' });
    const key2 = createCacheKey('/api/filter', { c: '3', a: '1', b: '2' });
    expect(key1).toBe(key2);
  });

  it('should handle empty params', () => {
    const key = createCacheKey('/api/movies', {});
    expect(key).toBe('/api/movies');
  });
});
