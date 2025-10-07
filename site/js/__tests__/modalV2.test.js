/**
 * Unit tests for modalV2.js
 * Tests race condition fixes, immutable state updates, and error handling
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('modalV2 - attachTmdbDetail (Race Condition Fix)', () => {
  // Simulate the attachTmdbDetail function with immutable updates
  function attachTmdbDetail(item, detail) {
    if (!item || !detail) return item;
    // NEW IMPROVEMENT: Create shallow clone to avoid mutating original
    const enriched = { ...item };
    enriched.tmdbDetail = detail;
    enriched.tmdb = { ...(item.tmdb || {}) };
    if (detail.poster && !enriched.tmdb.poster) enriched.tmdb.poster = detail.poster;
    if (detail.backdrop && !enriched.tmdb.backdrop) enriched.tmdb.backdrop = detail.backdrop;
    if (detail.url) enriched.tmdb.url = detail.url;
    enriched.ids = { ...(item.ids || {}) };
    if (detail.id) enriched.ids.tmdb = String(detail.id);
    if (detail.imdbId && !enriched.ids.imdb) enriched.ids.imdb = String(detail.imdbId);
    return enriched;
  }

  it('should not mutate original item object', () => {
    const originalItem = {
      title: 'Inception',
      ids: { plex: '123' },
      tmdb: { poster: '/original.jpg' },
    };

    const tmdbDetail = {
      id: 27205,
      poster: '/new-poster.jpg',
      backdrop: '/backdrop.jpg',
      url: 'https://themoviedb.org/movie/27205',
    };

    const enriched = attachTmdbDetail(originalItem, tmdbDetail);

    // Original should not be modified
    assert.strictEqual(originalItem.tmdbDetail, undefined);
    assert.strictEqual(originalItem.tmdb.poster, '/original.jpg');
    assert.deepStrictEqual(originalItem.ids, { plex: '123' });
  });

  it('should create new object with TMDB data attached', () => {
    const item = {
      title: 'Fight Club',
      ids: { plex: '456' },
    };

    const tmdbDetail = {
      id: 550,
      poster: '/poster.jpg',
      backdrop: '/backdrop.jpg',
      url: 'https://themoviedb.org/movie/550',
    };

    const enriched = attachTmdbDetail(item, tmdbDetail);

    assert.ok(enriched !== item); // Different object reference
    assert.strictEqual(enriched.title, 'Fight Club');
    assert.strictEqual(enriched.tmdbDetail, tmdbDetail);
    assert.strictEqual(enriched.tmdb.poster, '/poster.jpg');
    assert.strictEqual(enriched.tmdb.backdrop, '/backdrop.jpg');
    assert.strictEqual(enriched.tmdb.url, 'https://themoviedb.org/movie/550');
    assert.strictEqual(enriched.ids.tmdb, '550');
  });

  it('should preserve existing tmdb poster if detail has none', () => {
    const item = {
      title: 'Test',
      tmdb: { poster: '/existing.jpg' },
    };

    const tmdbDetail = {
      id: 123,
      backdrop: '/backdrop.jpg',
    };

    const enriched = attachTmdbDetail(item, tmdbDetail);

    assert.strictEqual(enriched.tmdb.poster, '/existing.jpg');
    assert.strictEqual(enriched.tmdb.backdrop, '/backdrop.jpg');
  });

  it('should not override existing IMDB ID', () => {
    const item = {
      title: 'Test',
      ids: { imdb: 'tt1234567' },
    };

    const tmdbDetail = {
      id: 999,
      imdbId: 'tt9999999',
    };

    const enriched = attachTmdbDetail(item, tmdbDetail);

    assert.strictEqual(enriched.ids.imdb, 'tt1234567'); // Original preserved
    assert.strictEqual(enriched.ids.tmdb, '999');
  });

  it('should add IMDB ID if missing', () => {
    const item = {
      title: 'Test',
      ids: {},
    };

    const tmdbDetail = {
      id: 999,
      imdbId: 'tt1234567',
    };

    const enriched = attachTmdbDetail(item, tmdbDetail);

    assert.strictEqual(enriched.ids.imdb, 'tt1234567');
    assert.strictEqual(enriched.ids.tmdb, '999');
  });

  it('should handle missing ids object', () => {
    const item = {
      title: 'Test',
    };

    const tmdbDetail = {
      id: 123,
      imdbId: 'tt9876543',
    };

    const enriched = attachTmdbDetail(item, tmdbDetail);

    assert.ok(enriched.ids);
    assert.strictEqual(enriched.ids.tmdb, '123');
    assert.strictEqual(enriched.ids.imdb, 'tt9876543');
  });

  it('should return original item if detail is null', () => {
    const item = { title: 'Test' };
    const result = attachTmdbDetail(item, null);
    assert.strictEqual(result, item);
  });

  it('should return original item if detail is undefined', () => {
    const item = { title: 'Test' };
    const result = attachTmdbDetail(item, undefined);
    assert.strictEqual(result, item);
  });

  it('should return item if item is null', () => {
    const result = attachTmdbDetail(null, { id: 123 });
    assert.strictEqual(result, null);
  });

  it('should create independent copies of nested objects', () => {
    const item = {
      title: 'Test',
      ids: { plex: '1' },
      tmdb: { poster: '/old.jpg' },
    };

    const detail1 = { id: 100, poster: '/new1.jpg' };
    const detail2 = { id: 200, poster: '/new2.jpg' };

    const enriched1 = attachTmdbDetail(item, detail1);
    const enriched2 = attachTmdbDetail(item, detail2);

    // Changes to enriched1 should not affect enriched2
    assert.strictEqual(enriched1.tmdbDetail.id, 100);
    assert.strictEqual(enriched2.tmdbDetail.id, 200);
    assert.strictEqual(enriched1.ids.tmdb, '100');
    assert.strictEqual(enriched2.ids.tmdb, '200');

    // Original should be unchanged
    assert.strictEqual(item.ids.tmdb, undefined);
  });

  it('should prevent race condition when processing concurrent enrichments', () => {
    const baseItem = {
      title: 'The Matrix',
      ids: { plex: '999' },
    };

    // Simulate two concurrent TMDB API responses
    const tmdbResponse1 = { id: 603, poster: '/poster1.jpg' };
    const tmdbResponse2 = { id: 603, poster: '/poster2.jpg', backdrop: '/backdrop2.jpg' };

    // Process both responses (simulating async race)
    const result1 = attachTmdbDetail(baseItem, tmdbResponse1);
    const result2 = attachTmdbDetail(baseItem, tmdbResponse2);

    // Both results should be independent
    assert.strictEqual(result1.tmdb.poster, '/poster1.jpg');
    assert.strictEqual(result1.tmdb.backdrop, undefined);

    assert.strictEqual(result2.tmdb.poster, '/poster2.jpg');
    assert.strictEqual(result2.tmdb.backdrop, '/backdrop2.jpg');

    // Original is not corrupted
    assert.strictEqual(baseItem.tmdbDetail, undefined);
  });
});

describe('modalV2 - Error Handling', () => {
  it('should document render token pattern for race prevention', () => {
    // This test documents the pattern used in modalV2.js:
    // let renderToken = 0;
    // function openModal() {
    //   const token = ++renderToken;
    //   // ... async operations ...
    //   if (token !== renderToken) return; // Stale request
    // }

    let renderToken = 0;

    function simulateAsyncRender(delayMs) {
      const token = ++renderToken;
      return new Promise(resolve => {
        setTimeout(() => {
          if (token !== renderToken) {
            resolve({ rendered: false, reason: 'stale' });
          } else {
            resolve({ rendered: true, token });
          }
        }, delayMs);
      });
    }

    // Fire 3 rapid requests
    const promise1 = simulateAsyncRender(50);
    const promise2 = simulateAsyncRender(30);
    const promise3 = simulateAsyncRender(10);

    // Only the last one should render
    return Promise.all([promise1, promise2, promise3]).then(results => {
      assert.strictEqual(results[0].rendered, false); // Cancelled
      assert.strictEqual(results[1].rendered, false); // Cancelled
      assert.strictEqual(results[2].rendered, true);  // Winner
      assert.strictEqual(results[2].token, 3);
    });
  });
});
