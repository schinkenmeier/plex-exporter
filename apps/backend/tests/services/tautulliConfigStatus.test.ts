import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import SettingsRepository from '../../src/repositories/settingsRepository.js';
import { TautulliConfigRepository } from '../../src/repositories/tautulliConfigRepository.js';
import {
  resolveActiveTautulliConfig,
  resolveTautulliConfigStatus,
} from '../../src/services/tautulliConfigStatus.js';
import { createTestDatabase, type TestDatabaseHandle } from '../helpers/testDatabase.js';

describe('tautulli config status resolution', () => {
  let dbHandle: TestDatabaseHandle;
  let settingsRepository: SettingsRepository;
  let tautulliConfigRepository: TautulliConfigRepository;

  beforeEach(() => {
    dbHandle = createTestDatabase();
    settingsRepository = new SettingsRepository(dbHandle.drizzle);
    tautulliConfigRepository = new TautulliConfigRepository(dbHandle.drizzle);
  });

  afterEach(() => {
    dbHandle.cleanup();
  });

  it('prefers environment config over saved database config', async () => {
    await tautulliConfigRepository.upsert({
      tautulliUrl: 'https://db-tautulli.example.test',
      apiKey: 'db-secret',
    });

    const status = resolveTautulliConfigStatus({
      envConfig: {
        url: 'https://env-tautulli.example.test',
        apiKey: 'env-secret',
      },
      tautulliConfigRepository,
      settingsRepository,
    });

    expect(status.activeSource).toBe('env');
    expect(status.envOverride).toBe(true);
    expect(status.tautulliUrl).toBe('https://env-tautulli.example.test');
    expect(status.saved).toEqual({
      source: 'tautulli_config',
      tautulliUrl: 'https://db-tautulli.example.test',
      hasApiKey: true,
    });

    expect(resolveActiveTautulliConfig({
      envConfig: {
        url: 'https://env-tautulli.example.test',
        apiKey: 'env-secret',
      },
      tautulliConfigRepository,
      settingsRepository,
    })).toEqual({
      baseUrl: 'https://env-tautulli.example.test',
      apiKey: 'env-secret',
      source: 'env',
    });
  });

  it('prefers database config over complete legacy settings', async () => {
    settingsRepository.set('tautulli.url', 'https://legacy-tautulli.example.test');
    settingsRepository.set('tautulli.apiKey', 'legacy-secret');
    await tautulliConfigRepository.upsert({
      tautulliUrl: 'https://db-tautulli.example.test',
      apiKey: 'db-secret',
    });

    const status = resolveTautulliConfigStatus({
      envConfig: null,
      tautulliConfigRepository,
      settingsRepository,
    });

    expect(status.activeSource).toBe('tautulli_config');
    expect(status.tautulliUrl).toBe('https://db-tautulli.example.test');
    expect(resolveActiveTautulliConfig({
      envConfig: null,
      tautulliConfigRepository,
      settingsRepository,
    })?.source).toBe('tautulli_config');
  });

  it('uses complete legacy settings only as a fallback', () => {
    settingsRepository.set('tautulli.url', 'https://legacy-tautulli.example.test');
    settingsRepository.set('tautulli.apiKey', 'legacy-secret');

    const status = resolveTautulliConfigStatus({
      envConfig: null,
      tautulliConfigRepository,
      settingsRepository,
    });

    expect(status.configured).toBe(true);
    expect(status.activeSource).toBe('legacy_settings');
    expect(status.saved.source).toBe('legacy_settings');
    expect(resolveActiveTautulliConfig({
      envConfig: null,
      tautulliConfigRepository,
      settingsRepository,
    })).toEqual({
      baseUrl: 'https://legacy-tautulli.example.test',
      apiKey: 'legacy-secret',
      source: 'legacy_settings',
    });
  });

  it('does not report partial legacy settings as configured', () => {
    settingsRepository.set('tautulli.url', 'https://legacy-tautulli.example.test');

    const status = resolveTautulliConfigStatus({
      envConfig: null,
      tautulliConfigRepository,
      settingsRepository,
    });

    expect(status.configured).toBe(false);
    expect(status.activeSource).toBe('unset');
    expect(status.saved.source).toBe('unset');
    expect(status.saved.tautulliUrl).toBe('https://legacy-tautulli.example.test');
    expect(resolveActiveTautulliConfig({
      envConfig: null,
      tautulliConfigRepository,
      settingsRepository,
    })).toBeNull();
  });
});
