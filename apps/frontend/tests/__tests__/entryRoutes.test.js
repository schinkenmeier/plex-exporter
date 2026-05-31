import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const publicDir = path.join(repoRoot, 'apps', 'frontend', 'public');

const readPublicFile = (name) => readFile(path.join(publicDir, name), 'utf8');

describe('entry route documents', () => {
  it('keeps root as portal without booting the library app', async () => {
    const html = await readPublicFile('index.html');

    assert.match(html, /data-page="portal"/);
    assert.match(html, /href="\/library"/);
    assert.match(html, /href="\/admin"/);
    assert.doesNotMatch(html, /src="\/?dist\/main\.js"/);
  });

  it('serves the library shell from the dedicated library entrypoint', async () => {
    const html = await readPublicFile('library.html');

    assert.match(html, /id="grid"/);
    assert.match(html, /id="libraryTabs"/);
    assert.match(html, /id="watchlistModal"/);
    assert.match(html, /src="\/dist\/main\.js"/);
  });

  it('routes /library before the generic Caddy fallback', async () => {
    const caddyfile = await readFile(path.join(repoRoot, 'Caddyfile'), 'utf8');
    const adminIndex = caddyfile.indexOf('handle /admin*');
    const libraryIndex = caddyfile.indexOf('handle /library*');
    const fallbackIndex = caddyfile.indexOf('try_files {path} /index.html');

    assert.ok(adminIndex >= 0, 'admin proxy route is present');
    assert.ok(libraryIndex > adminIndex, 'library route stays after protected admin route');
    assert.ok(libraryIndex < fallbackIndex, 'library route is before generic frontend fallback');
    assert.match(caddyfile, /try_files \{path\} \/library\.html/);
  });
});
