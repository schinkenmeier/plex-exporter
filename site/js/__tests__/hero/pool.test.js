import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

let originalDateNow;
let originalMathRandom;
let originalLocalStorage;
let originalSessionStorage;
let originalWindow;
let originalCustomEvent;

const BASE_NOW = Date.UTC(2024, 3, 1, 12, 0, 0);

function createStorage(){
  const store = new Map();
  return {
    getItem(key){ return store.has(key) ? store.get(key) : null; },
    setItem(key, value){ store.set(key, String(value)); },
    removeItem(key){ store.delete(key); },
    clear(){ store.clear(); }
  };
}

function makeMovie(id, { addedDaysAgo, year, rating, genres, durationMinutes = 120, contentRating = 'US/PG-13', summary = 'Summary', tagline = 'Tagline' }){
  const addedAt = new Date(BASE_NOW - addedDaysAgo * 24 * 60 * 60 * 1000).toISOString();
  return {
    ratingKey: id,
    type: 'movie',
    title: `Fixture ${id}`,
    year,
    addedAt,
    summary,
    tagline,
    duration: durationMinutes * 60 * 1000,
    rating,
    audienceRating: rating,
    genres,
    contentRating
  };
}

describe('hero pool selection', () => {
  beforeEach(() => {
    originalDateNow = Date.now;
    originalMathRandom = Math.random;
    originalLocalStorage = global.localStorage;
    originalSessionStorage = global.sessionStorage;
    originalWindow = global.window;
    originalCustomEvent = global.CustomEvent;

    Date.now = () => BASE_NOW;
    Math.random = () => 0; // deterministic shuffle
    global.localStorage = createStorage();
    global.sessionStorage = createStorage();
    global.window = { dispatchEvent(){}, addEventListener(){}, removeEventListener(){} };
    global.CustomEvent = class {
      constructor(type, init){
        this.type = type;
        this.detail = init?.detail;
      }
    };
  });

  afterEach(() => {
    Date.now = originalDateNow;
    Math.random = originalMathRandom;
    if(originalLocalStorage) global.localStorage = originalLocalStorage;
    else delete global.localStorage;
    if(originalSessionStorage) global.sessionStorage = originalSessionStorage;
    else delete global.sessionStorage;
    if(originalWindow) global.window = originalWindow;
    else delete global.window;
    if(originalCustomEvent) global.CustomEvent = originalCustomEvent;
    else delete global.CustomEvent;
  });

  it('allocates slots according to policy while respecting diversity caps', async () => {
    const items = [
      makeMovie('m1', { addedDaysAgo: 5, year: 2024, rating: 8.9, genres: ['Action', 'Adventure'], durationMinutes: 128 }),
      makeMovie('m2', { addedDaysAgo: 8, year: 2023, rating: 8.4, genres: ['Action', 'Thriller'], durationMinutes: 124 }),
      makeMovie('m3', { addedDaysAgo: 10, year: 2024, rating: 7.5, genres: ['Drama'], durationMinutes: 110 }),
      makeMovie('m4', { addedDaysAgo: 180, year: 2018, rating: 9.2, genres: ['Mystery'], durationMinutes: 140 }),
      makeMovie('m5', { addedDaysAgo: 420, year: 2005, rating: 8.7, genres: ['Classic'], durationMinutes: 132 }),
      makeMovie('m6', { addedDaysAgo: 120, year: 2016, rating: 7.1, genres: ['Comedy'], durationMinutes: 118 }),
      makeMovie('m7', { addedDaysAgo: 50, year: 2019, rating: 6.5, genres: ['Adventure'], durationMinutes: 100 }),
      makeMovie('m8', { addedDaysAgo: 210, year: 2017, rating: 8.85, genres: ['Science Fiction'], durationMinutes: 116 })
    ];

    const policy = {
      poolSizeMovies: 6,
      poolSizeSeries: 3,
      slots: {
        new: { quota: 0.5 },
        topRated: { quota: 0.3 },
        oldButGold: { quota: 0.2 },
        random: { quota: 0 }
      },
      diversity: { genre: 1, year: 1, antiRepeat: 0.25 },
      rotation: { intervalMinutes: 360, minPoolSize: 6 },
      textClamp: { title: 96, subtitle: 240, summary: 220 },
      fallback: { prefer: 'movies', allowDuplicates: false },
      language: 'en-US',
      cache: { ttlHours: 6, graceMinutes: 15 }
    };

    const poolModule = await import(`../../hero/pool.js?${Date.now()}`);
    const result = await poolModule.ensureHeroPool('movies', items, { policy, tmdb: { disableTmdb: true } });

    assert.equal(result.kind, 'movies');
    assert.equal(result.items.length, 6);
    assert.deepEqual(result.meta.plan, { new: 3, topRated: 2, oldButGold: 1, random: 0 });
    assert.deepEqual(result.slotSummary, { new: 3, topRated: 2, oldButGold: 1, random: 0 });

    const genreCounts = new Map();
    const yearCounts = new Map();
    let oldSlotCount = 0;
    for(const entry of result.items){
      if(Array.isArray(entry.genres)){
        entry.genres.forEach(genre => {
          const next = (genreCounts.get(genre) || 0) + 1;
          genreCounts.set(genre, next);
        });
      }
      if(entry.year != null){
        const next = (yearCounts.get(entry.year) || 0) + 1;
        yearCounts.set(entry.year, next);
      }
      if(entry.slot === 'oldButGold'){
        oldSlotCount += 1;
        assert.ok(entry.year <= 2012, 'expected old slot to use an older title');
      }
    }

    const maxGenre = Math.max(0, ...genreCounts.values());
    const maxYear = Math.max(0, ...yearCounts.values());
    assert.ok(maxGenre <= 2, 'genre cap exceeded');
    assert.ok(maxYear <= 2, 'year cap exceeded');
    assert.equal(oldSlotCount, 1, 'expected exactly one old-but-gold selection');

    assert.ok(result.expiresAt > result.updatedAt);
    assert.equal(result.expiresAt - result.updatedAt, 6 * 60 * 60 * 1000);
  });
});
