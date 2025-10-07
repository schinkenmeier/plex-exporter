import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { mapMovie, mapShow } from '../modal/shared.js';

describe('modal/shared id extraction', () => {
  it('extracts TMDB id from Plex guid entries', () => {
    const movie = {
      type: 'movie',
      guids: [
        { id: 'com.plexapp.agents.themoviedb://12345?lang=de' },
        { id: 'imdb://tt0123456' }
      ]
    };
    const mapped = mapMovie(movie);
    assert.ok(mapped !== movie, 'mapMovie should clone input');
    assert.strictEqual(mapped.type, 'movie');
    assert.ok(mapped.ids);
    assert.strictEqual(mapped.ids.tmdb, '12345');
    assert.strictEqual(mapped.ids.imdb, 'tt0123456');
    assert.strictEqual(mapped.tmdbId, '12345');
  });

  it('does not override existing explicit ids', () => {
    const movie = {
      type: 'movie',
      ids: { tmdb: '99999', imdb: 'tt0000001' },
      guids: ['tmdb://12345', 'imdb://tt7654321']
    };
    const mapped = mapMovie(movie);
    assert.strictEqual(mapped.ids.tmdb, '99999');
    assert.strictEqual(mapped.ids.imdb, 'tt0000001');
    assert.strictEqual(mapped.tmdbId, '99999');
  });

  it('extracts ids from plain guid string on shows', () => {
    const show = {
      type: 'tv',
      guid: 'com.plexapp.agents.theTVDB://31415?lang=en',
      guids: [{ id: 'imdb://tt2468101' }]
    };
    const mapped = mapShow(show);
    assert.strictEqual(mapped.ids.tvdb, '31415');
    assert.strictEqual(mapped.ids.imdb, 'tt2468101');
    assert.strictEqual(mapped.tmdbId, undefined);
  });
});
