import { describe, expect, it } from 'vitest';

import { createTmdbManager } from '../../src/services/tmdbManager.js';

describe('createTmdbManager', () => {
  it('uses the environment token ahead of a saved database token', () => {
    const manager = createTmdbManager({
      envToken: 'env-token-123456',
      dbToken: 'db-token-654321',
      updatedAt: 123,
    });

    expect(manager.getStatus()).toMatchObject({
      hasToken: true,
      source: 'env',
      fromEnv: true,
      fromDatabase: false,
      updatedAt: null,
      envOverride: true,
      saved: {
        tokenPreview: 'db-t…4321',
        updatedAt: 123,
      },
    });
    expect(manager.getStatus().tokenPreview).toBe('env-…3456');

    manager.setDatabaseToken('new-db-token-987654', { updatedAt: 456 });

    expect(manager.getStatus()).toMatchObject({
      hasToken: true,
      source: 'env',
      fromEnv: true,
      fromDatabase: false,
      updatedAt: null,
      envOverride: true,
      saved: {
        tokenPreview: 'new-…7654',
        updatedAt: 456,
      },
    });
    expect(manager.getStatus().tokenPreview).toBe('env-…3456');
  });
});
