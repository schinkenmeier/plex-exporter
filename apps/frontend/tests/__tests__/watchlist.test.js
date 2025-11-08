import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

const originalDocument = global.document;
const originalLocalStorage = global.localStorage;
const originalSessionStorage = global.sessionStorage;
const originalWindow = global.window;

function createDocumentStub(){
  return {
    getElementById: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: () => ({
      className: '',
      textContent: '',
      append: () => {},
      appendChild: () => {},
      setAttribute: () => {},
      remove: () => {},
      addEventListener: () => {},
      classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    }),
    createDocumentFragment: () => ({ append: () => {}, appendChild: () => {} }),
    body: {
      append: () => {},
      appendChild: () => {},
      removeChild: () => {},
      classList: { add: () => {}, remove: () => {} },
    },
  };
}

function createStorageStub(){
  const store = new Map();
  return {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: key => { store.delete(key); },
    clear: () => store.clear(),
  };
}

if(typeof global.document === 'undefined') global.document = createDocumentStub();
if(typeof global.localStorage === 'undefined') global.localStorage = createStorageStub();
if(typeof global.sessionStorage === 'undefined') global.sessionStorage = createStorageStub();
if(typeof global.window === 'undefined') global.window = {};

const stateModule = await import('../../src/core/state.js');
const { setState } = stateModule;
const { toggle, isSaved, count, initUi, clear, __testing } = await import('../../src/features/watchlist/index.js');

if(originalDocument === undefined) delete global.document; else global.document = originalDocument;
if(originalLocalStorage === undefined) delete global.localStorage; else global.localStorage = originalLocalStorage;
if(originalSessionStorage === undefined) delete global.sessionStorage; else global.sessionStorage = originalSessionStorage;
if(originalWindow === undefined) delete global.window; else global.window = originalWindow;

beforeEach(() => {
  global.document = createDocumentStub();
  global.localStorage = createStorageStub();
  global.sessionStorage = createStorageStub();
  if(typeof global.window === 'undefined') global.window = {};
  setState({ movies: [], shows: [] });
  clear();
});

afterEach(() => {
  if(originalDocument === undefined) delete global.document; else global.document = originalDocument;
  if(originalLocalStorage === undefined) delete global.localStorage; else global.localStorage = originalLocalStorage;
  if(originalSessionStorage === undefined) delete global.sessionStorage; else global.sessionStorage = originalSessionStorage;
  if(originalWindow === undefined) delete global.window; else global.window = originalWindow;
});

describe('watchlist storage resilience', () => {
  it('handles storage read failures when initializing UI', () => {
    global.sessionStorage.getItem = () => { throw new Error('read failed'); };
    assert.doesNotThrow(() => initUi());
    assert.strictEqual(count(), 0);
  });

  it('continues to toggle items when storage writes fail', () => {
    global.sessionStorage.setItem = () => { throw new Error('quota exceeded'); };
    const item = { title: 'Testfilm', type: 'movie', ids: { imdb: 'tt123' }, ratingKey: 42 };
    assert.doesNotThrow(() => toggle(item));
    assert.strictEqual(isSaved(item), true);
  });
});

describe('watchlist metadata persistence', () => {
  it('returns stored entries even when state no longer has them', () => {
    const item = { title: 'Meta Movie', type: 'movie', ids: { imdb: 'tt999' }, ratingKey: 99, year: 2024 };
    setState({ movies: [item], shows: [] });
    toggle(item);
    setState({ movies: [], shows: [] });
    const list = __testing.listItems();
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].title, 'Meta Movie');
  });

  it('stores numeric year information for revived entries', () => {
    const item = { title: 'Yearly', type: 'movie', ids: { imdb: 'tt1000' }, ratingKey: 1000, year: '2023' };
    setState({ movies: [item], shows: [] });
    toggle(item);
    setState({ movies: [], shows: [] });
    const list = __testing.listItems();
    assert.strictEqual(list[0].yearNumeric, 2023);
  });
});
