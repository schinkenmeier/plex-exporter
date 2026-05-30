import { describe, it, before, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { parseHTML } from 'linkedom';

const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;

let tmpDir;
let apiModule;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '..', '..');

before(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), 'plex-admin-api-'));
  const outfile = path.join(tmpDir, 'api.mjs');
  await build({
    entryPoints: ['src/admin/core/api.ts'],
    absWorkingDir: frontendRoot,
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2022'],
  });
  apiModule = await import(pathToFileURL(outfile).href);
});

afterEach(async () => {
  if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
  if (originalFetch === undefined) delete globalThis.fetch; else globalThis.fetch = originalFetch;
});

after(async () => {
  if (tmpDir) {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

describe('admin API client errors', () => {
  beforeEach(() => {
    const { window } = parseHTML('<!doctype html><html><body></body></html>');
    window.location = { origin: 'https://admin.example.test' };
    globalThis.window = window;
  });

  it('extracts messages from existing backend error response shapes', () => {
    const { extractAdminApiErrorMessage } = apiModule;

    assert.equal(
      extractAdminApiErrorMessage({ message: 'top-level message' }, 'fallback'),
      'top-level message',
    );
    assert.equal(
      extractAdminApiErrorMessage({ error: 'string error' }, 'fallback'),
      'string error',
    );
    assert.equal(
      extractAdminApiErrorMessage({ error: { message: 'nested error message' } }, 'fallback'),
      'nested error message',
    );
    assert.equal(
      extractAdminApiErrorMessage({
        error: {
          message: 'envelope message',
          statusCode: 400,
          details: { fieldErrors: {} },
        },
        meta: { timestamp: '2026-01-01T00:00:00Z', path: '/admin/api/test', method: 'POST' },
      }, 'fallback'),
      'envelope message',
    );
    assert.equal(
      extractAdminApiErrorMessage({ details: 'details message' }, 'fallback'),
      'details message',
    );
  });

  it('throws ApiError with normalized message and status', async () => {
    const { AdminApiClient, ApiError } = apiModule;
    globalThis.fetch = async () => ({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      text: async () => JSON.stringify({ error: { message: 'Resend test failed' } }),
    });

    const client = new AdminApiClient('/admin/api');

    await assert.rejects(
      () => client.testResend('user@example.test'),
      error => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.message, 'Resend test failed');
        assert.equal(error.status, 502);
        return true;
      },
    );
  });
});
