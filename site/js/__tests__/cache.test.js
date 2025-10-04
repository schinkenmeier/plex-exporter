/**
 * Unit tests for cache.js
 * Run with: node --test site/js/__tests__/cache.test.js
 */

import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert';

// Mock localStorage with proper Object.keys() support
const localStorageData = {};

global.localStorage = new Proxy(localStorageData, {
  get(target, prop) {
    if (prop === 'getItem') {
      return (key) => target[key] || null;
    }
    if (prop === 'setItem') {
      return (key, value) => { target[key] = value; };
    }
    if (prop === 'removeItem') {
      return (key) => { delete target[key]; };
    }
    if (prop === 'clear') {
      return () => {
        Object.keys(target).forEach(key => delete target[key]);
      };
    }
    return target[prop];
  },
  ownKeys(target) {
    return Object.keys(target);
  },
  getOwnPropertyDescriptor(target, prop) {
    return {
      enumerable: true,
      configurable: true
    };
  }
});

// Mock window (but NOT as globalThis to prevent interval from starting)
global.window = { localStorage: global.localStorage };

// Import after mocks are set up
const { setCache, getCache, removeCache, clearAllCache, getCacheStats, stopCleanupInterval } = await import('../cache.js');

// Cleanup after all tests
after(() => {
  stopCleanupInterval();
});

describe('Cache Module', () => {
  beforeEach(() => {
    // Clear the localStorageData object
    Object.keys(localStorageData).forEach(key => delete localStorageData[key]);
  });

  describe('setCache and getCache', () => {
    it('should store and retrieve a value', () => {
      setCache('test-key', { foo: 'bar' });
      const result = getCache('test-key');
      assert.deepStrictEqual(result, { foo: 'bar' });
    });

    it('should return null for non-existent key', () => {
      const result = getCache('non-existent');
      assert.strictEqual(result, null);
    });

    it('should handle different data types', () => {
      setCache('string', 'hello');
      setCache('number', 42);
      setCache('boolean', true);
      setCache('array', [1, 2, 3]);
      setCache('object', { nested: { value: 'test' } });

      assert.strictEqual(getCache('string'), 'hello');
      assert.strictEqual(getCache('number'), 42);
      assert.strictEqual(getCache('boolean'), true);
      assert.deepStrictEqual(getCache('array'), [1, 2, 3]);
      assert.deepStrictEqual(getCache('object'), { nested: { value: 'test' } });
    });
  });

  describe('TTL (Time To Live)', () => {
    it('should expire cache after TTL', async () => {
      setCache('expiring-key', 'value', 100); // 100ms TTL

      // Should exist immediately
      assert.strictEqual(getCache('expiring-key'), 'value');

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should be expired
      assert.strictEqual(getCache('expiring-key'), null);
    });

    it('should not expire before TTL', async () => {
      setCache('valid-key', 'value', 200); // 200ms TTL

      // Wait a bit but not enough to expire
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should still exist
      assert.strictEqual(getCache('valid-key'), 'value');
    });
  });

  describe('removeCache', () => {
    it('should remove a cached item', () => {
      setCache('remove-me', 'value');
      assert.strictEqual(getCache('remove-me'), 'value');

      removeCache('remove-me');
      assert.strictEqual(getCache('remove-me'), null);
    });
  });

  describe('clearAllCache', () => {
    it('should clear all cache entries', () => {
      setCache('key1', 'value1');
      setCache('key2', 'value2');
      setCache('key3', 'value3');

      clearAllCache();

      assert.strictEqual(getCache('key1'), null);
      assert.strictEqual(getCache('key2'), null);
      assert.strictEqual(getCache('key3'), null);
    });

    it('should not affect non-cache localStorage items', () => {
      global.localStorage.setItem('non-cache-item', 'value');
      setCache('cache-item', 'value');

      clearAllCache();

      assert.strictEqual(global.localStorage.getItem('non-cache-item'), 'value');
      assert.strictEqual(getCache('cache-item'), null);
    });
  });

  describe('getCacheStats', () => {
    it('should return correct stats for empty cache', () => {
      const stats = getCacheStats();
      assert.strictEqual(stats.totalEntries, 0);
      assert.strictEqual(stats.validEntries, 0);
      assert.strictEqual(stats.expiredEntries, 0);
    });

    it('should return correct stats for valid entries', () => {
      setCache('key1', 'value1');
      setCache('key2', 'value2');

      const stats = getCacheStats();
      assert.strictEqual(stats.totalEntries, 2);
      assert.strictEqual(stats.validEntries, 2);
      assert.strictEqual(stats.expiredEntries, 0);
    });

    it('should count expired entries correctly', async () => {
      setCache('valid', 'value', 1000); // Long TTL
      setCache('expired', 'value', 50); // Short TTL

      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = getCacheStats();
      assert.strictEqual(stats.totalEntries, 2);
      assert.strictEqual(stats.validEntries, 1);
      assert.strictEqual(stats.expiredEntries, 1);
    });
  });

  describe('Error handling', () => {
    it('should handle JSON parse errors gracefully', () => {
      global.localStorage.setItem('plex_cache_corrupt', 'not-valid-json');
      const result = getCache('corrupt');
      assert.strictEqual(result, null);
    });

    it('should handle missing timestamp gracefully', () => {
      global.localStorage.setItem('plex_cache_invalid', JSON.stringify({ value: 'test' }));
      const result = getCache('invalid');
      assert.strictEqual(result, null);
    });
  });
});
