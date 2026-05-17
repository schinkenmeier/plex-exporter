import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalLocalStorage = globalThis.localStorage;

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
  const { window } = parseHTML('<!doctype html><html><body><button id="newsletterBtn"></button></body></html>');
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.localStorage = createStorageStub();
}

setupDom();
const { initUi, showNewsletterDialog } = await import('../../src/features/newsletter/index.js');

describe('newsletter UI', () => {
  beforeEach(() => {
    setupDom();
  });

  afterEach(() => {
    if(originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
    if(originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
    if(originalLocalStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = originalLocalStorage;
  });

  it('renders stored subscription values as text', () => {
    localStorage.setItem(
      'newsletter:subscription',
      JSON.stringify({
        active: true,
        email: '<img src=x onerror=alert(1)>@example.test',
        mediaType: 'movie',
      }),
    );

    initUi();
    showNewsletterDialog();

    const status = document.getElementById('newsletterStatus');
    assert.ok(status);
    assert.equal(status.querySelector('img'), null);
    assert.match(status.textContent, /<img src=x onerror=alert\(1\)>@example\.test/);
  });
});
