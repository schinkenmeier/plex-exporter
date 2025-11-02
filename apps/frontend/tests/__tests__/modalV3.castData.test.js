import { describe, it } from 'node:test';
import assert from 'node:assert';

import { buildCastList, normalizeLocalCast } from '../../src/features/modal/modalV3/castData.js';

describe('modalV3/castData', () => {
  describe('normalizeLocalCast', () => {
    it('normalizes string entries', () => {
      const result = normalizeLocalCast('Jane Doe');
      assert.strictEqual(result.name, 'Jane Doe');
      assert.strictEqual(result.role, '');
      assert.strictEqual(result.thumb, '');
      assert.strictEqual(result.raw, null);
      assert.strictEqual(result.source, 'local');
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

  describe('buildCastList', () => {
    it('deduplicates entries by name (case insensitive)', () => {
      const item = { cast: [{ name: 'Jane Doe' }, { name: 'jane doe', role: 'Duplicate' }] };
      const result = buildCastList(item);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, 'Jane Doe');
    });

    it('handles empty payloads gracefully', () => {
      assert.deepStrictEqual(buildCastList({}), []);
      assert.deepStrictEqual(buildCastList(null), []);
    });

    it('ignores unknown external cast entries', () => {
      const item = {
        cast: [{ name: 'Local Star', role: 'Lead', thumb: '/thumb.jpg' }],
        externalCredits: [{ name: 'Remote Star', character: 'Support' }],
      };
      const result = buildCastList(item);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, 'Local Star');
      assert.strictEqual(result[0].source, 'local');
    });
  });
});
