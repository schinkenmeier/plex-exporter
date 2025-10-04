/**
 * Unit tests for utils.js
 * Run with: node --test site/js/__tests__/utils.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// Mock localStorage for useTmdbOn
global.localStorage = {
  data: {},
  getItem(key) { return this.data[key] || null; },
  setItem(key, value) { this.data[key] = value; }
};

const { humanYear, formatRating, isNew, getGenreNames } = await import('../utils.js');

describe('Utils Module', () => {
  describe('humanYear', () => {
    it('should extract year from full date string', () => {
      assert.strictEqual(humanYear({ originallyAvailableAt: '2023-05-15' }), '2023');
      assert.strictEqual(humanYear({ originallyAvailableAt: '2020-12-31' }), '2020');
    });

    it('should handle year property', () => {
      assert.strictEqual(humanYear({ year: 2023 }), '2023');
      assert.strictEqual(humanYear({ year: '2022' }), '2022');
    });

    it('should handle releaseDate', () => {
      assert.strictEqual(humanYear({ releaseDate: '2021-08-20' }), '2021');
    });

    it('should handle premiereDate', () => {
      assert.strictEqual(humanYear({ premiereDate: '2019-03-10' }), '2019');
    });

    it('should return empty string for invalid input', () => {
      assert.strictEqual(humanYear({}), '');
      assert.strictEqual(humanYear(null), '');
      assert.strictEqual(humanYear(undefined), '');
      assert.strictEqual(humanYear({ title: 'Movie' }), '');
    });

    it('should prioritize originallyAvailableAt over year', () => {
      assert.strictEqual(humanYear({
        originallyAvailableAt: '2023-01-01',
        year: 2022
      }), '2023');
    });
  });

  describe('formatRating', () => {
    it('should format ratings to one decimal place', () => {
      assert.strictEqual(formatRating(8.5), '8.5');
      assert.strictEqual(formatRating(7.0), '7.0');
      assert.strictEqual(formatRating(9.99), '10.0');
    });

    it('should round ratings correctly', () => {
      assert.strictEqual(formatRating(8.23), '8.2');
      assert.strictEqual(formatRating(8.27), '8.3');
      assert.strictEqual(formatRating(8.15), '8.2');
    });

    it('should handle edge cases', () => {
      assert.strictEqual(formatRating(0), '0.0');
      assert.strictEqual(formatRating(10), '10.0');
    });

    it('should handle invalid input', () => {
      assert.strictEqual(formatRating(NaN), '0.0');
      assert.strictEqual(formatRating(null), '0.0');
      assert.strictEqual(formatRating(undefined), '0.0');
    });
  });

  describe('isNew', () => {
    it('should identify new items within 30 days', () => {
      const now = new Date();
      const recent = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000); // 15 days ago
      assert.strictEqual(isNew({ addedAt: recent.toISOString() }), true);
    });

    it('should not identify old items as new', () => {
      const now = new Date();
      const old = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000); // 45 days ago
      assert.strictEqual(isNew({ addedAt: old.toISOString() }), false);
    });

    it('should handle items exactly 30 days old', () => {
      const now = new Date();
      const exactly30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      assert.strictEqual(isNew({ addedAt: exactly30Days.toISOString() }), true);
    });

    it('should handle missing addedAt', () => {
      assert.strictEqual(isNew({}), false);
      assert.strictEqual(isNew(null), false);
      assert.strictEqual(isNew(undefined), false);
    });

    it('should handle invalid date strings', () => {
      assert.strictEqual(isNew({ addedAt: 'invalid-date' }), false);
      assert.strictEqual(isNew({ addedAt: '' }), false);
    });
  });

  describe('getGenreNames', () => {
    it('should extract genre tags from objects', () => {
      const genres = [
        { tag: 'Action' },
        { tag: 'Drama' },
        { tag: 'Comedy' }
      ];
      assert.deepStrictEqual(getGenreNames(genres), ['Action', 'Drama', 'Comedy']);
    });

    it('should handle string arrays', () => {
      const genres = ['Action', 'Drama', 'Comedy'];
      assert.deepStrictEqual(getGenreNames(genres), ['Action', 'Drama', 'Comedy']);
    });

    it('should handle mixed formats', () => {
      const genres = [
        'Action',
        { tag: 'Drama' },
        { title: 'Comedy' }
      ];
      const result = getGenreNames(genres);
      assert.ok(result.includes('Action'));
      assert.ok(result.includes('Drama'));
    });

    it('should filter out empty/invalid entries', () => {
      const genres = [
        { tag: 'Action' },
        null,
        { tag: '' },
        undefined,
        { tag: 'Drama' }
      ];
      assert.deepStrictEqual(getGenreNames(genres), ['Action', 'Drama']);
    });

    it('should handle empty array', () => {
      assert.deepStrictEqual(getGenreNames([]), []);
    });

    it('should handle null/undefined', () => {
      assert.deepStrictEqual(getGenreNames(null), []);
      assert.deepStrictEqual(getGenreNames(undefined), []);
    });

    it('should trim whitespace', () => {
      const genres = [
        { tag: '  Action  ' },
        { tag: 'Drama\n' }
      ];
      assert.deepStrictEqual(getGenreNames(genres), ['Action', 'Drama']);
    });
  });
});
