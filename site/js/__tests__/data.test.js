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

const { prefixThumbValue, prefixMovieThumb, prefixShowThumb, fetchJson, loadMovies } = await import('../data.js');

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
  it('normalizes leading parent directory segments', () => {
    const result = prefixThumbValue('../poster.jpg', 'data/movies/');
    assert.strictEqual(result, 'data/movies/poster.jpg');
    assert.ok(!result.includes('..'));
  });

  it('normalizes backslash parent directory segments', () => {
    const result = prefixThumbValue('..\\poster.jpg', 'data/movies/');
    assert.strictEqual(result, 'data/movies/poster.jpg');
  });

  it('handles mixed slashes and dot segments', () => {
    const result = prefixThumbValue('./covers/../thumbs/.//poster.jpg', 'data/movies');
    assert.strictEqual(result, 'data/movies/thumbs/poster.jpg');
  });

  it('returns base directory when only parent segments remain', () => {
    const result = prefixThumbValue('../', 'data/movies/');
    assert.strictEqual(result, 'data/movies/');
  });

  it('preserves absolute data paths without duplicating base', () => {
    const result = prefixThumbValue('data/movies/poster.jpg', 'data/movies/');
    assert.strictEqual(result, 'data/movies/poster.jpg');
  });
});

describe('prefixThumb helpers', () => {
  it('prefixMovieThumb removes relative segments for thumbFile', () => {
    const movie = { thumb: '../poster.jpg' };
    const result = prefixMovieThumb(movie);
    assert.strictEqual(result.thumb, 'data/movies/poster.jpg');
    assert.strictEqual(result.thumbFile, 'data/movies/poster.jpg');
    assert.ok(!result.thumb.includes('..'));
  });

  it('prefixShowThumb removes relative segments for thumbFile', () => {
    const show = { thumb: '..\\season/poster.jpg' };
    const result = prefixShowThumb(show);
    assert.strictEqual(result.thumb, 'data/series/season/poster.jpg');
    assert.strictEqual(result.thumbFile, 'data/series/season/poster.jpg');
    assert.ok(!result.thumb.includes('..'));
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

  it('falls back to embedded JSON when fetching movies fails', async () => {
    const fallbackMovies = [{ title: 'Fallback Film', thumb: 'poster.jpg' }];
    let callCount = 0;
    global.fetch = async () => {
      callCount++;
      throw new Error('offline');
    };
    document.getElementById = (id) => {
      if(id === 'movies-json'){
        return { textContent: JSON.stringify(fallbackMovies) };
      }
      return null;
    };

    const result = await loadMovies();
    assert.ok(Array.isArray(result));
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].title, 'Fallback Film');
    assert.ok(result[0].thumb?.startsWith('data/movies/'));
    assert.ok(callCount >= 1);
  });
});
