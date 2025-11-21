import axios, { isAxiosError } from 'axios';

import logger from './logger.js';

const API_BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';
const DEFAULT_CACHE_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const DEFAULT_MAX_CACHE_ENTRIES = 200;
const MAX_RATE_LIMIT_STRIKES = 5;

export interface TmdbRateLimitState {
  active: boolean;
  until: number;
  retryAfterMs: number;
  lastStatus: number | null;
  strikes: number;
}

export interface TmdbServiceOptions {
  accessToken: string;
  cacheTtlMs?: number;
  maxCacheEntries?: number;
}

export interface TmdbHeroDetails {
  id: number;
  type: 'movie' | 'tv';
  title: string;
  originalTitle: string;
  overview: string;
  tagline: string;
  releaseDate: string | null;
  firstAirDate: string | null;
  runtimeMinutes: number | null;
  voteAverage: number | null;
  voteCount: number | null;
  genres: string[];
  certification: string | null;
  backdrops: string[];
  poster: string | null;
  seasons?: Array<{
    id: number | null;
    seasonNumber: number | null;
    title: string;
    overview: string;
    airDate: string | null;
    episodeCount: number | null;
    poster: string | null;
  }>;
}

export interface FetchDetailsOptions {
  language?: string;
  signal?: AbortSignal;
}

export class TmdbRateLimitError extends Error {
  declare readonly name: 'TmdbRateLimitError';
  readonly code = 'RATE_LIMIT' as const;
  readonly retryAfterMs: number;
  readonly until: number;

  constructor(message: string, { retryAfterMs, until }: { retryAfterMs: number; until: number }) {
    super(message);
    this.name = 'TmdbRateLimitError';
    this.retryAfterMs = retryAfterMs;
    this.until = until;
  }
}

interface CacheEntry {
  expiresAt: number;
  data: TmdbHeroDetails;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const parseRetryAfter = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value * 1000));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return Math.max(0, Math.round(numeric * 1000));
    }
    const parsedDate = Date.parse(trimmed);
    if (Number.isFinite(parsedDate)) {
      return Math.max(0, parsedDate - Date.now());
    }
  }
  return 0;
};

const minutesFromDuration = (value: unknown): number | null => {
  if (value == null) return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  if (num > 1000) {
    return Math.max(1, Math.round(num / 60));
  }
  return Math.round(num);
};

const normalizeLanguage = (language: string | undefined): string => {
  if (!language) return 'en-US';
  const trimmed = language.trim();
  return trimmed || 'en-US';
};

const selectCertification = (payload: any, type: 'movie' | 'tv', language: string): string | null => {
  try {
    if (type === 'movie') {
      const releases = Array.isArray(payload?.release_dates?.results) ? payload.release_dates.results : [];
      const languageCountry = language.split('-')[1]?.toUpperCase();
      const preferredCountries = [languageCountry, 'US', 'GB', 'DE'].filter(Boolean) as string[];
      for (const country of preferredCountries) {
        const match = releases.find((entry: any) => entry?.iso_3166_1 === country);
        if (!match || !Array.isArray(match.release_dates)) continue;
        const rated = match.release_dates.find((entry: any) => typeof entry?.certification === 'string' && entry.certification.trim());
        if (rated) {
          return rated.certification.trim();
        }
      }
    } else {
      const ratings = Array.isArray(payload?.content_ratings?.results) ? payload.content_ratings.results : [];
      const languageCountry = language.split('-')[1]?.toUpperCase();
      const preferredCountries = [languageCountry, 'US', 'GB', 'DE'].filter(Boolean) as string[];
      for (const country of preferredCountries) {
        const match = ratings.find((entry: any) => entry?.iso_3166_1 === country && typeof entry?.rating === 'string' && entry.rating.trim());
        if (match) {
          return match.rating.trim();
        }
      }
    }
  } catch (error) {
    logger.warn('Failed to derive TMDB certification', {
      namespace: 'tmdb',
      error: error instanceof Error ? error.message : error,
    });
  }
  return null;
};

const collectGenres = (payload: any): string[] => {
  if (!Array.isArray(payload?.genres)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of payload.genres) {
    const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
    if (!name) continue;
    const lower = name.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    result.push(name);
  }
  return result;
};

const buildImageUrl = (path: string, size: string): string | null => {
  if (typeof path !== 'string' || !path.trim()) return null;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${IMAGE_BASE_URL}/${size}${normalized}`;
};

const collectBackdrops = (payload: any): string[] => {
  const images = Array.isArray(payload?.images?.backdrops) ? payload.images.backdrops : [];
  const sorted = images
    .filter((entry: any) => typeof entry?.file_path === 'string' && entry.file_path)
    .sort((a: any, b: any) => (Number(b?.vote_average) || 0) - (Number(a?.vote_average) || 0));
  const urls: string[] = [];
  for (const entry of sorted) {
    const url = buildImageUrl(entry.file_path, 'original');
    if (url) urls.push(url);
    if (urls.length >= 6) break;
  }
  return urls;
};

const collectSeasons = (payload: any): Array<{
  id: number | null;
  seasonNumber: number | null;
  title: string;
  overview: string;
  airDate: string | null;
  episodeCount: number | null;
  poster: string | null;
}> => {
  const seasons = Array.isArray(payload?.seasons) ? payload.seasons : [];
  return seasons.map((season: any) => {
    const posterPath = typeof season?.poster_path === 'string' ? season.poster_path : null;
    return {
      id: typeof season?.id === 'number' ? season.id : null,
      seasonNumber: Number.isFinite(season?.season_number) ? Number(season.season_number) : null,
      title: typeof season?.name === 'string' ? season.name : '',
      overview: typeof season?.overview === 'string' ? season.overview : '',
      airDate: typeof season?.air_date === 'string' ? season.air_date : null,
      episodeCount: Number.isFinite(season?.episode_count) ? Number(season.episode_count) : null,
      poster: buildImageUrl(posterPath, 'w342'),
    };
  });
};

const resolvePoster = (payload: any): string | null => {
  const posterPath = typeof payload?.poster_path === 'string' ? payload.poster_path : null;
  if (!posterPath) {
    const posters = Array.isArray(payload?.images?.posters) ? payload.images.posters : [];
    const best = posters.find((entry: any) => typeof entry?.file_path === 'string' && entry.file_path);
    if (best) {
      return buildImageUrl(best.file_path, 'w780');
    }
    return null;
  }
  return buildImageUrl(posterPath, 'w780');
};

const mapDetails = (
  payload: any,
  type: 'movie' | 'tv',
  language: string,
  cacheTtlMs: number,
): TmdbHeroDetails | null => {
  if (!payload || typeof payload !== 'object') return null;
  const titleCandidates = type === 'tv' ? [payload.name, payload.original_name] : [payload.title, payload.original_title];
  const overview = typeof payload.overview === 'string' ? payload.overview.trim() : '';
  const tagline = typeof payload.tagline === 'string' ? payload.tagline.trim() : '';
  const title = titleCandidates.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).find(Boolean) || '';
  const runtimeMinutes =
    type === 'movie'
      ? minutesFromDuration(payload.runtime)
      : minutesFromDuration(Array.isArray(payload.episode_run_time) ? payload.episode_run_time[0] : null);
  const details: TmdbHeroDetails = {
    id: Number(payload.id) || 0,
    type,
    title,
    originalTitle: typeof titleCandidates[1] === 'string' ? titleCandidates[1]?.trim() || title : title,
    overview,
    tagline,
    releaseDate: type === 'movie' ? (typeof payload.release_date === 'string' ? payload.release_date : null) : null,
    firstAirDate: type === 'tv' ? (typeof payload.first_air_date === 'string' ? payload.first_air_date : null) : null,
    runtimeMinutes: runtimeMinutes ?? null,
    voteAverage: Number.isFinite(payload.vote_average) ? Number(payload.vote_average) : null,
    voteCount: Number.isFinite(payload.vote_count) ? Number(payload.vote_count) : null,
    genres: collectGenres(payload),
    certification: selectCertification(payload, type, language),
    backdrops: collectBackdrops(payload),
    poster: resolvePoster(payload),
    seasons: type === 'tv' ? collectSeasons(payload) : undefined,
  };
  return details;
};

const pruneCache = (cache: Map<string, CacheEntry>, maxEntries: number) => {
  if (cache.size <= maxEntries) return;
  const entries = Array.from(cache.entries()).sort((a, b) => a[1].expiresAt - b[1].expiresAt);
  const excess = cache.size - maxEntries;
  for (let index = 0; index < excess; index += 1) {
    const [key] = entries[index] || [];
    if (key) cache.delete(key);
  }
};

export interface TmdbSearchResult {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  original_title?: string;
}

export interface TmdbService {
  isEnabled(): boolean;
  fetchDetails(type: 'movie' | 'tv', id: string | number, options?: FetchDetailsOptions): Promise<TmdbHeroDetails | null>;
  getRateLimitState(): TmdbRateLimitState;
  fetchDetailsByImdb(type: 'movie' | 'tv', imdbId: string | number, options?: FetchDetailsOptions): Promise<TmdbHeroDetails | null>;
  getPosterUrl(path: string | null | undefined, size?: string): string | null;
  searchMovie(query: string, options?: { year?: number | null; language?: string }): Promise<TmdbSearchResult[]>;
  searchTv(query: string, options?: { year?: number | null; language?: string }): Promise<TmdbSearchResult[]>;
  fetchSeasonEpisodes(tvId: string | number, seasonNumber: string | number, options?: FetchDetailsOptions): Promise<Array<{ episodeNumber: number; stillPath: string | null }>>;
}

export const createTmdbService = ({ accessToken, cacheTtlMs, maxCacheEntries }: TmdbServiceOptions): TmdbService => {
  const token = accessToken.trim();
  const cache = new Map<string, CacheEntry>();
  const ttl = cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const maxEntries = clamp(maxCacheEntries ?? DEFAULT_MAX_CACHE_ENTRIES, 1, 1000);

  let enabled = Boolean(token);
  let rateLimit: TmdbRateLimitState = {
    active: false,
    until: 0,
    retryAfterMs: 0,
    lastStatus: null,
    strikes: 0,
  };

  const getRateLimitState = () => ({ ...rateLimit });

  const registerRateLimit = (status: number, retryAfterMs: number) => {
    const now = Date.now();
    const delay = Math.max(retryAfterMs, 1000);
    const strikes = clamp(rateLimit.strikes + 1, 1, MAX_RATE_LIMIT_STRIKES);
    const until = now + delay * strikes;
    rateLimit = {
      active: true,
      retryAfterMs: delay * strikes,
      until,
      lastStatus: status,
      strikes,
    };
    logger.warn('TMDB rate limit hit', {
      namespace: 'tmdb',
      retryAfterMs: rateLimit.retryAfterMs,
      until,
      strikes,
    });
  };

  const relaxRateLimit = () => {
    if (!rateLimit.active) {
      if (rateLimit.strikes > 0) {
        rateLimit = { ...rateLimit, strikes: Math.max(0, rateLimit.strikes - 1) };
      }
      return;
    }
    if (Date.now() >= rateLimit.until) {
      rateLimit = { active: false, retryAfterMs: 0, until: 0, lastStatus: null, strikes: Math.max(0, rateLimit.strikes - 1) };
    }
  };

  const fetchDetails = async (
    type: 'movie' | 'tv',
    id: string | number,
    options: FetchDetailsOptions = {},
  ): Promise<TmdbHeroDetails | null> => {
    if (!enabled) return null;
    const normalizedType = type === 'tv' ? 'tv' : 'movie';
    const identifier = String(id ?? '').trim();
    if (!identifier) return null;
    const language = normalizeLanguage(options.language);
    const cacheKey = `${normalizedType}:${identifier}:${language}`;
    const now = Date.now();

    relaxRateLimit();
    if (rateLimit.active && rateLimit.until > now) {
      throw new TmdbRateLimitError('TMDB rate limit active', {
        retryAfterMs: rateLimit.retryAfterMs,
        until: rateLimit.until,
      });
    }

    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    try {
      const response = await axios.get(`${API_BASE_URL}/${normalizedType}/${identifier}`, {
        params: {
          append_to_response: 'images,release_dates,content_ratings',
          language,
        },
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json;charset=utf-8',
        },
        signal: options.signal,
      });

      const details = mapDetails(response.data, normalizedType, language, ttl);
      if (!details) {
        return null;
      }

      cache.set(cacheKey, { data: details, expiresAt: now + ttl });
      pruneCache(cache, maxEntries);
      rateLimit = { ...rateLimit, active: false, retryAfterMs: 0, until: 0, lastStatus: null };
      return details;
    } catch (error) {
      if (isAxiosError(error)) {
        const status = error.response?.status ?? null;
        if (status === 401 || status === 403) {
          enabled = false;
          logger.error('TMDB token rejected', {
            namespace: 'tmdb',
            status,
          });
          return null;
        }
        if (status === 429) {
          const retryAfterHeader = error.response?.headers?.['retry-after'];
          const retryAfterMs = parseRetryAfter(retryAfterHeader);
          registerRateLimit(status, retryAfterMs);
          throw new TmdbRateLimitError('TMDB rate limit exceeded', {
            retryAfterMs: rateLimit.retryAfterMs,
            until: rateLimit.until,
          });
        }
        logger.warn('TMDB request failed', {
          namespace: 'tmdb',
          status,
          message: error.message,
        });
      } else {
        logger.warn('TMDB request failed', {
          namespace: 'tmdb',
          error: error instanceof Error ? error.message : error,
        });
      }
      throw error;
    }
  };

  const fetchDetailsByImdb = async (
    type: 'movie' | 'tv',
    imdbId: string | number,
    options: FetchDetailsOptions = {},
  ): Promise<TmdbHeroDetails | null> => {
    if (!enabled) return null;
    const normalized = String(imdbId ?? '').trim();
    if (!normalized) return null;
    const language = normalizeLanguage(options.language);

    relaxRateLimit();
    if (rateLimit.active && rateLimit.until > Date.now()) {
      throw new TmdbRateLimitError('TMDB rate limit active', {
        retryAfterMs: rateLimit.retryAfterMs,
        until: rateLimit.until,
      });
    }

    try {
      const response = await axios.get(`${API_BASE_URL}/find/${normalized}`, {
        params: {
          external_source: 'imdb_id',
          language,
        },
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json;charset=utf-8',
        },
        signal: options.signal,
      });

      const results = Array.isArray(
        type === 'tv' ? response.data?.tv_results : response.data?.movie_results,
      )
        ? (type === 'tv' ? response.data.tv_results : response.data.movie_results)
        : [];
      const first = results.find((entry: any) => entry && entry.id != null);
      const resolvedId = first?.id;
      if (!resolvedId) {
        return null;
      }

      const details = await fetchDetails(type, resolvedId, options);
      if (details) {
        rateLimit = { ...rateLimit, active: false, retryAfterMs: 0, until: 0, lastStatus: null };
      }
      return details;
    } catch (error) {
      if (isAxiosError(error)) {
        const status = error.response?.status ?? null;
        if (status === 401 || status === 403) {
          enabled = false;
          logger.error('TMDB token rejected', {
            namespace: 'tmdb',
            status,
          });
          return null;
        }
        if (status === 429) {
          const retryAfterHeader = error.response?.headers?.['retry-after'];
          const retryAfterMs = parseRetryAfter(retryAfterHeader);
          registerRateLimit(status, retryAfterMs);
          throw new TmdbRateLimitError('TMDB rate limit exceeded', {
            retryAfterMs: rateLimit.retryAfterMs,
            until: rateLimit.until,
          });
        }
        logger.warn('TMDB external ID lookup failed', {
          namespace: 'tmdb',
          status,
          message: error.message,
        });
      } else {
        logger.warn('TMDB external ID lookup failed', {
          namespace: 'tmdb',
          error: error instanceof Error ? error.message : error,
        });
      }
      throw error;
    }
  };

  const getPosterUrl = (path: string | null | undefined, size = 'w780'): string | null => {
    if (!path) return null;
    return buildImageUrl(path, size);
  };

  const searchMovie = async (
    query: string,
    options: { year?: number | null; language?: string } = {},
  ): Promise<TmdbSearchResult[]> => {
    if (!enabled) return [];
    const normalizedQuery = typeof query === 'string' ? query.trim() : '';
    if (!normalizedQuery) return [];
    const now = Date.now();
    const language = normalizeLanguage(options.language);
    const normalizedYear =
      options.year != null && Number.isFinite(options.year) ? Math.trunc(Number(options.year)) : undefined;

    relaxRateLimit();
    if (rateLimit.active && rateLimit.until > now) {
      throw new TmdbRateLimitError('TMDB rate limit active', {
        retryAfterMs: rateLimit.retryAfterMs,
        until: rateLimit.until,
      });
    }

    try {
      const response = await axios.get(`${API_BASE_URL}/search/movie`, {
        params: {
          query: normalizedQuery,
          language,
          include_adult: false,
          ...(normalizedYear ? { year: normalizedYear } : {}),
        },
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json;charset=utf-8',
        },
      });

      const results = Array.isArray(response.data?.results) ? response.data.results : [];
      rateLimit = { ...rateLimit, active: false, retryAfterMs: 0, until: 0, lastStatus: null };

      return results
        .filter((entry: any) => entry && entry.id != null)
        .map((entry: any): TmdbSearchResult => ({
          id: Number(entry.id),
          title: typeof entry.title === 'string' ? entry.title : undefined,
          name: typeof entry.name === 'string' ? entry.name : undefined,
          original_title: typeof entry.original_title === 'string' ? entry.original_title : undefined,
          release_date: typeof entry.release_date === 'string' ? entry.release_date : undefined,
          first_air_date: typeof entry.first_air_date === 'string' ? entry.first_air_date : undefined,
        }));
    } catch (error) {
      if (isAxiosError(error)) {
        const status = error.response?.status ?? null;
        if (status === 401 || status === 403) {
          enabled = false;
          logger.error('TMDB token rejected (search)', {
            namespace: 'tmdb',
            status,
          });
          return [];
        }
        if (status === 429) {
          const retryAfterHeader = error.response?.headers?.['retry-after'];
          const retryAfterMs = parseRetryAfter(retryAfterHeader);
          registerRateLimit(status, retryAfterMs);
          throw new TmdbRateLimitError('TMDB rate limit exceeded', {
            retryAfterMs: rateLimit.retryAfterMs,
            until: rateLimit.until,
          });
        }
        logger.warn('TMDB search request failed', {
          namespace: 'tmdb',
          status,
          message: error.message,
        });
      } else {
        logger.warn('TMDB search request failed', {
          namespace: 'tmdb',
          error: error instanceof Error ? error.message : error,
        });
      }
      throw error;
    }
  };

  const searchTv = async (
    query: string,
    options: { year?: number | null; language?: string } = {},
  ): Promise<TmdbSearchResult[]> => {
    if (!enabled) return [];
    const normalizedQuery = typeof query === 'string' ? query.trim() : '';
    if (!normalizedQuery) return [];
    const now = Date.now();
    const language = normalizeLanguage(options.language);
    const normalizedYear =
      options.year != null && Number.isFinite(options.year) ? Math.trunc(Number(options.year)) : undefined;

    relaxRateLimit();
    if (rateLimit.active && rateLimit.until > now) {
      throw new TmdbRateLimitError('TMDB rate limit active', {
        retryAfterMs: rateLimit.retryAfterMs,
        until: rateLimit.until,
      });
    }

    try {
      const response = await axios.get(`${API_BASE_URL}/search/tv`, {
        params: {
          query: normalizedQuery,
          language,
          include_adult: false,
          ...(normalizedYear ? { first_air_date_year: normalizedYear } : {}),
        },
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json;charset=utf-8',
        },
      });

      const results = Array.isArray(response.data?.results) ? response.data.results : [];
      rateLimit = { ...rateLimit, active: false, retryAfterMs: 0, until: 0, lastStatus: null };

      return results
        .filter((entry: any) => entry && entry.id != null)
        .map((entry: any): TmdbSearchResult => ({
          id: Number(entry.id),
          title: typeof entry.title === 'string' ? entry.title : undefined,
          name: typeof entry.name === 'string' ? entry.name : undefined,
          original_title: typeof entry.original_title === 'string' ? entry.original_title : undefined,
          release_date: typeof entry.release_date === 'string' ? entry.release_date : undefined,
          first_air_date: typeof entry.first_air_date === 'string' ? entry.first_air_date : undefined,
        }));
    } catch (error) {
      if (isAxiosError(error)) {
        const status = error.response?.status ?? null;
        if (status === 401 || status === 403) {
          enabled = false;
          logger.error('TMDB token rejected (search)', {
            namespace: 'tmdb',
            status,
          });
          return [];
        }
        if (status === 429) {
          const retryAfterHeader = error.response?.headers?.['retry-after'];
          const retryAfterMs = parseRetryAfter(retryAfterHeader);
          registerRateLimit(status, retryAfterMs);
          throw new TmdbRateLimitError('TMDB rate limit exceeded', {
            retryAfterMs: rateLimit.retryAfterMs,
            until: rateLimit.until,
          });
        }
        logger.warn('TMDB search request failed', {
          namespace: 'tmdb',
          status,
          message: error.message,
        });
      } else {
        logger.warn('TMDB search request failed', {
          namespace: 'tmdb',
          error: error instanceof Error ? error.message : error,
        });
      }
      throw error;
    }
  };

  const fetchSeasonEpisodes = async (
    tvId: string | number,
    seasonNumber: string | number,
    options: FetchDetailsOptions = {},
  ): Promise<Array<{ episodeNumber: number; stillPath: string | null }>> => {
    if (!enabled) return [];
    const id = String(tvId ?? '').trim();
    const season = String(seasonNumber ?? '').trim();
    if (!id || !season) return [];
    const language = normalizeLanguage(options.language);
    const cacheKey = `tv:season:${id}:${season}:${language}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      const data: any = (cached as any).data;
      if (Array.isArray(data?.episodes)) return data.episodes;
    }

    relaxRateLimit();
    if (rateLimit.active && rateLimit.until > Date.now()) {
      throw new TmdbRateLimitError('TMDB rate limit active', {
        retryAfterMs: rateLimit.retryAfterMs,
        until: rateLimit.until,
      });
    }

    try {
      const response = await axios.get(`${API_BASE_URL}/tv/${id}/season/${season}`, {
        params: { language },
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json;charset=utf-8',
        },
        signal: options.signal,
      });

      const episodes = Array.isArray(response.data?.episodes)
        ? response.data.episodes
            .map((ep: any) => ({
              episodeNumber: Number.isFinite(ep?.episode_number) ? Number(ep.episode_number) : null,
              stillPath: typeof ep?.still_path === 'string' ? buildImageUrl(ep.still_path, 'w780') : null,
            }))
            .filter((entry: any) => entry.episodeNumber !== null)
        : [];

      cache.set(cacheKey, { data: { episodes } as any, expiresAt: Date.now() + ttl });
      pruneCache(cache, maxEntries);
      rateLimit = { ...rateLimit, active: false, retryAfterMs: 0, until: 0, lastStatus: null };
      return episodes;
    } catch (error) {
      if (isAxiosError(error)) {
        const status = error.response?.status ?? null;
        if (status === 401 || status === 403) {
          enabled = false;
          logger.error('TMDB token rejected (season)', { namespace: 'tmdb', status });
          return [];
        }
        if (status === 429) {
          const retryAfterHeader = error.response?.headers?.['retry-after'];
          const retryAfterMs = parseRetryAfter(retryAfterHeader);
          registerRateLimit(status, retryAfterMs);
          throw new TmdbRateLimitError('TMDB rate limit exceeded', {
            retryAfterMs: rateLimit.retryAfterMs,
            until: rateLimit.until,
          });
        }
      }
      logger.warn('TMDB season request failed', {
        namespace: 'tmdb',
        error: error instanceof Error ? error.message : error,
      });
      return [];
    }
  };

  return {
    isEnabled: () => enabled,
    fetchDetails,
    getRateLimitState,
    fetchDetailsByImdb,
    getPosterUrl,
    searchMovie,
    searchTv,
    fetchSeasonEpisodes,
  };
};

export default createTmdbService;
