import { describe, it } from 'node:test';
import assert from 'node:assert';

import { runtimeText, ratingText, studioText } from '../../src/features/modal/modalV3/formatting.js';

describe('modalV3/formatting', () => {
  describe('runtimeText', () => {
    it('formats runtime in minutes for movies', () => {
      assert.strictEqual(runtimeText({ runtimeMin: 123 }), '123 min');
    });

    it('uses approximate per-episode format for shows', () => {
      assert.strictEqual(runtimeText({ runtimeMin: 45, type: 'tv' }), '~45 min/Ep');
    });

    it('accepts alternative duration sources', () => {
      assert.strictEqual(runtimeText({ duration: 5400000 }), '90 min');
    });

    it('returns empty string when no duration is available', () => {
      assert.strictEqual(runtimeText({}), '');
    });
  });

  describe('ratingText', () => {
    it('formats rating with star prefix', () => {
      assert.strictEqual(ratingText({ rating: 7.25 }), '★ 7.3');
    });

    it('falls back to audience rating', () => {
      assert.strictEqual(ratingText({ audienceRating: 8.49 }), '★ 8.5');
    });

    it('returns empty string for invalid ratings', () => {
      assert.strictEqual(ratingText({ rating: null }), '');
    });
  });

  describe('studioText', () => {
    it('prefers explicit studio field', () => {
      assert.strictEqual(studioText({ studio: 'Warp Films' }), 'Warp Films');
    });

    it('falls back to network when no studio is set', () => {
      const item = { network: 'Channel 4' };
      assert.strictEqual(studioText(item), 'Channel 4');
    });

    it('uses studioName when provided', () => {
      const item = { studioName: 'Pinewood' };
      assert.strictEqual(studioText(item), 'Pinewood');
    });

    it('returns empty string if nothing is available', () => {
      assert.strictEqual(studioText({}), '');
    });
  });
});
