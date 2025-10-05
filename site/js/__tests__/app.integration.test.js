import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

const MOVIES_FIXTURE = [
  {
    ratingKey: '1',
    type: 'movie',
    title: 'Action Blast',
    year: 2022,
    addedAt: '2024-01-01T12:00:00Z',
    summary: 'Action-packed adventure.',
    genres: ['Action', 'Thriller'],
    collections: [{ tag: 'Favorites' }],
    roles: [{ tag: 'Lead' }],
    thumb: 'action.jpg',
    thumbFile: 'action.jpg',
  },
  {
    ratingKey: '2',
    type: 'movie',
    title: 'Drama Piece',
    year: 2018,
    addedAt: '2024-02-10T12:00:00Z',
    summary: 'Dramatic storytelling.',
    genres: ['Drama'],
    collections: [],
    roles: [{ tag: 'Protagonist' }],
    thumb: 'drama.jpg',
    thumbFile: 'drama.jpg',
  },
];

const SHOWS_FIXTURE = [
  {
    ratingKey: 's1',
    type: 'show',
    title: 'Space Journey',
    year: 2020,
    addedAt: '2024-03-01T12:00:00Z',
    summary: 'Exploring the universe.',
    genres: ['Sci-Fi'],
    collections: [{ tag: 'Favorites' }],
    seasons: [],
    thumb: 'space.jpg',
    thumbFile: 'space.jpg',
  },
];

function createDom(){
  const { window } = parseHTML(`<!DOCTYPE html>
    <html lang="de">
      <body>
        <div class="site-header">
          <img id="siteLogo" />
          <div class="site-header__brand-text"><span class="site-header__label"></span></div>
        </div>
        <section id="hero" data-hero-kind="" data-hero-id="">
          <h1 id="heroTitle">Meine Bibliothek</h1>
          <p id="heroSubtitle"></p>
          <button id="heroCta" type="button">Details</button>
        </section>
        <div id="heroStats">
          <span data-stat="movies"></span>
          <span data-stat="shows"></span>
        </div>
        <div class="filters">
          <div id="libraryTabs">
            <button type="button" data-lib="movies" aria-pressed="false">Filme</button>
            <button type="button" data-lib="series" aria-pressed="false">Serien</button>
          </div>
          <input id="search" type="search" />
          <input id="q" type="search" />
          <input id="onlyNew" type="checkbox" />
          <select id="sort"></select>
          <select id="yearFrom"></select>
          <select id="yearTo"></select>
          <button id="yearReset" type="button"></button>
          <select id="collectionFilter"></select>
          <input id="groupCollections" type="checkbox" />
          <div id="genreFilters"></div>
        </div>
        <button id="toggleAdvanced" type="button" aria-expanded="false"></button>
        <section id="advancedFilters" hidden></section>
        <div id="grid" style="width:1200px;min-height:600px;"></div>
        <div id="footerMeta"><span id="footerStatus"></span></div>
        <div id="scrollProgress"></div>
        <button id="scrollTop" type="button"></button>
        <div id="modal-root-v2" hidden></div>
      </body>
    </html>`);

  const { document } = window;
  const defaultLocation = new URL('https://example.test/');
  window.location = {
    href: defaultLocation.href,
    hash: '',
    assign() {},
    replace() {},
    reload() {},
    toString() { return this.href; },
  };
  if(!window.history){
    window.history = { replaceState() {}, pushState() {} };
  }else{
    if(typeof window.history.replaceState !== 'function') window.history.replaceState = () => {};
    if(typeof window.history.pushState !== 'function') window.history.pushState = () => {};
  }
  window.requestAnimationFrame = window.requestAnimationFrame || (cb => setTimeout(() => cb(Date.now()), 0));
  window.cancelAnimationFrame = window.cancelAnimationFrame || (id => clearTimeout(id));
  window.requestIdleCallback = window.requestIdleCallback || (cb => setTimeout(() => cb(Date.now()), 0));
  window.scrollTo = () => {};
  window.matchMedia = window.matchMedia || (() => ({ matches: false }));
  window.innerHeight = window.innerHeight || 900;
  window.innerWidth = window.innerWidth || 1280;
  window.scrollY = window.scrollY || 0;
  window.scrollX = window.scrollX || 0;
  if(window.HTMLElement){
    window.HTMLElement.prototype.getBoundingClientRect = function(){
      const width = Number(this.style?.width?.replace('px','')) || this.clientWidth || 0;
      const height = Number(this.style?.height?.replace('px','')) || this.clientHeight || 0;
      return { top: 0, left: 0, right: width, bottom: height, width, height };
    };
  }

  globalThis.window = window;
  globalThis.document = document;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.HTMLInputElement = window.HTMLInputElement;
  globalThis.HTMLSelectElement = window.HTMLSelectElement;
  globalThis.Node = window.Node;
  globalThis.CustomEvent = window.CustomEvent;
  globalThis.Event = window.Event;
  globalThis.navigator = { userAgent: 'node-test' };
  globalThis.history = window.history;
  globalThis.location = window.location;
  globalThis.requestAnimationFrame = window.requestAnimationFrame;
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame;
  globalThis.requestIdleCallback = window.requestIdleCallback;
  globalThis.scrollTo = window.scrollTo;
  globalThis.matchMedia = window.matchMedia;
  globalThis.getComputedStyle = window.getComputedStyle || function(){
    return {
      getPropertyValue(){ return ''; },
    };
  };
  globalThis.scrollY = window.scrollY;
  globalThis.scrollX = window.scrollX;
  globalThis.innerHeight = window.innerHeight;
  globalThis.innerWidth = window.innerWidth;
  globalThis.localStorage = {
    store: new Map(),
    getItem(key) { return this.store.has(key) ? this.store.get(key) : null; },
    setItem(key, value) { this.store.set(key, String(value)); },
    removeItem(key) { this.store.delete(key); },
    clear() { this.store.clear(); },
  };
  globalThis.CSS = globalThis.CSS || { supports: () => false };
  globalThis.Option = window.Option || function Option(text = '', value = '') {
    const opt = document.createElement('option');
    opt.textContent = text;
    opt.value = value;
    return opt;
  };
  if(window.HTMLSelectElement && !window.HTMLSelectElement.prototype.add){
    window.HTMLSelectElement.prototype.add = function add(option){
      this.appendChild(option);
    };
  }
  globalThis.Image = window.Image || function Image(){
    const img = document.createElement('img');
    return img;
  };
  globalThis.performance = window.performance || { now: () => Date.now() };
  globalThis.ResizeObserver = globalThis.ResizeObserver || class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

function cardNodes(){
  return Array.from(document.querySelectorAll('.card'));
}

async function nextTick(){
  await new Promise(resolve => setTimeout(resolve, 0));
}

async function settle(times = 3){
  for(let i = 0; i < times; i += 1){
    await nextTick();
  }
}

test('boot flow integrates view switch, filtering and modal opening', async () => {
  globalThis.__PLEX_TEST_MODE__ = true;
  createDom();

  globalThis.fetch = async (url) => {
    if(typeof url === 'string' && url.endsWith('config.json')){
      return { ok: true, json: async () => ({ startView: 'movies', tmdbEnabled: false }) };
    }
    if(typeof url === 'string' && url.endsWith('data/movies/movies.json')){
      return { ok: true, json: async () => MOVIES_FIXTURE };
    }
    if(typeof url === 'string' && url.endsWith('data/series/series_index.json')){
      return { ok: true, json: async () => SHOWS_FIXTURE };
    }
    throw new Error(`Unexpected fetch call for ${url}`);
  };

  const stateModule = await import('../state.js');
  const main = await import('../main.js');
  const Filter = await import('../filter.js');
  const { getState } = stateModule;

  await main.boot();
  await settle();

  const grid = document.getElementById('grid');
  assert.equal(getState().view, 'movies');
  assert.equal(cardNodes().length, MOVIES_FIXTURE.length);

  const showsBtn = document.querySelector('#libraryTabs [data-lib="series"]');
  showsBtn.click();
  await settle();
  assert.equal(getState().view, 'shows');
  assert.equal(cardNodes().length, SHOWS_FIXTURE.length);

  const moviesBtn = document.querySelector('#libraryTabs [data-lib="movies"]');
  moviesBtn.click();
  await settle();
  assert.equal(getState().view, 'movies');

  const searchInput = document.getElementById('search');
  searchInput.value = 'Drama';
  searchInput.dispatchEvent(new window.Event('input', { bubbles: true }));

  await settle();

  const filtered = Filter.applyFilters();
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].title, 'Drama Piece');
  await settle();

  const currentCards = cardNodes();
  assert.equal(currentCards.length, 1);
  const firstCard = currentCards[0];
  const titleNode = firstCard?.querySelector('.card__title');
  assert.equal(titleNode?.textContent, 'Drama Piece');

  firstCard.click();
  await settle();

  const modalRoot = document.getElementById('modal-root-v2');
  const titleEl = document.getElementById('modalV2Title');
  assert.equal(modalRoot.hidden, false);
  assert.ok(document.body.classList.contains('modalv2-open'));
  assert.equal(titleEl?.textContent?.trim(), 'Drama Piece');
});
