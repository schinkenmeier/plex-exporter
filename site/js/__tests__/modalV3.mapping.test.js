import { describe, it } from 'node:test';
import assert from 'node:assert';

import { mapMovie, mapShow, mergeShowDetail, normalizeGenresList } from '../modalV3/mapping.js';

describe('modalV3/mapping', () => {
  describe('mapMovie', () => {
    it('normalizes movie type and identifiers', () => {
      const source = { type: 'show', tmdbId: '123', guid: 'imdb://tt12345' };
      const mapped = mapMovie(source);
      assert.strictEqual(mapped.type, 'tv');
      assert.strictEqual(mapped.ids.tmdb, '123');
      assert.strictEqual(mapped.ids.imdb, 'tt12345');
      assert.notStrictEqual(mapped, source);
    });
  });

  describe('mapShow', () => {
    it('ensures show structure with normalized seasons and cast', () => {
      const source = {
        type: 'movie',
        tmdbId: '321',
        cast: [{ name: 'Hero', thumb: '/cast.jpg' }],
        seasons: [{ season: 1, episodes: [{ episode: 1, thumb: '/ep.jpg' }] }],
      };
      const mapped = mapShow(source);
      assert.strictEqual(mapped.type, 'tv');
      assert.ok(Array.isArray(mapped.seasons));
      assert.strictEqual(mapped.seasons.length, 1);
      assert.strictEqual(mapped.seasons[0].episodes.length, 1);
      assert.ok(Array.isArray(mapped.cast));
      assert.strictEqual(mapped.cast[0].name, 'Hero');
    });
  });

  describe('mergeShowDetail', () => {
    it('merges TMDB detail into base show and preserves ids', () => {
      const target = { title: 'Show', ids: { tmdb: '5' }, seasons: [] };
      const detail = { tmdbId: '5', genres: ['Drama'], seasons: [{ seasonNumber: 1 }] };
      const merged = mergeShowDetail(target, detail);
      assert.strictEqual(merged.ids.tmdb, '5');
      assert.strictEqual(merged.genres[0].tag, 'Drama');
      assert.strictEqual(merged.seasons.length, 1);
    });
  });

  describe('normalizeGenresList', () => {
    it('deduplicates entries and normalizes shape', () => {
      const genres = normalizeGenresList(['Drama', { name: 'drama' }, { name: 'Comedy' }]);
      assert.deepStrictEqual(genres, [
        { tag: 'Drama' },
        { name: 'drama', tag: 'drama' },
        { name: 'Comedy', tag: 'Comedy' },
      ]);
    });
  });
});
