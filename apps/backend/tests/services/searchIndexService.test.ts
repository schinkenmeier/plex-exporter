import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createExportService } from '../../src/services/exportService.js';
import {
  buildFacets,
  createSearchIndexService,
  filterIndexedMediaItems,
  filterIndexedMediaItemsPaged,
} from '../../src/services/searchIndexService.js';

const writeJson = (targetPath: string, data: unknown) => {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(data, null, 2), 'utf8');
};

describe('searchIndexService', () => {
  let tempDir: string;
  let moviesPath: string;
  let exportService: ReturnType<typeof createExportService>;
  let searchIndexService: ReturnType<typeof createSearchIndexService>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'search-index-service-'));
    moviesPath = path.join(tempDir, 'movies', 'movies.json');
    exportService = createExportService({ root: tempDir });
    searchIndexService = createSearchIndexService({ exportService });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('rebuilds indexed metadata when export files change', async () => {
    const nowIso = new Date().toISOString();
    writeJson(moviesPath, [
      {
        ratingKey: '1',
        title: 'Alpha',
        summary: 'First movie about heroes',
        type: 'movie',
        genres: ['Action'],
        collections: ['Legacy Collection'],
        addedAt: nowIso,
        originallyAvailableAt: '2020-01-01',
        roles: [{ tag: 'Hero One' }],
      },
    ]);

    const initialIndex = await searchIndexService.getIndexedLibrary('movie');
    expect(initialIndex.entries).toHaveLength(1);
    expect(initialIndex.entries[0].meta.year).toBe(2020);
    expect(initialIndex.entries[0].meta.genreSet.has('Action')).toBe(true);

    const initialMatch = filterIndexedMediaItems(initialIndex.entries, { query: 'alpha' });
    expect(initialMatch.map((item) => item.entry.title)).toEqual(['Alpha']);

    const olderDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    await new Promise((resolve) => setTimeout(resolve, 10));
    writeJson(moviesPath, [
      {
        ratingKey: '2',
        title: 'Beta',
        summary: 'Second entry set in space',
        type: 'movie',
        genres: ['Drama'],
        collections: ['New Collection'],
        addedAt: olderDate,
        originallyAvailableAt: '2021-05-20',
        roles: [{ tag: 'Explorer' }],
      },
    ]);

    const updatedIndex = await searchIndexService.getIndexedLibrary('movie', { force: true });
    expect(updatedIndex.entries).toHaveLength(1);
    expect(updatedIndex.entries[0].meta.year).toBe(2021);
    expect(updatedIndex.entries[0].meta.genreSet.has('Drama')).toBe(true);
    expect(updatedIndex.entries[0].meta.collectionSet.has('New Collection')).toBe(true);

    const legacyMatch = filterIndexedMediaItems(updatedIndex.entries, { query: 'alpha' });
    expect(legacyMatch).toHaveLength(0);

    const betaMatch = filterIndexedMediaItems(updatedIndex.entries, { query: 'beta' });
    expect(betaMatch.map((item) => item.entry.title)).toEqual(['Beta']);

    const genreMatch = filterIndexedMediaItems(updatedIndex.entries, { genres: ['Drama'] });
    expect(genreMatch).toHaveLength(1);
    const missingGenre = filterIndexedMediaItems(updatedIndex.entries, { genres: ['Action'] });
    expect(missingGenre).toHaveLength(0);

    const collectionMatch = filterIndexedMediaItems(updatedIndex.entries, { collection: 'New Collection' });
    expect(collectionMatch).toHaveLength(1);

    const newItems = filterIndexedMediaItems(updatedIndex.entries, { onlyNew: true, newDays: 30 });
    expect(newItems).toHaveLength(0);

    const yearMatch = filterIndexedMediaItems(updatedIndex.entries, { yearFrom: 2021, yearTo: 2022 });
    expect(yearMatch).toHaveLength(1);

    const paged = filterIndexedMediaItemsPaged(updatedIndex.entries, {}, { offset: 0, limit: 1 });
    expect(paged.total).toBe(1);
    expect(paged.items[0].entry.title).toBe('Beta');
  });

  it('builds and caches facets from indexed entries', async () => {
    writeJson(moviesPath, [
      {
        ratingKey: '1',
        title: 'Bravo',
        type: 'movie',
        genres: ['Drama'],
        collections: ['Collection B'],
        originallyAvailableAt: '2021-05-20',
      },
      {
        ratingKey: '2',
        title: 'Alpha',
        type: 'movie',
        genres: ['Action'],
        collections: ['Collection A'],
        originallyAvailableAt: '2019-07-10',
      },
    ]);

    const movieIndex = await searchIndexService.getIndexedLibrary('movie');
    const facets = buildFacets(movieIndex);
    expect(facets).toEqual({
      genres: ['Action', 'Drama'],
      years: [2019, 2021],
      collections: ['Collection A', 'Collection B'],
    });
    expect(buildFacets(movieIndex)).toBe(facets);

    await new Promise((resolve) => setTimeout(resolve, 10));

    writeJson(moviesPath, [
      {
        ratingKey: '3',
        title: 'Gamma',
        type: 'movie',
        genres: ['Comedy'],
        collections: ['Collection C'],
        originallyAvailableAt: '2022-08-15',
      },
    ]);

    const updatedIndex = await searchIndexService.getIndexedLibrary('movie', { force: true });
    const updatedFacets = buildFacets(updatedIndex);
    expect(updatedFacets).toEqual({
      genres: ['Comedy'],
      years: [2022],
      collections: ['Collection C'],
    });
    expect(updatedFacets).not.toBe(facets);
    expect(buildFacets(updatedIndex)).toBe(updatedFacets);
  });
});
