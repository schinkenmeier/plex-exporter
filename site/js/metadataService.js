import { createCacheStore } from './cacheStore.js';
import { createTmdbClient } from './tmdbClient.js';
import {
  mapMovieDetail,
  mapTvDetail,
  mapSeasonDetail,
} from './tmdbMapper.js';

const LOG_PREFIX = '[metadataService]';
const DEFAULT_TTL_HOURS = 24;
const DEFAULT_IMAGE_BASE = 'https://image.tmdb.org/t/p';

function normaliseConfig(input = {}){
  return {
    apiKey: input.apiKey || input.tmdbApiKey || '',
    token: input.token || input.tmdbToken || '',
    language: input.language || input.lang || 'de-DE',
    region: input.region || input.iso || 'DE',
    imageBase: input.imageBase || DEFAULT_IMAGE_BASE,
    ttlHours: Number(input.ttlHours || input.ttl || DEFAULT_TTL_HOURS) || DEFAULT_TTL_HOURS,
  };
}

function createLogger(){
  return {
    warn(...args){
      try {
        console.warn(LOG_PREFIX, ...args);
      } catch (_err) {
        // ignore
      }
    },
  };
}

function ensureArray(value){
  if(!value) return [];
  if(Array.isArray(value)) return value;
  return String(value).split(',').map(part => part.trim()).filter(Boolean);
}

function combineAppend(base, extras){
  const values = new Set([...ensureArray(base), ...ensureArray(extras)]);
  if(!values.size) return '';
  return Array.from(values).join(',');
}

function createFetcher(client, cache, config, log){
  const defaultAppend = {
    movie: 'images,credits,release_dates',
    tv: 'images,content_ratings,aggregate_credits,credits',
    season: 'images,credits',
  };

  async function fetchWithCache(key, ttlHours, loader){
    try{
      const cached = cache.get(key);
      if(cached) return cached;
    }catch(err){
      log.warn('Cache read failed for', key, err?.message || err);
    }
    let data = null;
    try{
      data = await loader();
    }catch(err){
      log.warn('Request failed for', key, err?.message || err);
      throw err;
    }
    try{
      if(data != null) cache.set(key, data, ttlHours);
    }catch(err){
      log.warn('Cache write failed for', key, err?.message || err);
    }
    return data;
  }

  async function getMovieEnriched(id, options = {}){
    const movieId = id ?? options.id;
    if(movieId == null) return null;
    const cacheKey = `tmdb:movie:${movieId}:v1`;
    const ttl = options.ttlHours ?? config.ttlHours;
    return fetchWithCache(cacheKey, ttl, async ()=>{
      const append = combineAppend(defaultAppend.movie, options.append);
      const detail = await client.get(`/movie/${movieId}`, {
        append_to_response: append,
      }, {
        language: options.language ?? config.language,
        region: options.region ?? config.region,
      });
      return mapMovieDetail(detail, {
        imageBase: config.imageBase,
        posterSize: options.posterSize,
        backdropSize: options.backdropSize,
        profileSize: options.profileSize,
        logoSize: options.logoSize,
      });
    });
  }

  async function getTvEnriched(id, options = {}){
    const tvId = id ?? options.id;
    if(tvId == null) return null;
    const cacheKey = `tmdb:tv:${tvId}:v1`;
    const ttl = options.ttlHours ?? config.ttlHours;
    return fetchWithCache(cacheKey, ttl, async ()=>{
      const append = combineAppend(defaultAppend.tv, options.append);
      const detail = await client.get(`/tv/${tvId}`, {
        append_to_response: append,
      }, {
        language: options.language ?? config.language,
        region: options.region ?? config.region,
      });
      return mapTvDetail(detail, {
        imageBase: config.imageBase,
        posterSize: options.posterSize,
        backdropSize: options.backdropSize,
        profileSize: options.profileSize,
        logoSize: options.logoSize,
      });
    });
  }

  async function getSeasonEnriched(tvId, seasonNumber, options = {}){
    if(tvId == null || seasonNumber == null) return null;
    const cacheKey = `tmdb:tv:${tvId}:season:${seasonNumber}:v1`;
    const ttl = options.ttlHours ?? config.ttlHours;
    return fetchWithCache(cacheKey, ttl, async ()=>{
      const append = combineAppend(defaultAppend.season, options.append);
      const detail = await client.get(`/tv/${tvId}/season/${seasonNumber}`, {
        append_to_response: append,
      }, {
        language: options.language ?? config.language,
        region: options.region ?? config.region,
      });
      let show = options.show || null;
      if(!show && !options.skipShowLookup){
        try{
          show = await getTvEnriched(tvId, { ttlHours: ttl });
        }catch(err){
          log.warn('Failed to load parent show for season', tvId, seasonNumber, err?.message || err);
        }
      }
      return mapSeasonDetail(detail, {
        imageBase: config.imageBase,
        posterSize: options.posterSize,
        backdropSize: options.backdropSize,
        profileSize: options.profileSize,
        logoSize: options.logoSize,
        show,
      });
    });
  }

  return {
    getMovieEnriched,
    getTvEnriched,
    getSeasonEnriched,
  };
}

export function createMetadataService(inputOptions = {}){
  const config = normaliseConfig(inputOptions);
  const cache = inputOptions.cacheStore || createCacheStore({ storageKey: inputOptions.storageKey });
  const client = createTmdbClient({
    apiBase: inputOptions.apiBase || config.apiBase,
    apiKey: config.apiKey,
    token: config.token,
    language: config.language,
    region: config.region,
    ttlHours: config.ttlHours,
  });
  const log = createLogger();
  const fetcher = createFetcher(client, cache, config, log);

  return {
    getMovieEnriched: fetcher.getMovieEnriched,
    getTvEnriched: fetcher.getTvEnriched,
    getSeasonEnriched: fetcher.getSeasonEnriched,
    get client(){ return client; },
    get cache(){ return cache; },
    get config(){ return { ...config }; },
    clear(prefix){ cache.clear(prefix); },
  };
}

const defaultService = createMetadataService();

export const getMovieEnriched = (...args) => defaultService.getMovieEnriched(...args);
export const getTvEnriched = (...args) => defaultService.getTvEnriched(...args);
export const getSeasonEnriched = (...args) => defaultService.getSeasonEnriched(...args);

export default defaultService;
