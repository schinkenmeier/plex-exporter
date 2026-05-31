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

  it('persists user-ui metadata and keeps filter/count parity', () => {
    repository.create({
      plexId: 'movie-rich',
      title: 'Rich Movie',
      mediaType: 'movie',
      summary: 'A searchable summary.',
      studio: 'Studio One',
      genres: ['Drama'],
      directors: ['Director One'],
      writers: ['Writer One'],
      languages: ['German', 'English'],
      originalLanguage: 'de',
      rating: 9.1,
      trailerYoutubeId: 'abc123',
      trailerSite: 'YouTube',
      trailerName: 'Official Trailer',
      trailerUrl: 'https://www.youtube-nocookie.com/embed/abc123',
    });
    repository.create({
      plexId: 'movie-other',
      title: 'Other Movie',
      mediaType: 'movie',
      studio: 'Studio Two',
      languages: ['French'],
      originalLanguage: 'fr',
      rating: 6.2,
    });

    const filters = {
      mediaType: 'movie' as const,
      studio: 'Studio One',
      language: 'German',
      search: 'Writer One',
      sortBy: 'rating' as const,
      sortOrder: 'desc' as const,
    };
    const items = repository.filter(filters);

    expect(items).toHaveLength(1);
    expect(repository.count(filters)).toBe(1);
    expect(items[0]).toMatchObject({
      plexId: 'movie-rich',
      writers: ['Writer One'],
      languages: ['German', 'English'],
      originalLanguage: 'de',
      trailerYoutubeId: 'abc123',
      trailerSite: 'YouTube',
      trailerName: 'Official Trailer',
      trailerUrl: 'https://www.youtube-nocookie.com/embed/abc123',
    });
  });

  it('sorts by rating descending', () => {
    repository.create({ plexId: 'low', title: 'Low Rating', mediaType: 'movie', rating: 3 });
    repository.create({ plexId: 'high', title: 'High Rating', mediaType: 'movie', rating: 9 });

    const items = repository.filter({
      mediaType: 'movie',
      sortBy: 'rating',
      sortOrder: 'desc',
    });

    expect(items.map((item) => item.plexId)).toEqual(['high', 'low']);
  });
});
