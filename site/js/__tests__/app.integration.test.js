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
    tagline: 'Action hero tagline',
    genres: ['Action', 'Thriller'],
    collections: [{ tag: 'Favorites' }],
    roles: [{ tag: 'Lead' }],
    thumb: 'action.jpg',
    thumbFile: 'action.jpg',
    duration: 5_400_000,
    rating: 7.5,
    audienceRating: 7.5,
    contentRating: 'US/PG-13'
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
        <section class="hero" id="hero" data-state="empty" data-hero-kind="" data-hero-id="">
          <div class="hero__media" aria-hidden="true">
            <picture class="hero__picture" id="heroPicture" hidden>
              <source id="heroBackdropLarge" media="(min-width: 75rem)" />
              <source id="heroBackdropMedium" media="(min-width: 48rem)" />
              <img id="heroBackdropImage" src="" alt="" loading="lazy" decoding="async" hidden />
            </picture>
            <div class="hero__media-overlay"></div>
          </div>
          <div class="wrap hero__inner">
            <div class="hero__body">
              <p class="hero__eyebrow">Featured highlight</p>
              <h2 class="hero__title" id="heroTitle">Discover Plex like it’s premiere night</h2>
              <p class="hero__tagline" id="heroTagline">Curated spotlights and smart filters for every mood.</p>
              <p class="hero__overview" id="heroOverview">Browse your Plex library offline, keep personal watchlists, and open cinematic detail views without leaving the couch.</p>
              <div class="hero__meta" id="heroMeta" hidden>
                <div class="hero__meta-row" data-row="primary" id="heroMetaPrimary"></div>
                <div class="hero__meta-row" data-row="secondary" id="heroMetaSecondary"></div>
                <div class="hero__meta-row" data-row="tertiary" id="heroMetaTertiary"></div>
              </div>
              <button type="button" class="hero__cta" id="heroCta" data-modal-target="modalV2">Browse featured titles</button>
            </div>
          </div>
          <div id="heroTimer" class="hero-timer" aria-hidden="true">
            <div class="hero-timer__bar"></div>
          </div>
        </section>
        <div id="heroStats">
          <span data-stat="movies"></span>
          <span data-stat="shows"></span>
        </div>
        <div class="filters">
          <div id="libraryTabs">
            <button type="button" data-lib="movies" aria-pressed="false">Movies</button>
            <button type="button" data-lib="series" aria-pressed="false">Shows</button>
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
        <div class="footer-credits">
          <img class="footer-credits__logo" src="tmdb.svg" alt="TMDb" />
          <p class="footer-credits__text">This product uses the TMDb API but is not endorsed or certified by TMDb.</p>
        </div>
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
    Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', {
      configurable: true,
      get(){ return this.parentNode || document.body; }
    });
    Object.defineProperty(window.HTMLElement.prototype, 'offsetTop', {
      configurable: true,
      get(){ return Number(this.dataset?.offsetTop ?? 0); }
    });
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
  globalThis.sessionStorage = {
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
  const hadTestModeFlag = Object.prototype.hasOwnProperty.call(globalThis, '__PLEX_TEST_MODE__');
  const originalTestMode = globalThis.__PLEX_TEST_MODE__;
  const hadFetch = Object.prototype.hasOwnProperty.call(globalThis, 'fetch');
  const originalFetch = globalThis.fetch;
  const originalMathRandom = Math.random;

  try {
    globalThis.__PLEX_TEST_MODE__ = true;
    createDom();
    Math.random = () => 0;

    globalThis.fetch = async (url) => {
      if(typeof url === 'string' && url.endsWith('hero.policy.json')){
        return {
          ok: true,
          json: async () => ({
            poolSizeMovies: 6,
            poolSizeSeries: 4,
            slots: {
              new: { quota: 0.4 },
              topRated: { quota: 0.3 },
              oldButGold: { quota: 0.2 },
              random: { quota: 0.1 }
            },
            diversity: { genre: 0.6, year: 0.5, antiRepeat: 0.2 },
            rotation: { intervalMinutes: 180, minPoolSize: 4 },
            textClamp: { title: 96, subtitle: 200, summary: 220 },
            fallback: { prefer: 'movies', allowDuplicates: false },
            language: 'en-US',
            cache: { ttlHours: 12, graceMinutes: 20 }
          })
        };
      }
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

    const heroTitle = document.getElementById('heroTitle');
    const heroTagline = document.getElementById('heroTagline');
    const heroOverview = document.getElementById('heroOverview');
    assert.equal(heroTitle?.textContent, 'Discover Plex like it’s premiere night');
    assert.equal(heroTagline?.textContent, 'Curated spotlights and smart filters for every mood.');
    assert.equal(heroOverview?.textContent, 'Browse your Plex library offline, keep personal watchlists, and open cinematic detail views without leaving the couch.');

    const stateModule = await import('../state.js');
    const main = await import('../main.js');
    const Filter = await import('../filter.js');
    const { getState } = stateModule;

    await main.boot();
    await settle();

    const tmdbAttribution = document.querySelector('.footer-credits__text');
    assert.equal(tmdbAttribution?.textContent?.trim(), 'This product uses the TMDb API but is not endorsed or certified by TMDb.');

    const hero = document.getElementById('hero');
    for(let i = 0; i < 8; i += 1){
      if(hero?.dataset?.state === 'ready') break;
      await settle();
    }
    assert.equal(hero?.dataset?.state, 'ready');
    assert.equal(hero?.dataset?.heroKind, 'movie');
    assert.equal(hero?.dataset?.heroId, '1');

    assert.equal(heroTitle?.textContent, 'Action Blast');
    assert.equal(heroTagline?.textContent, 'Action hero tagline');
    assert.equal(heroOverview?.textContent, 'Action-packed adventure.');
    assert.equal(heroTagline?.hidden, false);
    const heroMeta = document.getElementById('heroMeta');
    assert.equal(heroMeta?.hidden, false);
    const heroPicture = document.getElementById('heroPicture');
    const heroImage = document.getElementById('heroBackdropImage');
    assert.equal(heroPicture?.hidden, false);
    assert.ok(hero?.classList.contains('hero--has-media'));
    assert.equal(heroImage?.hasAttribute('hidden'), false);
    assert.equal(heroImage?.getAttribute('alt'), 'Action Blast backdrop');

    const metaPrimary = Array.from(document.querySelectorAll('#heroMetaPrimary .hero__badge')).map(node => node.textContent);
    assert.deepEqual(metaPrimary, ['2022', '1h 30m', 'PG-13']);
    const metaSecondary = Array.from(document.querySelectorAll('#heroMetaSecondary .hero__badge')).map(node => node.textContent);
    assert.ok(metaSecondary.includes('★ 7.5'));
    const metaTertiary = Array.from(document.querySelectorAll('#heroMetaTertiary .hero__badge')).map(node => node.textContent);
    assert.deepEqual(metaTertiary, ['Action', 'Thriller']);

    const heroCta = document.getElementById('heroCta');
    assert.equal(heroCta?.textContent, 'View movie details');
    assert.equal(heroCta?.getAttribute('aria-disabled'), 'false');
    assert.equal(heroCta?.getAttribute('aria-label'), 'View movie details: Action Blast');

    const modalRoot = document.getElementById('modal-root-v2');
    heroCta?.click();
    await settle();
    const heroModalTitle = document.getElementById('modal-title');
    assert.equal(modalRoot?.hidden, false);
    assert.equal(heroModalTitle?.textContent?.trim(), 'Action Blast');

    const overviewTab = document.getElementById('tab-overview');
    assert.equal(overviewTab?.getAttribute('aria-selected'), 'true');

    const overviewPane = document.getElementById('pane-overview');
    const overviewText = overviewPane?.querySelector('.v2-overview-text');
    assert.ok(overviewPane, 'expected overview pane to exist');
    assert.equal(overviewPane?.hasAttribute('hidden'), false);
    assert.equal(overviewPane?.getAttribute('aria-hidden'), 'false');
    assert.equal(overviewText?.textContent?.trim(), 'Action-packed adventure.');

    const detailsPane = document.getElementById('pane-details');
    assert.equal(detailsPane?.getAttribute('aria-hidden'), 'true');
    assert.equal(detailsPane?.hasAttribute('hidden'), true);

    const castPane = document.getElementById('pane-cast');
    assert.equal(castPane?.getAttribute('aria-hidden'), 'true');
    assert.equal(castPane?.hasAttribute('hidden'), true);
    assert.ok(castPane?.textContent?.includes('Lead'));

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

    const titleEl = document.getElementById('modal-title');
    assert.equal(modalRoot.hidden, false);
    assert.ok(document.body.classList.contains('modalv2-open'));
    assert.equal(titleEl?.textContent?.trim(), 'Drama Piece');

    const activeTab = document.getElementById('tab-overview');
    assert.equal(activeTab?.getAttribute('aria-selected'), 'true');

    const modalOverviewPane = document.getElementById('pane-overview');
    const modalOverviewText = modalOverviewPane?.querySelector('.v2-overview-text');
    assert.ok(modalOverviewPane, 'expected modal overview pane to exist');
    assert.equal(modalOverviewPane?.hasAttribute('hidden'), false);
    assert.equal(modalOverviewPane?.getAttribute('aria-hidden'), 'false');
    assert.equal(modalOverviewText?.textContent?.trim(), 'Dramatic storytelling.');
  } finally {
    if(hadTestModeFlag){
      globalThis.__PLEX_TEST_MODE__ = originalTestMode;
    }else{
      delete globalThis.__PLEX_TEST_MODE__;
    }

    if(hadFetch){
      globalThis.fetch = originalFetch;
    }else{
      delete globalThis.fetch;
    }
    Math.random = originalMathRandom;
  }
});
