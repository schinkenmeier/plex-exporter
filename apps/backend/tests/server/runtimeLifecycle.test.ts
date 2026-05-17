import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createServer, createRuntime } from '../../src/createServer.js';
import { startServer } from '../../src/server.js';
import type { AppConfig } from '../../src/config/index.js';

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
      tautulli: null,
      tmdb: null,
      admin: null,
      resend: null,
    };
  };

  it('creates a runtime, returns its Express app, and disposes idempotently', () => {
    const runtime = createRuntime(createConfig());
    const app = createServer(runtime);

    expect(app).toBe(runtime.app);
    expect(runtime.getSchedulerService()).toBeNull();

    runtime.dispose();
    runtime.dispose();
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
});
