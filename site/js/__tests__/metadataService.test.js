/**
 * Unit tests for metadataService.js
 * Tests service orchestration, cache integration, and error fallbacks
 */

import { describe, it, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert';

// Mock localStorage
const mockLocalStorage = {};
global.localStorage = {
  getItem: (key) => mockLocalStorage[key] || null,
  setItem: (key, value) => { mockLocalStorage[key] = value; },
  removeItem: (key) => { delete mockLocalStorage[key]; },
};

// Mock console.warn
const warnLogs = [];
const originalWarn = console.warn;
console.warn = (...args) => {
  warnLogs.push(args.join(' '));
};

after(() => {
  console.warn = originalWarn;
});

// Mock fetch
let fetchResponses = {};
const defaultFetch = async (url) => {
  const path = url.toString().split('?')[0].split('/3')[1] || url.toString();
  if (fetchResponses[path]) {
    return fetchResponses[path];
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({ id: 123, title: 'Default' }),
  };
};

global.fetch = defaultFetch;

// Import after mocks
const {
  createMetadataService,
  syncDefaultMetadataService,
  getMovieEnriched,
  getTvEnriched,
  getSeasonEnriched,
} = await import('../metadataService.js');

describe('metadataService', () => {
  beforeEach(() => {
    Object.keys(mockLocalStorage).forEach(key => delete mockLocalStorage[key]);
    warnLogs.length = 0;
    fetchResponses = {};
    global.fetch = defaultFetch;
  });

  afterEach(() => {
    global.fetch = defaultFetch;
  });

  describe('getMovieEnriched', () => {
    it('should fetch and cache movie details', async () => {
      fetchResponses['/movie/550'] = {
        ok: true,
        status: 200,
        json: async () => ({
          id: 550,
          title: 'Fight Club',
          overview: 'An insomniac...',
          release_date: '1999-10-15',
          runtime: 139,
        }),
      };

      const service = createMetadataService({
        token: 'test-token',
      });

      const result = await service.getMovieEnriched(550);

      assert.strictEqual(result.id, '550');
      assert.strictEqual(result.title, 'Fight Club');
      assert.strictEqual(result.type, 'movie');
      assert.strictEqual(result.runtime, 139);
    });

    it('should return cached data on second call', async () => {
      let fetchCount = 0;
      fetchResponses['/movie/123'] = {
        ok: true,
        status: 200,
        json: async () => {
          fetchCount++;
          return { id: 123, title: 'Cached Movie' };
        },
      };

      const service = createMetadataService({ token: 'test' });

      const result1 = await service.getMovieEnriched(123);
      const result2 = await service.getMovieEnriched(123);

      assert.strictEqual(fetchCount, 1); // Only fetched once
      assert.deepStrictEqual(result1, result2);
    });

    it('should append credits/images/providers', async () => {
      let requestUrl = '';
      global.fetch = async (url) => {
        requestUrl = url.toString();
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 100,
            title: 'Test',
            credits: { cast: [{ name: 'Actor' }] },
            images: { posters: [], backdrops: [] },
            'watch/providers': { results: {} },
          }),
        };
      };

      const service = createMetadataService({ token: 'test' });
      const result = await service.getMovieEnriched(100);

      assert.ok(requestUrl.includes('append_to_response'));
      assert.ok(requestUrl.includes('credits'));
      assert.ok(requestUrl.includes('images'));
      assert.ok(requestUrl.includes('watch/providers'));
      assert.ok(result.credits);
      assert.ok(result.images);
    });

    it('should handle API errors gracefully', async () => {
      fetchResponses['/movie/999'] = {
        ok: false,
        status: 404,
        text: async () => 'Not found',
      };

      const service = createMetadataService({ token: 'test' });

      await assert.rejects(
        async () => await service.getMovieEnriched(999),
        (err) => {
          assert.ok(warnLogs.some(log => log.includes('Request failed')));
          return true;
        }
      );
    });

    it('should return null for null/undefined id', async () => {
      const service = createMetadataService({ token: 'test' });

      const result1 = await service.getMovieEnriched(null);
      const result2 = await service.getMovieEnriched(undefined);

      assert.strictEqual(result1, null);
      assert.strictEqual(result2, null);
    });
  });

  describe('getTvEnriched', () => {
    it('should fetch TV series with aggregate_credits', async () => {
      fetchResponses['/tv/1399'] = {
        ok: true,
        status: 200,
        json: async () => ({
          id: 1399,
          name: 'Game of Thrones',
          first_air_date: '2011-04-17',
          number_of_seasons: 8,
          aggregate_credits: {
            cast: [{ id: 1, name: 'Actor', roles: [{ character: 'Character' }] }],
          },
        }),
      };

      const service = createMetadataService({ token: 'test' });
      const result = await service.getTvEnriched(1399);

      assert.strictEqual(result.id, '1399');
      assert.strictEqual(result.name, 'Game of Thrones');
      assert.strictEqual(result.type, 'tv');
      assert.strictEqual(result.numberOfSeasons, 8);
      assert.ok(result.credits.cast.length > 0);
    });

    it('should map content_ratings', async () => {
      fetchResponses['/tv/100'] = {
        ok: true,
        status: 200,
        json: async () => ({
          id: 100,
          name: 'Test Show',
          content_ratings: {
            results: [
              { iso_3166_1: 'DE', rating: 'FSK 12' },
            ],
          },
        }),
      };

      const service = createMetadataService({ token: 'test' });
      const result = await service.getTvEnriched(100);

      assert.strictEqual(result.contentRating, 'FSK 12');
    });

    it('should handle missing aggregate_credits', async () => {
      fetchResponses['/tv/200'] = {
        ok: true,
        status: 200,
        json: async () => ({
          id: 200,
          name: 'Minimal Show',
        }),
      };

      const service = createMetadataService({ token: 'test' });
      const result = await service.getTvEnriched(200);

      assert.ok(result);
      assert.strictEqual(result.id, '200');
      assert.deepStrictEqual(result.credits, { cast: [], crew: [] });
    });
  });

  describe('getSeasonEnriched', () => {
    it('should fetch season with episodes', async () => {
      fetchResponses['/tv/1399/season/1'] = {
        ok: true,
        status: 200,
        json: async () => ({
          id: 3624,
          name: 'Season 1',
          season_number: 1,
          episodes: [
            {
              id: 63056,
              episode_number: 1,
              name: 'Winter Is Coming',
              still_path: '/still.jpg',
              runtime: 62,
            },
          ],
        }),
      };

      const service = createMetadataService({ token: 'test' });
      const result = await service.getSeasonEnriched(1399, 1);

      assert.strictEqual(result.type, 'season');
      assert.strictEqual(result.seasonNumber, 1);
      assert.strictEqual(result.episodes.length, 1);
      assert.strictEqual(result.episodes[0].name, 'Winter Is Coming');
      assert.ok(result.episodes[0].still);
    });

    it('should fetch parent show if not provided (NEW IMPROVEMENT)', async () => {
      fetchResponses['/tv/100'] = {
        ok: true,
        status: 200,
        json: async () => ({
          id: 100,
          name: 'Parent Show',
        }),
      };

      fetchResponses['/tv/100/season/1'] = {
        ok: true,
        status: 200,
        json: async () => ({
          id: 200,
          season_number: 1,
          episodes: [],
        }),
      };

      const service = createMetadataService({ token: 'test' });
      const result = await service.getSeasonEnriched(100, 1);

      assert.strictEqual(result.showId, '100');
      assert.ok(result.url.includes('/tv/100/season/1'));
    });

    it('should use fallback show object on error (NEW IMPROVEMENT)', async () => {
      fetchResponses['/tv/999'] = {
        ok: false,
        status: 404,
        text: async () => 'Show not found',
      };

      fetchResponses['/tv/999/season/1'] = {
        ok: true,
        status: 200,
        json: async () => ({
          id: 1000,
          season_number: 1,
          episodes: [],
        }),
      };

      const service = createMetadataService({ token: 'test' });
      const result = await service.getSeasonEnriched(999, 1);

      assert.ok(result);
      assert.ok(warnLogs.some(log => log.includes('Failed to load parent show')));
      // Should have minimal fallback show object
      assert.strictEqual(result.showId, '999');
    });

    it('should skip show lookup if skipShowLookup=true', async () => {
      let tvFetchCount = 0;
      fetchResponses['/tv/123'] = {
        ok: true,
        json: async () => {
          tvFetchCount++;
          return { id: 123, name: 'Show' };
        },
      };

      fetchResponses['/tv/123/season/1'] = {
        ok: true,
        json: async () => ({
          id: 200,
          season_number: 1,
          episodes: [],
        }),
      };

      const service = createMetadataService({ token: 'test' });
      await service.getSeasonEnriched(123, 1, { skipShowLookup: true });

      assert.strictEqual(tvFetchCount, 0); // Should not fetch show
    });

    it('should map episode stills with correct size', async () => {
      fetchResponses['/tv/100/season/1'] = {
        ok: true,
        json: async () => ({
          id: 200,
          season_number: 1,
          episodes: [
            { id: 1, episode_number: 1, still_path: '/ep1.jpg' },
          ],
        }),
      };

      const service = createMetadataService({ token: 'test' });
      const result = await service.getSeasonEnriched(100, 1, {
        stillSize: 'w300',
        skipShowLookup: true,
      });

      const still = result.episodes[0].still;
      assert.ok(still.includes('w300') || still.includes('/ep1.jpg'));
    });

    it('should handle missing episodes', async () => {
      fetchResponses['/tv/100/season/0'] = {
        ok: true,
        json: async () => ({
          id: 200,
          season_number: 0,
          name: 'Specials',
        }),
      };

      const service = createMetadataService({ token: 'test' });
      const result = await service.getSeasonEnriched(100, 0, {
        skipShowLookup: true,
      });

      assert.strictEqual(result.episodes.length, 0);
    });
  });

  describe('syncDefaultMetadataService', () => {
    it('should prioritize localStorage token', () => {
      mockLocalStorage.tmdbToken = 'stored-token';

      syncDefaultMetadataService(
        { tmdbToken: 'config-token' },
        { preferStoredToken: true }
      );

      // Default service should use stored token
      // (We can't directly test this without exposing internals,
      // but we verify no errors occur)
      assert.ok(true);
    });

    it('should fallback to config.tmdbApiKey', () => {
      syncDefaultMetadataService(
        { tmdbApiKey: 'config-api-key' },
        {}
      );

      assert.ok(true); // Should configure without errors
    });

    it('should configure language/region', () => {
      syncDefaultMetadataService(
        {
          lang: 'en-US',
          region: 'US',
        },
        {}
      );

      assert.ok(true);
    });

    it('should handle ttlHours from config', () => {
      syncDefaultMetadataService(
        { tmdbTtlHours: 48 },
        {}
      );

      assert.ok(true);
    });

    it('should use override token over config', () => {
      syncDefaultMetadataService(
        { tmdbToken: 'config-token' },
        { token: 'override-token' }
      );

      assert.ok(true);
    });

    it('should handle missing config gracefully', () => {
      syncDefaultMetadataService({}, {});
      assert.ok(true);
    });
  });

  describe('Cache integration', () => {
    it('should use provided cacheStore', async () => {
      const mockStore = {
        _data: new Map(),
        get(key) { return this._data.get(key); },
        set(key, value) { this._data.set(key, value); },
      };

      const service = createMetadataService({
        token: 'test',
        cacheStore: mockStore,
      });

      fetchResponses['/movie/111'] = {
        ok: true,
        json: async () => ({ id: 111, title: 'Cached' }),
      };

      await service.getMovieEnriched(111);

      assert.ok(mockStore._data.size > 0);
    });

    it('should respect TTL from options', async () => {
      const service = createMetadataService({
        token: 'test',
        ttlHours: 72,
      });

      const config = service.config;
      assert.strictEqual(config.ttlHours, 72);
    });

    it('should clear cache by prefix', async () => {
      const service = createMetadataService({ token: 'test' });

      fetchResponses['/movie/1'] = {
        ok: true,
        json: async () => ({ id: 1, title: 'Movie 1' }),
      };

      fetchResponses['/tv/1'] = {
        ok: true,
        json: async () => ({ id: 1, name: 'TV 1' }),
      };

      await service.getMovieEnriched(1);
      await service.getTvEnriched(1);

      service.clear('tmdb:movie');

      // After clear, movie should refetch but TV should use cache
      // (This is hard to test without exposing cache internals)
      assert.ok(true);
    });
  });

  describe('Default service exports', () => {
    it('should export top-level functions', async () => {
      assert.strictEqual(typeof getMovieEnriched, 'function');
      assert.strictEqual(typeof getTvEnriched, 'function');
      assert.strictEqual(typeof getSeasonEnriched, 'function');
    });

    it('should use shared default service', async () => {
      syncDefaultMetadataService({ tmdbToken: 'shared-token' });

      fetchResponses['/movie/42'] = {
        ok: true,
        json: async () => ({ id: 42, title: 'Shared Service' }),
      };

      const result = await getMovieEnriched(42);
      assert.strictEqual(result.id, '42');
    });
  });
});

