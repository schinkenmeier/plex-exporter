import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalLocalStorage = globalThis.localStorage;
const originalFetch = globalThis.fetch;
const originalFormData = globalThis.FormData;

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
const { initUi, showNewsletterDialog, subscribe } = await import('../../src/features/newsletter/index.js');

describe('newsletter UI', () => {
  beforeEach(() => {
    setupDom();
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          active: true,
          email: 'user@example.test',
          mediaType: null,
        },
      }),
    });
  });

  afterEach(() => {
    if(originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
    if(originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
    if(originalLocalStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = originalLocalStorage;
    if(originalFetch === undefined) delete globalThis.fetch; else globalThis.fetch = originalFetch;
    if(originalFormData === undefined) delete globalThis.FormData; else globalThis.FormData = originalFormData;
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

  it('uses same-origin newsletter API when no API base is configured', async () => {
    const calls = [];
    window.PLEX_EXPORTER_API_BASE = '';
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            active: true,
            email: 'user@example.test',
            mediaType: null,
          },
        }),
      };
    };

    await subscribe('user@example.test');

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/newsletter/subscribe');
    assert.deepEqual(JSON.parse(calls[0].options.body), { email: 'user@example.test' });
  });

  it('omits mediaType when the newsletter form is submitted with all media selected', async () => {
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            active: true,
            email: 'user@example.test',
            mediaType: null,
          },
        }),
      };
    };

    showNewsletterDialog();
    globalThis.FormData = class {
      get(name) {
        return name === 'email' ? 'user@example.test' : '';
      }
    };
    document.getElementById('newsletterForm').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true }),
    );
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(calls.length, 1);
    assert.deepEqual(JSON.parse(calls[0].options.body), { email: 'user@example.test' });
  });
});
