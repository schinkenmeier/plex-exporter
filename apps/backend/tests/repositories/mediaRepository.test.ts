import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import MediaRepository from '../../src/repositories/mediaRepository.js';
import { createTestDatabase, type TestDatabaseHandle } from '../helpers/testDatabase.js';

describe('MediaRepository', () => {
  let dbHandle: TestDatabaseHandle;
  let repository: MediaRepository;

  beforeEach(() => {
    dbHandle = createTestDatabase();
    repository = new MediaRepository(dbHandle.drizzle);
  });

  afterEach(() => {
    dbHandle.cleanup();
  });

  it('filters only new entries based on plexAddedAt unix timestamps', () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const oldSeconds = Math.floor((Date.now() - 60 * 24 * 60 * 60 * 1000) / 1000);

    repository.create({
      plexId: 'recent',
      title: 'Recent Item',
      mediaType: 'movie',
      plexAddedAt: String(nowSeconds),
      addedAt: null,
    });

    repository.create({
      plexId: 'old',
      title: 'Old Item',
      mediaType: 'movie',
      plexAddedAt: String(oldSeconds),
      addedAt: null,
    });

    const filters = { mediaType: 'movie', onlyNew: true, newDays: 30 };

    const items = repository.filter(filters);
    const total = repository.count(filters);

    expect(items).toHaveLength(1);
    expect(items[0].plexId).toBe('recent');
    expect(total).toBe(1);
  });
});
