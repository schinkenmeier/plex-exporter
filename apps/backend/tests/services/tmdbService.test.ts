import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';

import { createTmdbService } from '../../src/services/tmdbService.js';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
  isAxiosError: vi.fn(() => false),
}));

const mockedAxios = vi.mocked(axios);

describe('TmdbService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps TMDB languages and selects the best YouTube trailer', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        id: 42,
        title: 'Trailer Movie',
        original_title: 'Trailer Movie Original',
        overview: 'Overview',
        tagline: 'Tagline',
        release_date: '2024-01-01',
        runtime: 120,
        vote_average: 8.2,
        vote_count: 1234,
        original_language: 'de',
        genres: [{ name: 'Drama' }],
        spoken_languages: [
          { iso_639_1: 'de', english_name: 'German' },
          { iso_639_1: 'en', english_name: 'English' },
        ],
        images: {
          backdrops: [{ file_path: '/backdrop.jpg', vote_average: 7 }],
          posters: [],
        },
        poster_path: '/poster.jpg',
        release_dates: { results: [] },
        videos: {
          results: [
            {
              key: 'teaser',
              site: 'YouTube',
              type: 'Teaser',
              official: true,
              iso_639_1: 'en',
              size: 1080,
              name: 'English Teaser',
            },
            {
              key: 'official-de',
              site: 'YouTube',
              type: 'Trailer',
              official: true,
              iso_639_1: 'de',
              size: 720,
              name: 'Deutscher Trailer',
            },
          ],
        },
      },
    });

    const service = createTmdbService({ accessToken: 'token' });
    const details = await service.fetchDetails('movie', 42, { language: 'de-DE' });

    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/movie/42'),
      expect.objectContaining({
        params: expect.objectContaining({
          append_to_response: 'images,release_dates,content_ratings,videos',
          language: 'de-DE',
        }),
      }),
    );
    expect(details).toMatchObject({
      languages: ['German', 'English'],
      originalLanguage: 'de',
      trailerYoutubeId: 'official-de',
      trailerSite: 'YouTube',
      trailerName: 'Deutscher Trailer',
      trailerUrl: 'https://www.youtube-nocookie.com/embed/official-de',
    });
  });
});
