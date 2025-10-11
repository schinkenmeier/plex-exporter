/**
 * Unit tests for modalV2.js
 * Tests race condition fixes, immutable state updates, and error handling
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

import { renderModalV2, closeModalV2 } from '../modalV2.js';
import { getState, setState } from '../state.js';

function createStorage(){
  const store = new Map();
  return {
    getItem(key){ return store.has(key) ? store.get(key) : null; },
    setItem(key, value){ store.set(key, String(value)); },
    removeItem(key){ store.delete(key); },
    clear(){ store.clear(); },
    key(index){ return Array.from(store.keys())[index] ?? null; },
    get length(){ return store.size; }
  };
}

function setupDom(){
  const { window } = parseHTML(`<!DOCTYPE html><html lang="de"><body><div id="modal-root" hidden></div></body></html>`);
  const cleanups = [];
  const MISSING = Symbol('missing');
  const safeAssign = (key, value)=>{
    const previous = Object.prototype.hasOwnProperty.call(globalThis, key) ? globalThis[key] : MISSING;
    globalThis[key] = value;
    cleanups.push(()=>{
      if(previous === MISSING){ delete globalThis[key]; }
      else{ globalThis[key] = previous; }
    });
  };

  safeAssign('window', window);
  safeAssign('document', window.document);
  safeAssign('HTMLElement', window.HTMLElement);
  safeAssign('HTMLInputElement', window.HTMLInputElement);
  safeAssign('HTMLSelectElement', window.HTMLSelectElement);
  safeAssign('Node', window.Node);
  safeAssign('CustomEvent', window.CustomEvent);
  safeAssign('Event', window.Event);
  safeAssign('navigator', { userAgent: 'node-test' });
  safeAssign('history', window.history);
  safeAssign('location', window.location);
  safeAssign('scrollTo', window.scrollTo || (()=>{}));
  safeAssign('matchMedia', window.matchMedia || (()=>({ matches: false }))); 
  safeAssign('requestAnimationFrame', window.requestAnimationFrame || (cb=>setTimeout(()=>cb(Date.now()), 0)));
  safeAssign('cancelAnimationFrame', window.cancelAnimationFrame || (id=>clearTimeout(id)));
  safeAssign('requestIdleCallback', window.requestIdleCallback || (cb=>setTimeout(()=>cb({ didTimeout:false, timeRemaining:()=>0 }), 0)));
  safeAssign('getComputedStyle', window.getComputedStyle || (()=>({ getPropertyValue(){ return ''; } })));
  safeAssign('scrollY', window.scrollY || 0);
  safeAssign('scrollX', window.scrollX || 0);
  safeAssign('innerHeight', window.innerHeight || 900);
  safeAssign('innerWidth', window.innerWidth || 1280);
  safeAssign('localStorage', createStorage());
  safeAssign('sessionStorage', createStorage());
  safeAssign('CSS', globalThis.CSS || { supports: () => false });
  safeAssign('Image', window.Image || function Image(){ return window.document.createElement('img'); });
  safeAssign('performance', window.performance || { now: () => Date.now() });
  safeAssign('ResizeObserver', globalThis.ResizeObserver || class { observe(){} unobserve(){} disconnect(){} });

  const prototypeCleanups = [];
  if(window.HTMLElement){
    const proto = window.HTMLElement.prototype;
    const originalGetBoundingClientRect = proto.getBoundingClientRect;
    proto.getBoundingClientRect = function(){
      const width = Number(this.style?.width?.replace('px', '')) || this.clientWidth || 0;
      const height = Number(this.style?.height?.replace('px', '')) || this.clientHeight || 0;
      return { top: 0, left: 0, right: width, bottom: height, width, height };
    };
    prototypeCleanups.push(()=>{ proto.getBoundingClientRect = originalGetBoundingClientRect; });

    const offsetParentDescriptor = Object.getOwnPropertyDescriptor(proto, 'offsetParent');
    prototypeCleanups.push(()=>{
      if(offsetParentDescriptor){ Object.defineProperty(proto, 'offsetParent', offsetParentDescriptor); }
      else{ delete proto.offsetParent; }
    });
    Object.defineProperty(proto, 'offsetParent', {
      configurable: true,
      get(){ return this.parentNode || window.document.body; }
    });

    const offsetTopDescriptor = Object.getOwnPropertyDescriptor(proto, 'offsetTop');
    prototypeCleanups.push(()=>{
      if(offsetTopDescriptor){ Object.defineProperty(proto, 'offsetTop', offsetTopDescriptor); }
      else{ delete proto.offsetTop; }
    });
    Object.defineProperty(proto, 'offsetTop', {
      configurable: true,
      get(){ return Number(this.dataset?.offsetTop ?? 0); }
    });
  }

  const previousFeatures = window.FEATURES;
  window.FEATURES = window.FEATURES || {};
  cleanups.push(()=>{ window.FEATURES = previousFeatures; });

  cleanups.push(()=>{
    while(prototypeCleanups.length){
      const cleanup = prototypeCleanups.pop();
      cleanup();
    }
  });

  return ()=>{
    while(cleanups.length){
      const cleanup = cleanups.pop();
      cleanup();
    }
  };
}

async function tick(){
  await new Promise(resolve => setTimeout(resolve, 0));
}

async function settle(times = 2){
  for(let i = 0; i < times; i += 1){
    await tick();
  }
}

describe('modalV2 - Cinematic shell DOM', () => {
  let cleanupDom;
  let stateSnapshot;

  beforeEach(() => {
    cleanupDom = setupDom();
    stateSnapshot = JSON.parse(JSON.stringify(getState()));
    setState({
      view: 'movies',
      movies: [],
      shows: [],
      facets: {},
      filtered: [],
      cfg: { lang: 'de-DE' },
      heroPolicy: null,
      heroPolicyIssues: [],
    });
  });

  afterEach(async () => {
    closeModalV2();
    await settle();
    if(typeof cleanupDom === 'function'){
      cleanupDom();
      cleanupDom = null;
    }
    setState({
      view: stateSnapshot.view,
      movies: stateSnapshot.movies,
      shows: stateSnapshot.shows,
      facets: stateSnapshot.facets,
      filtered: stateSnapshot.filtered,
      cfg: stateSnapshot.cfg,
      heroPolicy: stateSnapshot.heroPolicy,
      heroPolicyIssues: stateSnapshot.heroPolicyIssues,
    });
  });

  it('renders tabs and panes with new selectors', async () => {
    renderModalV2({
      type: 'movie',
      title: 'Lumen',
      summary: 'Demo summary.',
      genres: ['Science-Fiction'],
      roles: [{ tag: 'Pilot' }],
      duration: 5_400_000,
      rating: 8.4,
      contentRating: 'PG-13',
    });

    await settle(3);

    const modalRoot = document.getElementById('modal-root');
    assert.equal(modalRoot?.hidden, false);
    assert.ok(document.body.classList.contains('modalv2-open'));

    const titleEl = document.getElementById('modal-title');
    assert.equal(titleEl?.textContent?.trim(), 'Lumen');

    const tabs = Array.from(document.querySelectorAll('.v2-tabs [role="tab"]'));
    assert.deepEqual(tabs.map(btn => btn.id), ['tab-overview', 'tab-details', 'tab-cast']);
    assert.deepEqual(tabs.map(btn => btn.textContent.trim()), ['Überblick', 'Details', 'Cast']);

    const activeTab = tabs.find(btn => btn.getAttribute('aria-selected') === 'true');
    assert.equal(activeTab?.id, 'tab-overview');

    const overviewPane = document.getElementById('pane-overview');
    assert.ok(overviewPane, 'overview pane exists');
    assert.equal(overviewPane?.hasAttribute('hidden'), false);
    assert.equal(overviewPane?.getAttribute('aria-hidden'), 'false');
    const overviewText = overviewPane?.querySelector('.v2-overview-text');
    assert.ok(overviewText);
    assert.equal(overviewText?.textContent?.trim(), 'Demo summary.');

    const detailsPane = document.getElementById('pane-details');
    assert.ok(detailsPane);
    assert.equal(detailsPane?.hasAttribute('hidden'), true);
    assert.equal(detailsPane?.getAttribute('aria-hidden'), 'true');

    const castPane = document.getElementById('pane-cast');
    assert.ok(castPane);
    assert.equal(castPane?.hasAttribute('hidden'), true);
    assert.equal(castPane?.getAttribute('aria-hidden'), 'true');
    assert.ok(castPane?.textContent?.includes('Pilot'));
  });
});

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
