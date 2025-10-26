import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

const originalWindow = global.window;
const originalDocument = global.document;
const originalLocalStorage = global.localStorage;
const originalFetch = global.fetch;

if(typeof global.window === 'undefined') global.window = { __PLEX_EXPORTER__: {} };
if(typeof global.document === 'undefined') global.document = { getElementById: () => null };
if(typeof global.localStorage === 'undefined'){
  const store = new Map();
  global.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: key => { store.delete(key); },
    clear: () => store.clear(),
  };
}

const { prefixThumbValue, prefixMovieThumb, prefixShowThumb, fetchJson, loadMovies, searchLibrary } = await import('../../src/js/data.js');
const { isMovieEntry, isShowEntry, validateLibraryList } = await import('../../src/js/data/validators.js');
const { DEFAULT_PAGE_SIZE } = await import('@plex-exporter/shared');

if(originalWindow === undefined) delete global.window; else global.window = originalWindow;
if(originalDocument === undefined) delete global.document; else global.document = originalDocument;
if(originalLocalStorage === undefined) delete global.localStorage; else global.localStorage = originalLocalStorage;

beforeEach(() => {
  const store = new Map();
  global.window = { __PLEX_EXPORTER__: {} };
  global.document = {
    getElementById: () => null,
    querySelectorAll: () => [],
    body: { children: [], append: () => {}, appendChild: () => {} },
  };
  global.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: key => { store.delete(key); },
    clear: () => store.clear(),
  };
});

afterEach(() => {
  global.fetch = originalFetch;
  if(originalWindow === undefined) delete global.window; else global.window = originalWindow;
  if(originalDocument === undefined) delete global.document; else global.document = originalDocument;
  if(originalLocalStorage === undefined) delete global.localStorage; else global.localStorage = originalLocalStorage;
});

describe('prefixThumbValue', () => {
  it('converts relative paths into thumbnail API URLs', () => {
    const result = prefixThumbValue('../poster.jpg', 'movies');
    assert.strictEqual(result, 'http://localhost/api/thumbnails/movies/poster.jpg');
    assert.ok(!result.includes('../..'));
  });

  it('normalizes backslash parent directory segments', () => {
    const result = prefixThumbValue('..\\poster.jpg', 'movies');
    assert.strictEqual(result, 'http://localhost/api/thumbnails/movies/poster.jpg');
  });

  it('encodes nested segments after sanitizing traversal tokens', () => {
    const result = prefixThumbValue('./covers/../thumbs/.//poster.jpg', 'movies');
    assert.strictEqual(result, 'http://localhost/api/thumbnails/movies/thumbs/poster.jpg');
  });

  it('returns the thumbnail collection root when no segments remain', () => {
    const result = prefixThumbValue('../', 'movies');
    assert.strictEqual(result, 'http://localhost/api/thumbnails/movies');
  });

  it('keeps absolute URLs untouched', () => {
    const absolute = 'https://cdn.example.com/poster.jpg';
    const result = prefixThumbValue(absolute, 'movies');
    assert.strictEqual(result, absolute);
  });
});

describe('prefixThumb helpers', () => {
  it('prefixMovieThumb removes relative segments for thumbFile', () => {
    const movie = { thumb: '../poster.jpg' };
    const result = prefixMovieThumb(movie);
    assert.strictEqual(result.thumb, 'http://localhost/api/thumbnails/movies/poster.jpg');
    assert.strictEqual(result.thumbFile, 'http://localhost/api/thumbnails/movies/poster.jpg');
    assert.ok(!result.thumb.includes('../..'));
  });

  it('prefixShowThumb removes relative segments for thumbFile', () => {
    const show = { thumb: '..\\season/poster.jpg' };
    const result = prefixShowThumb(show);
    assert.strictEqual(result.thumb, 'http://localhost/api/thumbnails/series/season/poster.jpg');
    assert.strictEqual(result.thumbFile, 'http://localhost/api/thumbnails/series/season/poster.jpg');
    assert.ok(!result.thumb.includes('../..'));
  });
});

describe('data loading resilience', () => {
  it('throws a descriptive error after exhausting fetch retries', async () => {
    let callCount = 0;
    global.fetch = async () => {
      callCount++;
      throw new Error('network unreachable');
    };

    await assert.rejects(
      fetchJson('https://example.invalid/test.json', 1),
      err => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Daten konnten nicht geladen werden/);
        return true;
      }
    );
    assert.strictEqual(callCount, 2);
  });

  it('returns an empty list when the movies endpoint is unavailable', async () => {
    let callCount = 0;
    global.fetch = async () => {
      callCount++;
      throw new Error('offline');
    };

    const result = await loadMovies();
    assert.ok(Array.isArray(result));
    assert.strictEqual(result.length, 0);
    assert.ok(callCount >= 1);
  });
});

describe('searchLibrary pagination', () => {
  it('includes page parameters and normalizes response metadata', async () => {
    let capturedUrl = '';
    global.fetch = async (url) => {
      capturedUrl = String(url);
      return {
        ok: true,
        json: async () => ({
          items: [{ title: 'Paged', ratingKey: '5', mediaType: 'movie' }],
          pagination: { total: 42, limit: 10, offset: 20, hasMore: false },
        }),
      };
    };

    const result = await searchLibrary('movies', {}, { page: 3, pageSize: 10 });
    assert.ok(capturedUrl.includes('limit=10'));
    assert.ok(capturedUrl.includes('offset=20'));
    assert.strictEqual(result.page, 3);
    assert.strictEqual(result.pageSize, 10);
    assert.strictEqual(result.total, 42);
    assert.strictEqual(result.items.length, 1);
    assert.strictEqual(result.items[0].title, 'Paged');
  });

  it('falls back to defaults when server omits pagination fields', async () => {
    let capturedUrl = '';
    global.fetch = async (url) => {
      capturedUrl = String(url);
      return {
        ok: true,
        json: async () => ({ items: [{ title: 'Fallback', ratingKey: '7', mediaType: 'tv' }] }),
      };
    };

    const result = await searchLibrary('shows');
    assert.ok(capturedUrl.includes(`limit=${DEFAULT_PAGE_SIZE}`));
    assert.ok(capturedUrl.includes('offset=0'));
    assert.strictEqual(result.page, 1);
    assert.strictEqual(result.pageSize, DEFAULT_PAGE_SIZE);
    assert.strictEqual(result.total, 1);
  });
});

describe('data validators', () => {
  it('isMovieEntry rejects entries without title', () => {
    assert.strictEqual(isMovieEntry({ ratingKey: '123' }), false);
  });

  it('validateLibraryList throws when movie entries miss title', () => {
    assert.throws(
      () => validateLibraryList([{ ratingKey: '123' }], 'movie'),
      /title/i
    );
  });

  it('validateLibraryList throws when ratingKey has wrong type', () => {
    assert.throws(
      () => validateLibraryList([{ title: 'Test', ratingKey: {} }], 'movie'),
      /ratingKey/i
    );
  });

  it('validateLibraryList normalizes optional show fields', () => {
    const sanitized = validateLibraryList([
      { title: ' Show ', ratingKey: 42, seasons: [{ episodes: [{}] }, { thumb: null }] },
    ], 'show');
    assert.strictEqual(sanitized[0].title, 'Show');
    assert.strictEqual(sanitized[0].ratingKey, '42');
    assert.ok(Array.isArray(sanitized[0].seasons));
    assert.strictEqual(sanitized[0].seasons[0].episodes.length, 1);
    assert.deepStrictEqual(sanitized[0].seasons[0].episodes[0], {});
    assert.strictEqual(sanitized[0].thumb, '');
  });
});
