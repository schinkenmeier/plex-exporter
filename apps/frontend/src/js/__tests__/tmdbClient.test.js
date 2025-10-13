/**
 * Unit tests for tmdbClient.js
 * Tests retry logic, rate limiting, credential handling, and caching
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

// Mock globals
const mockLocalStorage = {};
global.localStorage = {
  getItem: (key) => mockLocalStorage[key] || null,
  setItem: (key, value) => { mockLocalStorage[key] = value; },
  removeItem: (key) => { delete mockLocalStorage[key]; },
};

let fetchCalls = [];
let mockFetchResponse = null;

const defaultFetch = async (url, init) => {
  fetchCalls.push({ url, init });
  if (mockFetchResponse) {
    return mockFetchResponse;
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({ id: 123, title: 'Test' }),
  };
};

global.fetch = defaultFetch;

// Import after mocks
const { createTmdbClient } = await import('../tmdbClient.js');

describe('tmdbClient', () => {
  beforeEach(() => {
    fetchCalls = [];
    mockFetchResponse = null;
    Object.keys(mockLocalStorage).forEach(key => delete mockLocalStorage[key]);
    global.fetch = defaultFetch;
  });

  afterEach(() => {
    global.fetch = defaultFetch;
  });

  describe('createTmdbClient - credential handling', () => {
    it('should use Bearer token over API key', async () => {
      const client = createTmdbClient({
        token: 'test-token',
        apiKey: 'test-api-key',
      });

      await client.get('/test');

      const call = fetchCalls[0];
      assert.ok(call.init.headers.Authorization);
      assert.strictEqual(call.init.headers.Authorization, 'Bearer test-token');
      assert.ok(!call.url.includes('api_key='));
    });

    it('should use API key if no token provided', async () => {
      const client = createTmdbClient({
        apiKey: 'test-api-key',
      });

      await client.get('/test');

      const call = fetchCalls[0];
      assert.ok(call.url.includes('api_key=test-api-key'));
      assert.ok(!call.init.headers.Authorization);
    });

    it('should read token from localStorage fallback', async () => {
      mockLocalStorage.tmdbToken = 'stored-token';

      const client = createTmdbClient({});

      await client.get('/test');

      const call = fetchCalls[0];
      assert.strictEqual(call.init.headers.Authorization, 'Bearer stored-token');
    });

    it('should handle missing credentials gracefully', async () => {
      const client = createTmdbClient({});

      await client.get('/test');

      // Should still make request (credential might be optional for some endpoints)
      assert.strictEqual(fetchCalls.length, 1);
    });

    it('should normalize credential from options.credentials', async () => {
      const client = createTmdbClient({
        credentials: { token: 'nested-token' },
      });

      await client.get('/test');

      const call = fetchCalls[0];
      assert.strictEqual(call.init.headers.Authorization, 'Bearer nested-token');
    });

    it('should prioritize options over settings', async () => {
      const client = createTmdbClient({
        token: 'direct-token',
        settings: { tmdbToken: 'settings-token' },
      });

      await client.get('/test');

      const call = fetchCalls[0];
      assert.strictEqual(call.init.headers.Authorization, 'Bearer direct-token');
    });
  });

  describe('Retry Logic', () => {
    it('should retry on 429 with exponential backoff', async () => {
      let attemptCount = 0;

      mockFetchResponse = {
        ok: false,
        status: 429,
        headers: { get: () => null },
        text: async () => 'Rate limited',
      };

      global.fetch = async (url, init) => {
        fetchCalls.push({ url, init });
        attemptCount++;
        if (attemptCount < 3) {
          return mockFetchResponse;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        };
      };

      const client = createTmdbClient({ apiKey: 'test' });
      const result = await client.get('/test');

      assert.strictEqual(attemptCount, 3);
      assert.deepStrictEqual(result, { success: true });
    });

    it('should respect Retry-After header', async () => {
      const startTime = Date.now();

      mockFetchResponse = {
        ok: false,
        status: 429,
        headers: { get: (name) => name === 'Retry-After' ? '1' : null }, // 1 second
        text: async () => 'Rate limited',
      };

      let callCount = 0;
      global.fetch = async () => {
        fetchCalls.push({ time: Date.now() - startTime });
        callCount++;
        if (callCount === 1) {
          return mockFetchResponse;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        };
      };

      const client = createTmdbClient({ apiKey: 'test' });
      await client.get('/test');

      // Second call should be delayed by ~1000ms
      assert.ok(fetchCalls[1].time >= 900, 'Should wait at least 900ms');
    });

    it('should stop after MAX_RETRIES attempts', async () => {
      mockFetchResponse = {
        ok: false,
        status: 500,
        headers: { get: () => null },
        text: async () => 'Server error',
      };

      const client = createTmdbClient({ apiKey: 'test' });

      await assert.rejects(
        async () => await client.get('/test'),
        (err) => {
          // Should attempt 1 initial + 4 retries = 5 total
          assert.strictEqual(fetchCalls.length, 5);
          return true;
        }
      );
    });

    it('should not retry on 404', async () => {
      mockFetchResponse = {
        ok: false,
        status: 404,
        headers: { get: () => null },
        text: async () => 'Not found',
      };

      const client = createTmdbClient({ apiKey: 'test' });

      await assert.rejects(
        async () => await client.get('/test'),
        (err) => {
          assert.strictEqual(err.status, 404);
          assert.strictEqual(fetchCalls.length, 1); // No retries
          return true;
        }
      );
    });

    it('should include error details in thrown error', async () => {
      mockFetchResponse = {
        ok: false,
        status: 401,
        headers: { get: () => null },
        text: async () => 'Unauthorized',
      };

      const client = createTmdbClient({ apiKey: 'test' });

      await assert.rejects(
        async () => await client.get('/test/path'),
        (err) => {
          assert.strictEqual(err.status, 401);
          assert.ok(err.message.includes('401'));
          assert.ok(err.url.includes('/test/path'));
          assert.strictEqual(err.body, 'Unauthorized');
          return true;
        }
      );
    });
  });

  describe('Caching', () => {
    it('should cache successful responses', async () => {
      const cache = new Map();
      const client = createTmdbClient({
        apiKey: 'test',
        cache,
      });

      const result1 = await client.get('/movie/123');
      const result2 = await client.get('/movie/123');

      assert.strictEqual(fetchCalls.length, 1); // Only one actual fetch
      assert.deepStrictEqual(result1, result2);
      assert.ok(cache.size > 0);
    });

    it('should use cacheStore if provided', async () => {
      const store = {
        _data: new Map(),
        get(key) { return this._data.get(key); },
        set(key, value) { this._data.set(key, value); },
      };

      const client = createTmdbClient({
        apiKey: 'test',
        cacheStore: store,
      });

      await client.get('/movie/456');
      await client.get('/movie/456');

      assert.strictEqual(fetchCalls.length, 1);
      assert.ok(store._data.size > 0);
    });

    it('should not cache if no cache provided', async () => {
      const client = createTmdbClient({
        apiKey: 'test',
      });

      await client.get('/movie/789');
      await client.get('/movie/789');

      assert.strictEqual(fetchCalls.length, 2);
    });
  });

  describe('URL Building', () => {
    it('should build correct URL with params', async () => {
      const client = createTmdbClient({
        apiKey: 'test',
        language: 'de-DE',
        region: 'DE',
      });

      await client.get('/movie/123', { page: 1 });

      const url = fetchCalls[0].url;
      assert.ok(url.includes('/movie/123'));
      assert.ok(url.includes('language=de-DE'));
      assert.ok(url.includes('region=DE'));
      assert.ok(url.includes('page=1'));
    });

    it('should handle append_to_response', async () => {
      const client = createTmdbClient({ apiKey: 'test' });

      await client.get('/movie/123', {
        append_to_response: 'credits,images',
      });

      const url = fetchCalls[0].url;
      assert.ok(url.includes('append_to_response=credits%2Cimages'));
    });

    it('should merge append params from options', async () => {
      const client = createTmdbClient({ apiKey: 'test' });

      await client.get('/movie/123', { append_to_response: 'credits' }, {
        append: 'images,videos',
      });

      const url = fetchCalls[0].url;
      assert.ok(url.includes('append_to_response='));
      assert.ok(url.includes('credits'));
      assert.ok(url.includes('images'));
      assert.ok(url.includes('videos'));
    });

    it('should handle array parameters', async () => {
      const client = createTmdbClient({ apiKey: 'test' });

      await client.get('/discover/movie', {
        with_genres: [28, 12, 878],
      });

      const url = fetchCalls[0].url;
      assert.ok(url.includes('with_genres=28%2C12%2C878'));
    });

    it('should skip null/undefined parameters', async () => {
      const client = createTmdbClient({ apiKey: 'test' });

      await client.get('/test', {
        valid: 'value',
        nullParam: null,
        undefinedParam: undefined,
      });

      const url = fetchCalls[0].url;
      assert.ok(url.includes('valid=value'));
      assert.ok(!url.includes('nullParam'));
      assert.ok(!url.includes('undefinedParam'));
    });

    it('should normalize API base URL', async () => {
      const client = createTmdbClient({
        apiKey: 'test',
        apiBase: 'https://custom.api.com/',
      });

      await client.get('/movie/123');

      const url = fetchCalls[0].url;
      assert.ok(url.startsWith('https://custom.api.com/movie/123'));
      assert.ok(!url.includes('//movie')); // No double slash
    });
  });

  describe('Config', () => {
    it('should expose credential info', () => {
      const client = createTmdbClient({
        token: 'test-token',
      });

      assert.strictEqual(client.credential.kind, 'bearer');
      assert.strictEqual(client.credential.value, 'test-token');
    });

    it('should expose config', () => {
      const client = createTmdbClient({
        apiBase: 'https://custom.api.com',
        language: 'en-US',
        region: 'US',
        ttlHours: 48,
      });

      const config = client.config;
      assert.strictEqual(config.apiBase, 'https://custom.api.com');
      assert.strictEqual(config.language, 'en-US');
      assert.strictEqual(config.region, 'US');
      assert.strictEqual(config.ttlHours, 48);
    });

    it('should use defaults if not provided', () => {
      const client = createTmdbClient({});

      const config = client.config;
      assert.strictEqual(config.apiBase, 'https://api.themoviedb.org/3');
      assert.strictEqual(config.language, 'de-DE');
      assert.strictEqual(config.region, 'DE');
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      global.fetch = async () => {
        throw new Error('Network failure');
      };

      const client = createTmdbClient({ apiKey: 'test' });

      await assert.rejects(
        async () => await client.get('/test'),
        (err) => {
          assert.ok(err.message.includes('Network failure'));
          return true;
        }
      );
    });

    it('should handle JSON parse errors', async () => {
      mockFetchResponse = {
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      };

      const client = createTmdbClient({ apiKey: 'test' });

      await assert.rejects(
        async () => await client.get('/test'),
        (err) => {
          assert.ok(err.message.includes('Invalid JSON'));
          return true;
        }
      );
    });

    it('should handle 204 No Content', async () => {
      mockFetchResponse = {
        ok: true,
        status: 204,
      };

      const client = createTmdbClient({ apiKey: 'test' });
      const result = await client.get('/test');

      assert.strictEqual(result, null);
    });
  });
});
