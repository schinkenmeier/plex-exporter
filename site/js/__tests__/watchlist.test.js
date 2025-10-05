import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

const originalDocument = global.document;
const originalLocalStorage = global.localStorage;
const originalWindow = global.window;

function createDocumentStub(){
  return {
    getElementById: () => null,
    querySelectorAll: () => [],
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
    body: { append: () => {}, appendChild: () => {}, removeChild: () => {} },
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
if(typeof global.window === 'undefined') global.window = {};

const { toggle, isSaved, count, initUi, clear } = await import('../watchlist.js');

if(originalDocument === undefined) delete global.document; else global.document = originalDocument;
if(originalLocalStorage === undefined) delete global.localStorage; else global.localStorage = originalLocalStorage;
if(originalWindow === undefined) delete global.window; else global.window = originalWindow;

beforeEach(() => {
  global.document = createDocumentStub();
  global.localStorage = createStorageStub();
  if(typeof global.window === 'undefined') global.window = {};
  clear();
});

afterEach(() => {
  if(originalDocument === undefined) delete global.document; else global.document = originalDocument;
  if(originalLocalStorage === undefined) delete global.localStorage; else global.localStorage = originalLocalStorage;
  if(originalWindow === undefined) delete global.window; else global.window = originalWindow;
});

describe('watchlist storage resilience', () => {
  it('handles storage read failures when initializing UI', () => {
    global.localStorage.getItem = () => { throw new Error('read failed'); };
    assert.doesNotThrow(() => initUi());
    assert.strictEqual(count(), 0);
  });

  it('continues to toggle items when storage writes fail', () => {
    global.localStorage.setItem = () => { throw new Error('quota exceeded'); };
    const item = { title: 'Testfilm', type: 'movie', ids: { imdb: 'tt123' }, ratingKey: 42 };
    assert.doesNotThrow(() => toggle(item));
    assert.strictEqual(isSaved(item), true);
  });
});
