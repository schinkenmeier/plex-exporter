import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { parseHTML } from 'linkedom';

const XSS_PAYLOAD = '<img src=x onerror=alert(1)>';
const tempDirs = [];
const originals = {
  window: globalThis.window,
  document: globalThis.document,
  HTMLElement: globalThis.HTMLElement,
  HTMLInputElement: globalThis.HTMLInputElement,
  HTMLSelectElement: globalThis.HTMLSelectElement,
  Event: globalThis.Event,
  EventSource: globalThis.EventSource,
  fetch: globalThis.fetch,
  requestAnimationFrame: globalThis.requestAnimationFrame,
};

function setupDom(html = '<div id="root"></div>') {
  const { window } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const location = new URL('https://frontend.test/');
  window.location = {
    href: location.href,
    origin: location.origin,
    hash: '',
    assign() {},
    replace() {},
    reload() {},
    toString() {
      return this.href;
    },
  };
  window.requestAnimationFrame = callback => {
    callback(Date.now());
    return 1;
  };

  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.HTMLInputElement = window.HTMLInputElement;
  globalThis.HTMLSelectElement = window.HTMLSelectElement;
  globalThis.Event = window.Event;
  globalThis.requestAnimationFrame = window.requestAnimationFrame;

  return window;
}

function restoreGlobals() {
  for (const [key, value] of Object.entries(originals)) {
    if (value === undefined) {
      delete globalThis[key];
    } else {
      globalThis[key] = value;
    }
  }
}

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => JSON.stringify(body),
  };
}

function installFetch(routes) {
  globalThis.fetch = async url => {
    const parsed = new URL(String(url), 'https://frontend.test');
    const route = routes[parsed.pathname];
    if (!route) {
      throw new Error(`Unexpected fetch: ${parsed.pathname}`);
    }
    return jsonResponse(typeof route === 'function' ? route(parsed) : route);
  };
}

async function importBundled(relativePath, name) {
  const dir = await mkdtemp(join(tmpdir(), `plex-exporter-admin-xss-${name}-`));
  tempDirs.push(dir);
  const outfile = join(dir, `${name}.mjs`);
  await build({
    entryPoints: [fileURLToPath(new URL(relativePath, import.meta.url))],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    logLevel: 'silent',
  });
  return import(`${pathToFileURL(outfile).href}?cache=${Date.now()}-${Math.random()}`);
}

async function flushAsyncWork() {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
}

afterEach(async () => {
  restoreGlobals();
  while (tempDirs.length) {
    await rm(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe('admin/frontend XSS safety', () => {
  it('renders welcome stats and config snapshots without executing HTML payloads', async () => {
    setupDom();
    installFetch({
      '/admin/api/tmdb': {
        enabled: false,
        tokenPreview: null,
        source: 'database',
        fromEnv: false,
        fromDatabase: false,
      },
      '/admin/api/resend/settings': {
        success: true,
        enabled: false,
        fromDatabase: false,
        fromEnv: false,
        source: 'database',
        apiKeyPreview: null,
        fromEmail: null,
        updatedAt: null,
      },
      '/admin/api/watchlist/admin-email': {
        success: true,
        adminEmail: null,
        updatedAt: null,
      },
      '/api/welcome-email/stats': {
        success: true,
        data: {
          total: XSS_PAYLOAD,
          sent: 1,
          failed: 0,
          successRate: XSS_PAYLOAD,
        },
      },
      '/api/welcome-email/history': {
        success: true,
        data: [],
      },
      '/admin/api/config': {
        runtime: { env: XSS_PAYLOAD },
        server: { port: 3000 },
        auth: { enabled: false, token: '***' },
        database: { sqlitePath: ':memory:', exists: true },
        hero: { policyPath: XSS_PAYLOAD, policyExists: true },
        tautulli: {
          enabled: true,
          url: XSS_PAYLOAD,
          apiKey: '***',
          source: 'tautulli_config',
          activeSource: 'tautulli_config',
          fromEnv: false,
          envOverride: false,
          saved: {
            source: 'tautulli_config',
            tautulliUrl: XSS_PAYLOAD,
            hasApiKey: true,
          },
        },
        tmdb: {
          enabled: false,
          accessToken: null,
          source: 'unset',
          updatedAt: null,
          fromEnv: false,
          fromDatabase: false,
        },
        resend: {
          enabled: false,
          apiKey: '',
          fromEmail: '',
        },
      },
    });

    const { configView } = await importBundled('../../src/admin/views/config/index.ts', 'config-view');
    configView.mount({
      container: document.getElementById('root'),
      toast: { show() {} },
    });
    await flushAsyncWork();

    assert.equal(document.querySelector('img'), null);
    assert.match(document.body.textContent, /Gesamt: <img src=x onerror=alert\(1\)>/);
    assert.match(document.body.textContent, /Aktive URL/);
    assert.match(document.body.textContent, /<img src=x onerror=alert\(1\)>/);
  });

  it('renders Tautulli library labels as text', async () => {
    setupDom();
    class FakeEventSource {
      addEventListener() {}
      close() {}
    }
    globalThis.EventSource = FakeEventSource;
    window.EventSource = FakeEventSource;
    installFetch({
      '/admin/api/tautulli/config': {
        configured: false,
        source: 'unset',
        activeSource: 'unset',
        fromEnv: false,
        envOverride: false,
        tautulliUrl: null,
        hasApiKey: false,
        saved: {
          source: 'unset',
          tautulliUrl: null,
          hasApiKey: false,
        },
      },
      '/admin/api/tautulli/library-sections': {
        sections: [],
      },
      '/admin/api/tautulli/sync/schedules': {
        schedules: [],
      },
      '/admin/api/tautulli/snapshots/settings': {
        maxSnapshots: 50,
        storedLimit: null,
        defaults: { min: 0, max: 500, fallback: 50 },
      },
      '/admin/api/tautulli/sync/live/state': {
        activeRun: null,
        lastRun: null,
        events: [],
      },
      '/admin/api/tautulli/libraries': {
        libraries: [
          {
            sectionId: 1,
            sectionName: XSS_PAYLOAD,
            friendlyName: XSS_PAYLOAD,
            sectionType: 'movie',
          },
        ],
      },
    });

    const { tautulliView } = await importBundled('../../src/admin/views/tautulli/index.ts', 'tautulli-view');
    tautulliView.mount({
      container: document.getElementById('root'),
      toast: { show() {} },
    });
    await flushAsyncWork();

    document.getElementById('btn-load-libraries').dispatchEvent(new Event('click', { bubbles: true }));
    await flushAsyncWork();

    const libraries = document.getElementById('tautulli-libraries');
    assert.equal(libraries.querySelector('img'), null);
    assert.match(libraries.textContent, /<img src=x onerror=alert\(1\)> \(movie\)/);
  });

  it('renders catalog error toasts as text', async () => {
    setupDom();
    const { createErrorToast, clearErrorToasts } = await import('../../src/ui/errorToast.js');

    createErrorToast({
      title: XSS_PAYLOAD,
      message: XSS_PAYLOAD,
    });

    assert.equal(document.querySelector('img'), null);
    assert.match(document.querySelector('.error-toast-title').textContent, /<img src=x onerror=alert\(1\)>/);
    assert.match(document.querySelector('.error-toast-message').textContent, /<img src=x onerror=alert\(1\)>/);

    clearErrorToasts();
  });
});
