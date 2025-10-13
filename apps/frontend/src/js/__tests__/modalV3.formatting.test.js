import { describe, it } from 'node:test';
import assert from 'node:assert';

import { runtimeText, ratingText, studioText } from '../modalV3/formatting.js';

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

    it('uses TMDB production companies when local data missing', () => {
      const item = { tmdbDetail: { productionCompanies: [{ name: 'BBC' }] } };
      assert.strictEqual(studioText(item), 'BBC');
    });

    it('falls back to TMDB networks', () => {
      const item = { tmdbDetail: { networks: [{ name: 'Channel 4' }] } };
      assert.strictEqual(studioText(item), 'Channel 4');
    });

    it('returns empty string if nothing is available', () => {
      assert.strictEqual(studioText({}), '');
    });
  });
});
