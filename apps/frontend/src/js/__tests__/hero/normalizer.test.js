import { describe, it, beforeEach, afterEach } from 'node:test';
import { mock } from 'node:test';
import assert from 'node:assert/strict';

import movieFixture from './fixtures/tmdb-movie.json' assert { type: 'json' };
import tvFixture from './fixtures/tmdb-tv.json' assert { type: 'json' };

let tmdbModule;
let fetchMock;

beforeEach(async () => {
  tmdbModule = await import('../../hero/tmdbClient.js');
  fetchMock = mock.method(tmdbModule, 'fetchDetailsForItem', async (raw) => {
    if(raw && raw.type === 'tv'){
      return { data: tvFixture, resolvedId: String(tvFixture.id), fetchedAt: 123456789, source: 'fixture' };
    }
    return { data: movieFixture, resolvedId: String(movieFixture.id), fetchedAt: 123456789, source: 'fixture' };
  });
});

afterEach(() => {
  fetchMock?.mock.restore();
});

describe('hero normalizer TMDb integration', () => {
  it('normalises movie entries using TMDb metadata', async () => {
    const { normalizeItem } = await import(`../../hero/normalizer.js?${Date.now()}`);

    const raw = {
      ratingKey: 'movie-local-1',
      type: 'movie',
      ids: { tmdb: movieFixture.id },
      summary: 'Local summary should be superseded.',
      tagline: 'Local tagline fallback',
      genres: ['Local Genre'],
      duration: 5_400_000
    };

    const normalized = await normalizeItem(raw, { language: 'en-US' });

    assert.ok(normalized, 'expected a normalised hero entry');
    assert.equal(normalized.id, 'movie-321');
    assert.equal(normalized.type, 'movie');
    assert.equal(normalized.title, 'Fixture Movie');
    assert.equal(normalized.tagline, 'Only the bold fight fate.');
    assert.equal(normalized.overview, 'TMDb overview text for the fixture movie.');
    assert.equal(normalized.year, 2023);
    assert.equal(normalized.runtime, 125);
    assert.equal(normalized.rating, 7.5);
    assert.equal(normalized.voteCount, 3189);
    assert.deepEqual(normalized.genres, ['Action', 'Adventure']);
    assert.equal(normalized.certification, 'PG-13');
    assert.deepEqual(normalized.backdrops, ['https://image.tmdb.org/t/p/original/hero-fixture.jpg']);
    assert.equal(normalized.cta.id, '321');
    assert.equal(normalized.cta.kind, 'movie');
    assert.equal(normalized.cta.target, '#/movie/321');
    assert.equal(normalized.language, 'en-US');
    assert.deepEqual(normalized.ids, { ratingKey: 'movie-local-1', tmdb: '321', imdb: 'tt1234567' });
    assert.equal(normalized.tmdb.id, '321');
    assert.equal(normalized.tmdb.source, 'fixture');
    assert.equal(fetchMock.mock.calls.length, 1);
  });

  it('normalises tv series with TMDb runtime, counts and certification', async () => {
    const { normalizeItem } = await import(`../../hero/normalizer.js?${Date.now()}`);

    const raw = {
      ratingKey: 'series-local-1',
      type: 'tv',
      ids: { tmdb: tvFixture.id },
      tagline: 'Local series tagline',
      summary: 'Local series summary',
      seasons: [{ episodes: new Array(8) }]
    };

    const normalized = await normalizeItem(raw, { language: 'en-US' });

    assert.ok(normalized, 'expected a normalised hero entry for series');
    assert.equal(normalized.type, 'tv');
    assert.equal(normalized.title, 'Fixture Series');
    assert.equal(normalized.tagline, 'Local series tagline');
    assert.equal(normalized.overview, 'TMDb overview text for the fixture series.');
    assert.equal(normalized.year, 2019);
    assert.equal(normalized.runtime, 42);
    assert.equal(normalized.rating, 8.2);
    assert.equal(normalized.voteCount, 845);
    assert.equal(normalized.certification, 'TV-MA');
    assert.equal(normalized.seasons, 3);
    assert.equal(normalized.episodes, 26);
    assert.deepEqual(normalized.genres, ['Drama', 'Mystery']);
    assert.equal(normalized.cta.kind, 'show');
    assert.equal(normalized.cta.id, '987');
    assert.equal(normalized.cta.target, '#/show/987');
    assert.equal(normalized.language, 'en-US');
    assert.deepEqual(normalized.ids, { ratingKey: 'series-local-1', tmdb: '987' });
    assert.equal(fetchMock.mock.calls.length, 1);
  });
});
