/**
 * Unit tests for cacheStore.js
 * Tests new clearExpired() and size() methods, plus core functionality
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

// Mock localStorage
const localStorageData = {};
global.localStorage = {
  getItem: (key) => localStorageData[key] || null,
  setItem: (key, value) => { localStorageData[key] = value; },
  removeItem: (key) => { delete localStorageData[key]; },
  clear: () => Object.keys(localStorageData).forEach(key => delete localStorageData[key]),
};

// Import after mocks
const { createCacheStore, get, set, clear, clearExpired, size } = await import('../../src/shared/cacheStore.js');

describe('cacheStore', () => {
  beforeEach(() => {
    Object.keys(localStorageData).forEach(key => delete localStorageData[key]);
  });

  describe('get and set', () => {
    it('should store and retrieve values', () => {
      set('test-key', { foo: 'bar' }, 24);
      const result = get('test-key');
      assert.deepStrictEqual(result, { foo: 'bar' });
    });

    it('should handle complex objects', () => {
      const complex = {
        nested: { array: [1, 2, 3] },
        nullValue: null,
        boolValue: true,
      };
      set('complex', complex, 1);
      assert.deepStrictEqual(get('complex'), complex);
    });

    it('should return null for expired entries', async () => {
      set('expiring', 'value', 0.001); // 0.001 hours = 3.6 seconds
      await new Promise(resolve => setTimeout(resolve, 50));
      assert.strictEqual(get('expiring'), null);
    });

    it('should return null for non-existent keys', () => {
      assert.strictEqual(get('non-existent'), null);
    });
  });

  describe('clearExpired - new method', () => {
    it('should remove only expired entries', async () => {
      set('valid-1', 'data1', 24);
      set('valid-2', 'data2', 24);
      set('expired-1', 'old1', 0.001);
      set('expired-2', 'old2', 0.001);

      await new Promise(resolve => setTimeout(resolve, 50));

      const changed = clearExpired();
      assert.strictEqual(changed, true, 'should return true when entries removed');

      assert.strictEqual(get('valid-1'), 'data1');
      assert.strictEqual(get('valid-2'), 'data2');
      assert.strictEqual(get('expired-1'), null);
      assert.strictEqual(get('expired-2'), null);
    });

    it('should preserve valid entries', () => {
      set('key-1', 'value-1', 24);
      set('key-2', 'value-2', 24);

      const changed = clearExpired();
      assert.strictEqual(changed, false, 'should return false when nothing removed');

      assert.strictEqual(get('key-1'), 'value-1');
      assert.strictEqual(get('key-2'), 'value-2');
    });

    it('should persist after cleanup', async () => {
      set('keep', 'this', 24);
      set('remove', 'that', 0.001);

      await new Promise(resolve => setTimeout(resolve, 50));
      clearExpired();

      // Verify persisted to localStorage
      const stored = JSON.parse(localStorageData['tmdb.metadata.cache.v1'] || '[]');
      const keys = stored.map(([key]) => key);
      assert.ok(keys.includes('keep'));
      assert.ok(!keys.includes('remove'));
    });
  });

  describe('size - new method', () => {
    it('should return correct entry count', () => {
      assert.strictEqual(size(), 0);

      set('a', 1, 24);
      assert.strictEqual(size(), 1);

      set('b', 2, 24);
      assert.strictEqual(size(), 2);

      set('c', 3, 24);
      assert.strictEqual(size(), 3);
    });

    it('should update after set/delete', () => {
      set('x', 'data', 24);
      assert.strictEqual(size(), 1);

      clear('x');
      assert.strictEqual(size(), 0);
    });

    it('should count entries after load from localStorage', () => {
      set('persisted-1', 'data', 24);
      set('persisted-2', 'data', 24);

      // Simulate reload by creating new store
      const newStore = createCacheStore({ storageKey: 'tmdb.metadata.cache.v1' });
      const count = newStore.size();
      assert.strictEqual(count, 2);
    });
  });

  describe('clear with prefix', () => {
    it('should clear entries by prefix', () => {
      set('tmdb:movie:1', 'data1', 24);
      set('tmdb:movie:2', 'data2', 24);
      set('tmdb:tv:1', 'data3', 24);

      clear('tmdb:movie');

      assert.strictEqual(get('tmdb:movie:1'), null);
      assert.strictEqual(get('tmdb:movie:2'), null);
      assert.strictEqual(get('tmdb:tv:1'), 'data3');
    });

    it('should clear all entries when no prefix', () => {
      set('a', 1, 24);
      set('b', 2, 24);
      set('c', 3, 24);

      clear();

      assert.strictEqual(get('a'), null);
      assert.strictEqual(get('b'), null);
      assert.strictEqual(get('c'), null);
      assert.strictEqual(size(), 0);
    });
  });

  describe('TTL handling', () => {
    it('should auto-remove on get if expired', async () => {
      set('auto-expire', 'value', 0.001);

      // Should exist immediately
      assert.strictEqual(get('auto-expire'), 'value');

      await new Promise(resolve => setTimeout(resolve, 50));

      // Should be auto-removed
      assert.strictEqual(get('auto-expire'), null);
      assert.strictEqual(size(), 0);
    });

    it('should handle fractional hours correctly', async () => {
      // 0.01 hours = 36 seconds
      set('short-ttl', 'value', 0.01);

      // Should be valid for at least 20 seconds
      await new Promise(resolve => setTimeout(resolve, 20));
      assert.strictEqual(get('short-ttl'), 'value');
    });
  });

  describe('persistence', () => {
    it('should survive reload from localStorage', () => {
      set('persistent-key', { data: 'value' }, 24);

      // Create new store instance (simulates page reload)
      const newStore = createCacheStore({ storageKey: 'tmdb.metadata.cache.v1' });
      const retrieved = newStore.get('persistent-key');

      assert.deepStrictEqual(retrieved, { data: 'value' });
    });

    it('should handle corrupt localStorage data', () => {
      localStorageData['tmdb.metadata.cache.v1'] = 'not-valid-json';

      const store = createCacheStore({ storageKey: 'tmdb.metadata.cache.v1' });

      // Should not throw, should start with empty store
      assert.strictEqual(store.size(), 0);
      assert.strictEqual(store.get('anything'), null);
    });

    it('should handle missing localStorage gracefully', () => {
      const originalLS = global.localStorage;
      global.localStorage = undefined;

      try {
        const store = createCacheStore();
        store.set('test', 'data', 1);

        // Should work in memory-only mode
        assert.strictEqual(store.get('test'), 'data');
      } finally {
        global.localStorage = originalLS;
      }
    });
  });

  describe('createCacheStore with custom options', () => {
    it('should use custom storageKey', () => {
      const customStore = createCacheStore({ storageKey: 'my-custom-cache' });
      customStore.set('test', 'value', 1);

      assert.ok(localStorageData['my-custom-cache']);
      assert.ok(!localStorageData['tmdb.metadata.cache.v1']);
    });

    it('should isolate stores by storageKey', () => {
      const store1 = createCacheStore({ storageKey: 'cache-1' });
      const store2 = createCacheStore({ storageKey: 'cache-2' });

      store1.set('key', 'value-1', 1);
      store2.set('key', 'value-2', 1);

      assert.strictEqual(store1.get('key'), 'value-1');
      assert.strictEqual(store2.get('key'), 'value-2');
    });
  });

  describe('edge cases', () => {
    it('should handle null/undefined values', () => {
      set('null-value', null, 1);
      set('undefined-value', undefined, 1);

      assert.strictEqual(get('null-value'), null);
      assert.strictEqual(get('undefined-value'), undefined);
    });

    it('should handle empty string key', () => {
      set('', 'data', 1);
      // Empty keys are not stored
      assert.strictEqual(get(''), null);
    });

    it('should handle very large objects', () => {
      const large = { items: new Array(1000).fill({ id: 1, name: 'test' }) };
      set('large-obj', large, 1);

      const retrieved = get('large-obj');
      assert.strictEqual(retrieved.items.length, 1000);
    });
  });
});
