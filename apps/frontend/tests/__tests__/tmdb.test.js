import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

let originalWarn;
let warnMessages;
let originalLocalStorage;
let originalWindow;
let originalCustomEvent;
let originalFetch;

const noop = () => {};

beforeEach(() => {
  warnMessages = [];
  originalWarn = console.warn;
  console.warn = (...args) => {
    const rendered = args.map(arg => {
      if(arg instanceof Error) return `${arg.name}: ${arg.message}`;
      return String(arg);
    }).join(' ');
    warnMessages.push(rendered);
  };

  originalLocalStorage = global.localStorage;
  global.localStorage = {
    getItem(key) {
      if(key === 'tmdbCache' || key === 'tmdb.metadata.cache.v1') return 'not-json';
      return null;
    },
    setItem() {
      throw new Error('persist blocked');
    },
    removeItem() {
      throw new Error('remove blocked');
    }
  };

  originalWindow = global.window;
  global.window = {
    dispatchEvent: noop,
    requestIdleCallback: undefined
  };

  originalCustomEvent = global.CustomEvent;
  global.CustomEvent = class {
    constructor(type, init){
      this.type = type;
      this.detail = init?.detail;
    }
  };

  originalFetch = global.fetch;
  global.fetch = async (url) => {
    if(String(url).includes('/images')){
      return { ok: true, json: async () => ({ posters: [], backdrops: [] }) };
    }
    return { ok: true, json: async () => ({ id: 123, poster_path: null, backdrop_path: null, results: [] }) };
  };
});

afterEach(() => {
  console.warn = originalWarn;
  global.localStorage = originalLocalStorage;
  global.window = originalWindow;
  global.CustomEvent = originalCustomEvent;
  global.fetch = originalFetch;
});

describe('tmdb service fallbacks', () => {
  it('handles cache persistence failures gracefully', async () => {
    const { hydrateOptional, clearCache } = await import(`../../src/services/tmdb.js?${Date.now()}`);

    await hydrateOptional([
      { type: 'movie', ids: { tmdb: 42 }, title: 'Fallback Test', year: 2024 }
    ], [], { tmdbApiKey: 'fake', lang: 'de-DE' });

    // allow asynchronous hydration cycle to settle
    await new Promise(resolve => setTimeout(resolve, 25));

    assert.ok(
      warnMessages.some(msg => msg.includes('[cacheStore] Failed to parse persisted cache payload')),
      'expected warning for cache load fallback'
    );
    assert.ok(
      warnMessages.some(msg => msg.includes('[cacheStore] Failed to persist cache')),
      'expected warning for cache persist failure'
    );

    assert.doesNotThrow(() => clearCache());
    assert.ok(
      warnMessages.some(msg => msg.includes('[cacheStore] Failed to persist cache')),
      'expected warning when clearing cache fails'
    );
  });
});
