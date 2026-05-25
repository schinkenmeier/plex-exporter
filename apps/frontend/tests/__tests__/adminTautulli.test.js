import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;

function setupDom(){
  const { window } = parseHTML('<!doctype html><html><body><div id="summary"></div></body></html>');
  globalThis.window = window;
  globalThis.document = window.document;
}

setupDom();
const { formatConfigStatus, renderConfigSummary } = await import('../../src/admin/views/tautulli/configStatus.js');
const {
  formatSyncRunDegradedMessage,
  formatSyncRunStatus,
  formatSyncRunSummary,
  getSyncRunStatusClass,
} = await import('../../src/admin/views/tautulli/syncStatus.js');

describe('admin Tautulli config UI helpers', () => {
  beforeEach(() => {
    setupDom();
  });

  afterEach(() => {
    if(originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
    if(originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
  });

  it('shows when environment config is active and saved DB config is inactive', () => {
    const config = {
      configured: true,
      source: 'env',
      activeSource: 'env',
      fromEnv: true,
      envOverride: true,
      tautulliUrl: 'https://env-tautulli.example.test',
      hasApiKey: true,
      saved: {
        source: 'tautulli_config',
        tautulliUrl: 'https://db-tautulli.example.test',
        hasApiKey: true,
      },
    };
    const summary = document.getElementById('summary');

    renderConfigSummary(summary, config);

    assert.equal(formatConfigStatus(config), 'Aktiv: Environment. API-Key ist gesetzt.');
    assert.match(summary.textContent, /Aktiv: Environment/);
    assert.match(summary.textContent, /ENV-Override/);
    assert.match(summary.textContent, /DB-Konfiguration ist gespeichert, aber aktuell nicht aktiv/);
    assert.match(summary.textContent, /https:\/\/db-tautulli\.example\.test/);
  });

  it('shows database config as active without override warning', () => {
    const config = {
      configured: true,
      source: 'tautulli_config',
      activeSource: 'tautulli_config',
      fromEnv: false,
      envOverride: false,
      tautulliUrl: 'https://db-tautulli.example.test',
      hasApiKey: true,
      saved: {
        source: 'tautulli_config',
        tautulliUrl: 'https://db-tautulli.example.test',
        hasApiKey: true,
      },
    };
    const summary = document.getElementById('summary');

    renderConfigSummary(summary, config);

    assert.equal(formatConfigStatus(config), 'Aktiv: Datenbank. API-Key ist gesetzt.');
    assert.match(summary.textContent, /Aktiv: Datenbank/);
    assert.doesNotMatch(summary.textContent, /DB-Konfiguration ist gespeichert, aber aktuell nicht aktiv/);
  });

  it('renders older config responses without saved status defensively', () => {
    const config = {
      configured: false,
      source: 'unset',
      activeSource: 'unset',
      fromEnv: false,
      envOverride: false,
      tautulliUrl: null,
      hasApiKey: false,
    };
    const summary = document.getElementById('summary');

    renderConfigSummary(summary, config);

    assert.match(summary.textContent, /Aktiv: Nicht gesetzt/);
    assert.match(summary.textContent, /Nicht gespeichert/);
  });
});

describe('admin Tautulli sync status helpers', () => {
  it('formats completed syncs with errors as warning states', () => {
    const run = {
      runId: 'run-1',
      source: 'manual',
      status: 'completed_with_errors',
      startedAt: '2026-05-22T10:00:00.000Z',
      finishedAt: '2026-05-22T10:02:00.000Z',
      durationMs: 120000,
      options: { incremental: false, enrichWithTmdb: true, syncCovers: true, refreshMediaInfo: true },
      stats: {
        totalCreated: 1,
        totalUpdated: 2,
        totalDeleted: 0,
        totalSkipped: 3,
        totalErrors: 1,
      },
      error: null,
      degraded: true,
    };

    assert.equal(formatSyncRunStatus(run.status, run.degraded), 'Mit Fehlern abgeschlossen');
    assert.match(getSyncRunStatusClass(run.status, run.degraded), /admin-chip-warning/);
    assert.equal(
      formatSyncRunSummary(run.stats),
      'Erstellt 1, Aktualisiert 2, Gelöscht 0, Übersprungen 3, Fehler 1',
    );
    assert.match(formatSyncRunDegradedMessage(run), /mit 1 Fehler abgeschlossen/);
  });

  it('keeps clean completed syncs visually successful', () => {
    assert.equal(formatSyncRunStatus('completed', false), 'Abgeschlossen');
    assert.match(getSyncRunStatusClass('completed', false), /admin-chip-success/);
    assert.equal(formatSyncRunDegradedMessage({
      runId: 'run-2',
      source: 'scheduler',
      status: 'completed',
      startedAt: '2026-05-22T10:00:00.000Z',
      finishedAt: '2026-05-22T10:01:00.000Z',
      durationMs: 60000,
      options: { incremental: true, enrichWithTmdb: true, syncCovers: false, refreshMediaInfo: true },
      stats: {
        totalCreated: 0,
        totalUpdated: 0,
        totalDeleted: 0,
        totalSkipped: 0,
        totalErrors: 0,
      },
      error: null,
      degraded: false,
    }), '');
    assert.equal(formatSyncRunStatus('completed', true), 'Mit Warnungen abgeschlossen');
    assert.match(getSyncRunStatusClass('completed', true), /admin-chip-warning/);
  });
});
