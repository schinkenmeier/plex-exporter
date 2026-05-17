import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalLocalStorage = globalThis.localStorage;
const originalFetch = globalThis.fetch;

function createStorageStub(){
  const store = new Map();
  return {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: key => { store.delete(key); },
    clear: () => store.clear(),
  };
}

function setupDom(){
  const { window } = parseHTML(`
    <!doctype html>
    <html>
      <body>
        <input id="search" value="">
        <input id="onlyNew" type="checkbox">
        <select id="yearFrom"></select>
        <select id="yearTo"></select>
        <select id="collectionFilter"></select>
        <select id="sort"><option value="title-asc">Titel A-Z</option></select>
        <div id="genreFilters"></div>
        <div id="loadMoreIndicator" hidden aria-hidden="true"></div>
      </body>
    </html>
  `);
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.localStorage = createStorageStub();
}

setupDom();
const { setState, getState } = await import('../../src/core/state.js');
const { applyFilters, loadMoreItems } = await import('../../src/features/filter/index.js');

describe('filter load-more races', () => {
  beforeEach(() => {
    setupDom();
    setState({
      view: 'movies',
      movies: [
        { id: 1, ratingKey: '1', title: 'Alpha', mediaType: 'movie' },
        { id: 2, ratingKey: '2', title: 'Beta', mediaType: 'movie' },
      ],
      shows: [],
      filtered: [{ id: 1, ratingKey: '1', title: 'Alpha', mediaType: 'movie' }],
      filteredMeta: { page: 1, pageSize: 1, total: 2, hasMore: true, isLoadingMore: false, source: 'api' },
      cfg: {},
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if(originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
    if(originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
    if(originalLocalStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = originalLocalStorage;
  });

  it('clears loading state when a stale load-more response is ignored', async () => {
    const pending = [];
    globalThis.fetch = () => new Promise((resolve) => pending.push(resolve));

    const loadMorePromise = loadMoreItems();
    assert.equal(document.getElementById('loadMoreIndicator').hidden, false);

    applyFilters();
    assert.equal(document.getElementById('loadMoreIndicator').hidden, true);

    pending[0]({
      ok: true,
      json: async () => ({
        items: [{ id: 2, ratingKey: '2', title: 'Beta', mediaType: 'movie' }],
        pagination: { total: 2, limit: 1, offset: 1, hasMore: false },
      }),
    });

    await loadMorePromise;

    const state = getState();
    assert.equal(state.filteredMeta.isLoadingMore, false);
    assert.equal(document.getElementById('loadMoreIndicator').hidden, true);
  });
});
