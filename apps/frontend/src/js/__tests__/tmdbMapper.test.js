/**
 * Unit tests for tmdbMapper.js
 * Tests ID validation, image selection, and data mapping
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  pickBestImage,
  mapMovieDetail,
  mapTvDetail,
  mapSeasonDetail,
  mapCredits,
  getContentRatingDE,
} from '../tmdbMapper.js';

describe('tmdbMapper', () => {
  describe('pickBestImage', () => {
    it('should prefer language-specific images (de > en > any)', () => {
      const images = [
        { file_path: '/any.jpg', iso_639_1: 'xx', vote_count: 100, vote_average: 8 },
        { file_path: '/en.jpg', iso_639_1: 'en', vote_count: 50, vote_average: 7 },
        { file_path: '/de.jpg', iso_639_1: 'de', vote_count: 10, vote_average: 6 },
      ];

      const result = pickBestImage(images, { preferredLanguages: ['de', 'en', 'any'] });
      assert.strictEqual(result, '/de.jpg');
    });

    it('should score by vote_average and vote_count', () => {
      const images = [
        { file_path: '/low.jpg', iso_639_1: 'en', vote_count: 10, vote_average: 5 },
        { file_path: '/high.jpg', iso_639_1: 'en', vote_count: 100, vote_average: 8 },
        { file_path: '/medium.jpg', iso_639_1: 'en', vote_count: 50, vote_average: 7 },
      ];

      const result = pickBestImage(images, { preferredLanguages: ['en'] });
      // Score = (rating * 10) + votes: 8*10 + 100 = 180 (highest)
      assert.strictEqual(result, '/high.jpg');
    });

    it('should fallback to first image if no language match', () => {
      const images = [
        { file_path: '/first.jpg', iso_639_1: 'fr', vote_count: 10, vote_average: 7 },
        { file_path: '/second.jpg', iso_639_1: 'es', vote_count: 20, vote_average: 8 },
      ];

      const result = pickBestImage(images, { preferredLanguages: ['de', 'en'] });
      // Should fall back to highest-scored image
      assert.ok(result === '/second.jpg'); // 8*10+20 = 100 > 7*10+10 = 80
    });

    it('should handle empty array', () => {
      const result = pickBestImage([], { fallbackPath: '/default.jpg' });
      assert.strictEqual(result, '/default.jpg');
    });

    it('should return fallbackPath when no valid images', () => {
      const images = [
        { iso_639_1: 'en' }, // missing file_path
        { file_path: null }, // null file_path
      ];

      const result = pickBestImage(images, { fallbackPath: '/fallback.jpg' });
      assert.strictEqual(result, '/fallback.jpg');
    });

    it('should normalize language codes', () => {
      const images = [
        { file_path: '/null-lang.jpg', iso_639_1: 'null', vote_count: 10, vote_average: 7 },
        { file_path: '/xx-lang.jpg', iso_639_1: 'xx', vote_count: 10, vote_average: 7 },
        { file_path: '/any.jpg', iso_639_1: '', vote_count: 10, vote_average: 7 },
      ];

      // All should be treated as 'any'
      const result = pickBestImage(images, { preferredLanguages: ['any'] });
      assert.ok(result.includes('.jpg'));
    });
  });

  describe('normaliseId (via mapMovieDetail)', () => {
    it('should accept valid numeric strings', () => {
      const detail = { id: '12345', title: 'Test' };
      const result = mapMovieDetail(detail);
      assert.strictEqual(result.id, '12345');
    });

    it('should accept positive numbers', () => {
      const detail = { id: 42, title: 'Test' };
      const result = mapMovieDetail(detail);
      assert.strictEqual(result.id, '42');
    });

    it('should floor decimal numbers', () => {
      const detail = { id: 42.9, title: 'Test' };
      const result = mapMovieDetail(detail);
      assert.strictEqual(result.id, '42');
    });

    it('should reject negative numbers', () => {
      const detail = { id: -123, title: 'Test' };
      const result = mapMovieDetail(detail);
      assert.strictEqual(result.id, '');
    });

    it('should reject non-numeric strings', () => {
      const detail = { id: 'not-a-number', title: 'Test' };
      const result = mapMovieDetail(detail);
      assert.strictEqual(result.id, '');
    });

    it('should reject strings with special characters', () => {
      const detail = { id: '123abc', title: 'Test' };
      const result = mapMovieDetail(detail);
      assert.strictEqual(result.id, '');
    });

    it('should return empty string for null/undefined', () => {
      const detail1 = { id: null, title: 'Test' };
      const detail2 = { id: undefined, title: 'Test' };

      assert.strictEqual(mapMovieDetail(detail1).id, '');
      assert.strictEqual(mapMovieDetail(detail2).id, '');
    });
  });

  describe('mapMovieDetail', () => {
    it('should map all core fields', () => {
      const detail = {
        id: 550,
        title: 'Fight Club',
        original_title: 'Fight Club',
        overview: 'An insomniac office worker...',
        tagline: 'Mischief. Mayhem. Soap.',
        release_date: '1999-10-15',
        runtime: 139,
        status: 'Released',
        homepage: 'https://example.com',
        imdb_id: 'tt0137523',
        vote_average: 8.4,
        vote_count: 25000,
        popularity: 65.4,
      };

      const result = mapMovieDetail(detail);

      assert.strictEqual(result.type, 'movie');
      assert.strictEqual(result.id, '550');
      assert.strictEqual(result.title, 'Fight Club');
      assert.strictEqual(result.originalTitle, 'Fight Club');
      assert.strictEqual(result.overview, 'An insomniac office worker...');
      assert.strictEqual(result.tagline, 'Mischief. Mayhem. Soap.');
      assert.strictEqual(result.releaseDate, '1999-10-15');
      assert.strictEqual(result.runtime, 139);
      assert.strictEqual(result.status, 'Released');
      assert.strictEqual(result.homepage, 'https://example.com');
      assert.strictEqual(result.imdbId, 'tt0137523');
      assert.strictEqual(result.voteAverage, 8.4);
      assert.strictEqual(result.voteCount, 25000);
      assert.strictEqual(result.url, 'https://www.themoviedb.org/movie/550');
    });

    it('should extract collection data', () => {
      const detail = {
        id: 1,
        title: 'Test',
        belongs_to_collection: {
          id: 10,
          name: 'Test Collection',
          poster_path: '/poster.jpg',
          backdrop_path: '/backdrop.jpg',
        },
      };

      const result = mapMovieDetail(detail);

      assert.ok(result.collection);
      assert.strictEqual(result.collection.id, '10');
      assert.strictEqual(result.collection.name, 'Test Collection');
      assert.ok(result.collection.poster.includes('/poster.jpg'));
      assert.ok(result.collection.backdrop.includes('/backdrop.jpg'));
    });

    it('should handle missing optional fields', () => {
      const detail = {
        id: 1,
        title: 'Minimal Movie',
      };

      const result = mapMovieDetail(detail);

      assert.strictEqual(result.tagline, '');
      assert.strictEqual(result.overview, '');
      assert.strictEqual(result.runtime, null);
      assert.strictEqual(result.homepage, '');
      assert.strictEqual(result.imdbId, '');
      assert.strictEqual(result.collection, null);
    });

    it('should prefer localized backdrop from images', () => {
      const detail = {
        id: 1,
        title: 'Test',
        backdrop_path: '/fallback.jpg',
        images: {
          backdrops: [
            { file_path: '/de-backdrop.jpg', iso_639_1: 'de', vote_count: 10, vote_average: 8 },
            { file_path: '/en-backdrop.jpg', iso_639_1: 'en', vote_count: 5, vote_average: 7 },
          ],
        },
      };

      const result = mapMovieDetail(detail);

      assert.ok(result.backdrop.includes('/de-backdrop.jpg'));
      assert.strictEqual(result.backdropPath, '/de-backdrop.jpg');
    });

    it('should map genres array', () => {
      const detail = {
        id: 1,
        title: 'Test',
        genres: [
          { name: 'Action' },
          { name: 'Thriller' },
        ],
      };

      const result = mapMovieDetail(detail);

      assert.deepStrictEqual(result.genres, ['Action', 'Thriller']);
    });
  });

  describe('mapTvDetail', () => {
    it('should map TV-specific fields', () => {
      const detail = {
        id: 1399,
        name: 'Game of Thrones',
        original_name: 'Game of Thrones',
        first_air_date: '2011-04-17',
        last_air_date: '2019-05-19',
        number_of_episodes: 73,
        number_of_seasons: 8,
        status: 'Ended',
        in_production: false,
      };

      const result = mapTvDetail(detail);

      assert.strictEqual(result.type, 'tv');
      assert.strictEqual(result.id, '1399');
      assert.strictEqual(result.name, 'Game of Thrones');
      assert.strictEqual(result.originalName, 'Game of Thrones');
      assert.strictEqual(result.firstAirDate, '2011-04-17');
      assert.strictEqual(result.lastAirDate, '2019-05-19');
      assert.strictEqual(result.numberOfEpisodes, 73);
      assert.strictEqual(result.numberOfSeasons, 8);
      assert.strictEqual(result.status, 'Ended');
      assert.strictEqual(result.inProduction, false);
    });

    it('should map seasons array', () => {
      const detail = {
        id: 1,
        name: 'Test Show',
        seasons: [
          { id: 10, name: 'Season 1', season_number: 1, episode_count: 10, air_date: '2020-01-01', poster_path: '/s1.jpg' },
          { id: 11, name: 'Season 2', season_number: 2, episode_count: 12, air_date: '2021-01-01', poster_path: '/s2.jpg' },
        ],
      };

      const result = mapTvDetail(detail);

      assert.strictEqual(result.seasons.length, 2);
      assert.strictEqual(result.seasons[0].id, '10');
      assert.strictEqual(result.seasons[0].name, 'Season 1');
      assert.strictEqual(result.seasons[0].seasonNumber, 1);
      assert.strictEqual(result.seasons[0].episodeCount, 10);
      assert.strictEqual(result.seasons[0].airDate, '2020-01-01');
      assert.ok(result.seasons[0].poster.includes('/s1.jpg'));
    });

    it('should extract createdBy', () => {
      const detail = {
        id: 1,
        name: 'Test Show',
        created_by: [
          { id: 100, name: 'Creator Name', profile_path: '/profile.jpg' },
        ],
      };

      const result = mapTvDetail(detail);

      assert.strictEqual(result.createdBy.length, 1);
      assert.strictEqual(result.createdBy[0].id, '100');
      assert.strictEqual(result.createdBy[0].name, 'Creator Name');
      assert.ok(result.createdBy[0].profile.includes('/profile.jpg'));
      assert.ok(result.createdBy[0].initials); // Should have initials
    });

    it('should handle aggregate_credits fallback', () => {
      const detail = {
        id: 1,
        name: 'Test Show',
        aggregate_credits: {
          cast: [{ id: 1, name: 'Actor 1', roles: [{ character: 'Character A' }] }],
          crew: [{ id: 2, name: 'Director 1', jobs: [{ job: 'Director' }] }],
        },
      };

      const result = mapTvDetail(detail);

      assert.ok(result.credits.cast.length > 0);
      assert.strictEqual(result.credits.cast[0].name, 'Actor 1');
      assert.strictEqual(result.credits.cast[0].character, 'Character A');
      assert.strictEqual(result.credits.crew[0].job, 'Director');
    });

    it('should prefer credits over aggregate_credits', () => {
      const detail = {
        id: 1,
        name: 'Test Show',
        credits: {
          cast: [{ id: 1, name: 'Direct Cast' }],
        },
        aggregate_credits: {
          cast: [{ id: 2, name: 'Aggregate Cast' }],
        },
      };

      const result = mapTvDetail(detail);

      // Should use aggregate_credits as it's the fallback path
      assert.strictEqual(result.credits.cast[0].name, 'Direct Cast');
    });
  });

  describe('mapSeasonDetail', () => {
    it('should map episodes with stills', () => {
      const seasonDetail = {
        id: 10,
        name: 'Season 1',
        season_number: 1,
        episodes: [
          {
            id: 101,
            episode_number: 1,
            season_number: 1,
            name: 'Pilot',
            overview: 'The beginning...',
            air_date: '2020-01-01',
            runtime: 45,
            vote_average: 8.5,
            vote_count: 100,
            still_path: '/still.jpg',
          },
        ],
      };

      const result = mapSeasonDetail(seasonDetail);

      assert.strictEqual(result.type, 'season');
      assert.strictEqual(result.episodes.length, 1);
      assert.strictEqual(result.episodes[0].id, '101');
      assert.strictEqual(result.episodes[0].episodeNumber, 1);
      assert.strictEqual(result.episodes[0].seasonNumber, 1);
      assert.strictEqual(result.episodes[0].name, 'Pilot');
      assert.strictEqual(result.episodes[0].overview, 'The beginning...');
      assert.strictEqual(result.episodes[0].runtime, 45);
      assert.ok(result.episodes[0].still.includes('/still.jpg'));
    });

    it('should handle missing parent show', () => {
      const seasonDetail = {
        id: 10,
        name: 'Season 1',
        season_number: 1,
        episodes: [],
      };

      const result = mapSeasonDetail(seasonDetail, { show: null });

      assert.strictEqual(result.type, 'season');
      assert.strictEqual(result.showId, '');
      assert.strictEqual(result.url, ''); // No show ID, no URL
    });

    it('should use show data for URLs', () => {
      const seasonDetail = {
        id: 10,
        name: 'Season 1',
        season_number: 1,
        episodes: [],
      };

      const show = { id: 1399, name: 'Game of Thrones' };

      const result = mapSeasonDetail(seasonDetail, { show });

      assert.strictEqual(result.showId, '1399');
      assert.strictEqual(result.url, 'https://www.themoviedb.org/tv/1399/season/1');
    });

    it('should combine crew and guest stars', () => {
      const seasonDetail = {
        id: 10,
        name: 'Season 1',
        season_number: 1,
        episodes: [
          {
            id: 101,
            episode_number: 1,
            name: 'Pilot',
            crew: [{ id: 1, name: 'Director', job: 'Director' }],
            guest_stars: [{ id: 2, name: 'Guest Actor', character: 'Guest Character' }],
          },
        ],
      };

      const result = mapSeasonDetail(seasonDetail);

      assert.ok(result.episodes[0].crew.length > 0);
      assert.ok(result.episodes[0].guestStars.length > 0);
      assert.strictEqual(result.episodes[0].crew[0].name, 'Director');
      assert.strictEqual(result.episodes[0].guestStars[0].name, 'Guest Actor');
    });
  });

  describe('mapCredits', () => {
    it('should map cast with character', () => {
      const rawCredits = {
        cast: [
          { id: 1, name: 'Actor One', character: 'Character A', order: 0, profile_path: '/actor.jpg' },
          { id: 2, name: 'Actor Two', character: 'Character B', order: 1 },
        ],
      };

      const result = mapCredits(rawCredits);

      assert.strictEqual(result.cast.length, 2);
      assert.strictEqual(result.cast[0].id, '1');
      assert.strictEqual(result.cast[0].name, 'Actor One');
      assert.strictEqual(result.cast[0].character, 'Character A');
      assert.strictEqual(result.cast[0].order, 0);
      assert.ok(result.cast[0].profile.includes('/actor.jpg'));
      assert.ok(result.cast[0].initials); // Should have initials
    });

    it('should limit cast by castLimit', () => {
      const rawCredits = {
        cast: new Array(50).fill(null).map((_, i) => ({ id: i, name: `Actor ${i}`, character: 'Role' })),
      };

      const result = mapCredits(rawCredits, { castLimit: 10 });

      assert.strictEqual(result.cast.length, 10);
    });

    it('should map crew with job', () => {
      const rawCredits = {
        crew: [
          { id: 100, name: 'Director Name', job: 'Director', department: 'Directing' },
          { id: 101, name: 'Writer Name', job: 'Screenplay', department: 'Writing' },
        ],
      };

      const result = mapCredits(rawCredits);

      assert.strictEqual(result.crew.length, 2);
      assert.strictEqual(result.crew[0].name, 'Director Name');
      assert.strictEqual(result.crew[0].job, 'Director');
      assert.strictEqual(result.crew[0].department, 'Directing');
    });

    it('should handle aggregate credits structure', () => {
      const rawCredits = {
        aggregate: {
          cast: [
            { id: 1, name: 'Series Regular', roles: [{ character: 'Main Character' }] },
          ],
          crew: [
            { id: 2, name: 'Series Director', jobs: [{ job: 'Director' }] },
          ],
        },
      };

      const result = mapCredits(rawCredits);

      assert.ok(result.cast.length > 0);
      assert.strictEqual(result.cast[0].character, 'Main Character');
      assert.strictEqual(result.crew[0].job, 'Director');
    });

    it('should handle empty credits', () => {
      const result = mapCredits(null);

      assert.deepStrictEqual(result, { cast: [], crew: [] });
    });
  });

  describe('getContentRatingDE', () => {
    it('should extract DE rating from content_ratings', () => {
      const payload = {
        content_ratings: {
          results: [
            { iso_3166_1: 'US', rating: 'TV-MA' },
            { iso_3166_1: 'DE', rating: 'FSK 16' },
          ],
        },
      };

      const result = getContentRatingDE(payload);
      assert.strictEqual(result, 'FSK 16');
    });

    it('should fallback to US rating if DE missing', () => {
      const payload = {
        content_ratings: {
          results: [
            { iso_3166_1: 'US', rating: 'TV-14' },
            { iso_3166_1: 'GB', rating: 'PG' },
          ],
        },
      };

      const result = getContentRatingDE(payload);
      assert.strictEqual(result, 'TV-14');
    });

    it('should extract certification from release_dates', () => {
      const payload = {
        release_dates: {
          results: [
            { iso_3166_1: 'DE', release_dates: [{ certification: 'FSK 12', type: 3 }] },
          ],
        },
      };

      const result = getContentRatingDE(payload);
      assert.strictEqual(result, 'FSK 12');
    });

    it('should return empty string if no rating found', () => {
      const payload = {};
      const result = getContentRatingDE(payload);
      assert.strictEqual(result, '');
    });
  });
});
