import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { createServer, createRuntime } from '../../src/createServer.js';
import { startServer } from '../../src/server.js';
import type { AppConfig } from '../../src/config/index.js';
import { createTestDatabase } from '../helpers/testDatabase.js';
import SettingsRepository from '../../src/repositories/settingsRepository.js';
import { TautulliConfigRepository } from '../../src/repositories/tautulliConfigRepository.js';
import type { SyncStats } from '../../src/services/tautulliSyncService.js';

describe('server runtime lifecycle', () => {
  let tempDir: string | null = null;

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  const createConfig = (): AppConfig => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plex-exporter-runtime-test-'));
    return {
      runtime: { env: 'test' },
      server: { port: 0 },
      auth: null,
      database: { sqlitePath: path.join(tempDir, 'runtime.sqlite') },
      hero: { policyPath: null },
      scheduler: { timezone: 'Europe/Berlin' },
      tautulli: null,
      tmdb: null,
      admin: null,
      resend: null,
    };
  };

  const createStats = (): SyncStats => ({
    totalCreated: 0,
    totalUpdated: 0,
    totalDeleted: 0,
    totalSkipped: 0,
    totalErrors: 0,
    results: [],
    startTime: Date.now(),
    endTime: Date.now(),
    duration: 0,
  });

  const createDeferred = <T>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
      resolve = res;
    });
    return { promise, resolve };
  };

  it('creates a runtime, returns its Express app, and disposes idempotently', () => {
    const runtime = createRuntime(createConfig());
    const app = createServer(runtime);

    expect(app).toBe(runtime.app);
    expect(app.locals.runtime).toBe(runtime);
    expect(runtime.getSchedulerService()).toBeNull();

    runtime.dispose();
    runtime.dispose();
  });

  it('keeps createServer(appConfig, deps) as a compatibility wrapper with attached runtime', async () => {
    const app = createServer(createConfig());
    const runtime = app.locals.runtime;

    expect(runtime).toBeTruthy();
    expect(runtime.app).toBe(app);

    const response = await request(app).get('/health');
    expect(response.status).toBe(200);

    runtime.dispose();
  });

  it('does not rebuild an app when createServer receives an existing runtime', () => {
    const runtime = createRuntime(createConfig());
    const firstApp = createServer(runtime);
    const secondApp = createServer(runtime);

    expect(firstApp).toBe(runtime.app);
    expect(secondApp).toBe(firstApp);

    runtime.dispose();
  });

  it('disposes internally owned database resources once', () => {
    const runtime = createRuntime(createConfig());
    const closeSpy = vi.spyOn(runtime.database, 'close');

    runtime.dispose();
    runtime.dispose();

    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('does not dispose injected database dependencies', () => {
    const dbHandle = createTestDatabase();
    const closeSpy = vi.spyOn(dbHandle.sqlite, 'close');

    try {
      const runtime = createRuntime(createConfig(), {
        database: dbHandle.sqlite,
        drizzleDatabase: dbHandle.drizzle,
      });

      runtime.dispose();

      expect(closeSpy).not.toHaveBeenCalled();
      expect(() => dbHandle.sqlite.prepare('SELECT 1').get()).not.toThrow();
    } finally {
      dbHandle.cleanup();
    }
  });

  it('uses canonical database Tautulli config before legacy settings', async () => {
    const dbHandle = createTestDatabase();
    const settingsRepository = new SettingsRepository(dbHandle.drizzle);
    const tautulliConfigRepository = new TautulliConfigRepository(dbHandle.drizzle);
    settingsRepository.set('tautulli.url', 'https://legacy-tautulli.example.test');
    settingsRepository.set('tautulli.apiKey', 'legacy-secret');
    await tautulliConfigRepository.upsert({
      tautulliUrl: 'https://db-tautulli.example.test',
      apiKey: 'db-secret',
    });

    try {
      const runtime = createRuntime(createConfig(), {
        database: dbHandle.sqlite,
        drizzleDatabase: dbHandle.drizzle,
      });

      expect(runtime.getTautulliConfigStatus().activeSource).toBe('tautulli_config');
      expect((runtime.getTautulliService() as { getBaseUrl?: () => string } | null)?.getBaseUrl?.()).toBe(
        'https://db-tautulli.example.test',
      );
      runtime.dispose();
    } finally {
      dbHandle.cleanup();
    }
  });

  it('uses environment Tautulli config before saved database config', async () => {
    const dbHandle = createTestDatabase();
    const tautulliConfigRepository = new TautulliConfigRepository(dbHandle.drizzle);
    await tautulliConfigRepository.upsert({
      tautulliUrl: 'https://db-tautulli.example.test',
      apiKey: 'db-secret',
    });

    try {
      const config = createConfig();
      config.tautulli = {
        url: 'https://env-tautulli.example.test',
        apiKey: 'env-secret',
      };
      const runtime = createRuntime(config, {
        database: dbHandle.sqlite,
        drizzleDatabase: dbHandle.drizzle,
      });

      const status = runtime.getTautulliConfigStatus();
      expect(status.activeSource).toBe('env');
      expect(status.envOverride).toBe(true);
      expect(status.saved.source).toBe('tautulli_config');
      expect((runtime.getTautulliService() as { getBaseUrl?: () => string } | null)?.getBaseUrl?.()).toBe(
        'https://env-tautulli.example.test',
      );
      runtime.dispose();
    } finally {
      dbHandle.cleanup();
    }
  });

  it('owns runtime disposal when the started HTTP server shuts down', async () => {
    const handle = startServer({
      appConfig: createConfig(),
      registerSignalHandlers: false,
      exitProcessOnSignal: false,
    });
    const disposeSpy = vi.spyOn(handle.runtime, 'dispose');

    await handle.shutdown('SIGTERM');
    await handle.shutdown();

    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });

  it('drains an active sync before disposing runtime during shutdown', async () => {
    const handle = startServer({
      appConfig: createConfig(),
      registerSignalHandlers: false,
      exitProcessOnSignal: false,
    });
    const closeSpy = vi.spyOn(handle.runtime.database, 'close');
    const deferred = createDeferred<SyncStats>();

    const started = handle.runtime.syncCoordinator.start('manual', {}, () => deferred.promise);
    expect(started.status).toBe('started');

    const shutdown = handle.shutdown('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(closeSpy).not.toHaveBeenCalled();

    deferred.resolve(createStats());
    await shutdown;

    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
