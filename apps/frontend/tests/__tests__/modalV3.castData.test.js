import { describe, it } from 'node:test';
import assert from 'node:assert';

import { buildCastList, normalizeLocalCast, normalizeTmdbCast } from '../../src/features/modal/modalV3/castData.js';

describe('modalV3/castData', () => {
  describe('normalizeLocalCast', () => {
    it('normalizes string entries', () => {
      const result = normalizeLocalCast('Jane Doe');
      assert.strictEqual(result.name, 'Jane Doe');
      assert.strictEqual(result.role, '');
      assert.strictEqual(result.thumb, '');
      assert.strictEqual(result.tmdbProfile, '');
      assert.strictEqual(result.raw, null);
    });

    it('removes duplicate role text matching the name', () => {
      const result = normalizeLocalCast({ name: 'John Doe', role: 'John Doe', thumb: '/thumb.jpg' });
      assert.strictEqual(result.role, '');
    });

    it('returns null for invalid entries', () => {
      assert.strictEqual(normalizeLocalCast(null), null);
      assert.strictEqual(normalizeLocalCast(''), null);
    });
  });

  describe('normalizeTmdbCast', () => {
    it('extracts profile information', () => {
      const result = normalizeTmdbCast({ name: 'Agent Smith', character: 'Villain', profile_path: '/agent.jpg' });
      assert.deepStrictEqual(result, {
        name: 'Agent Smith',
        role: 'Villain',
        thumb: '',
        tmdbProfile: '/agent.jpg',
        raw: { tmdb: { name: 'Agent Smith', character: 'Villain', profile_path: '/agent.jpg' } },
      });
    });

    it('returns null for missing names', () => {
      assert.strictEqual(normalizeTmdbCast({}), null);
    });
  });

  describe('buildCastList', () => {
    it('deduplicates entries by name (case insensitive)', () => {
      const item = { cast: [{ name: 'Jane Doe' }, { name: 'jane doe', role: 'Duplicate' }] };
      const result = buildCastList(item);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, 'Jane Doe');
    });

    it('merges TMDB cast when not present locally', () => {
      const item = {
        cast: [{ name: 'Local Star', role: 'Lead' }],
        tmdbDetail: { credits: { cast: [{ name: 'TMDB Star', character: 'Support', profile_path: '/tmdb.jpg' }] } },
      };
      const result = buildCastList(item);
      assert.strictEqual(result.length, 2);
      const tmdbEntry = result.find(entry => entry.name === 'TMDB Star');
      assert.ok(tmdbEntry);
      assert.strictEqual(tmdbEntry.role, 'Support');
      assert.strictEqual(tmdbEntry.tmdbProfile, '/tmdb.jpg');
    });

    it('handles empty payloads gracefully', () => {
      assert.deepStrictEqual(buildCastList({}), []);
      assert.deepStrictEqual(buildCastList(null), []);
    });
  });
});
