import { createCacheStore } from '../shared/cacheStore.js';
import { createTmdbClient } from '../services/tmdbClient.js';
import {
  mapMovieDetail,
  mapTvDetail,
  mapSeasonDetail,
} from '../services/tmdbMapper.js';

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
    movie: 'images,credits,release_dates,watch/providers',
    tv: 'images,content_ratings,aggregate_credits,credits,watch/providers',
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

  /**
   * Fetches enriched movie details from TMDB with caching
   * @param {string|number} id - TMDB movie ID
   * @param {Object} [options] - Configuration options
   * @param {number} [options.ttlHours] - Cache TTL in hours
   * @param {string} [options.language] - Language code (e.g., 'de-DE')
   * @param {string} [options.region] - Region code (e.g., 'DE')
   * @param {string|string[]} [options.append] - Additional TMDB endpoints to append
   * @param {string} [options.posterSize] - Poster image size
   * @param {string} [options.backdropSize] - Backdrop image size
   * @param {string} [options.profileSize] - Profile image size
   * @param {string} [options.logoSize] - Logo image size
   * @returns {Promise<Object|null>} Enriched movie data or null
   */
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
        region: options.region ?? config.region,
      });
    });
  }

  /**
   * Fetches enriched TV series details from TMDB with caching
   * @param {string|number} id - TMDB TV series ID
   * @param {Object} [options] - Configuration options (same as getMovieEnriched)
   * @returns {Promise<Object|null>} Enriched TV series data or null
   */
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
        region: options.region ?? config.region,
      });
    });
  }

  /**
   * Fetches enriched season details from TMDB with caching
   * @param {string|number} tvId - TMDB TV series ID
   * @param {number} seasonNumber - Season number
   * @param {Object} [options] - Configuration options
   * @param {Object} [options.show] - Parent show object to attach to season
   * @param {boolean} [options.skipShowLookup] - Skip automatic show lookup
   * @param {string} [options.stillSize] - Episode still image size
   * @returns {Promise<Object|null>} Enriched season data or null
   */
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
          // Provide minimal show object as fallback
          show = { id: tvId, name: '', type: 'tv' };
        }
      }
      // Ensure show has at least minimal structure
      if(!show){
        show = { id: tvId, name: '', type: 'tv' };
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

let defaultCacheStore = null;
let defaultService = null;

function ensureDefaultCache(){
  if(!defaultCacheStore){
    defaultCacheStore = createCacheStore();
  }
  return defaultCacheStore;
}

function ensureDefaultService(){
  if(!defaultService){
    defaultService = createMetadataService({ cacheStore: ensureDefaultCache() });
  }
  return defaultService;
}

export function configureMetadataServiceDefaults(options = {}){
  const merged = { ...options };
  if(!merged.cacheStore){
    merged.cacheStore = ensureDefaultCache();
  }
  defaultService = createMetadataService(merged);
  return defaultService;
}

function readStoredToken(){
  try{
    const token = localStorage.getItem('tmdbToken');
    if(token && token.trim()){
      return token.trim();
    }
  }catch(err){
    console.warn(`${LOG_PREFIX} Failed to read tmdbToken from storage:`, err?.message || err);
  }
  return '';
}

export function syncDefaultMetadataService(cfg = {}, overrides = {}){
  try{
    const {
      preferStoredToken = true,
      token: overrideToken,
      apiKey: overrideApiKey,
      language: overrideLanguage,
      region: overrideRegion,
      ttlHours: overrideTtl,
      imageBase: overrideImageBase,
    } = overrides || {};

    const options = {};
    const lang = overrideLanguage || cfg.lang || cfg.language;
    if(lang) options.language = lang;
    const region = overrideRegion || cfg.region || cfg.iso;
    if(region) options.region = region;
    const ttlCandidates = [overrideTtl, cfg.ttlHours, cfg.tmdbTtlHours];
    for(const candidate of ttlCandidates){
      if(candidate === undefined || candidate === null) continue;
      if(typeof candidate === 'string' && candidate.trim() === '') continue;
      const ttlNum = Number(candidate);
      if(Number.isFinite(ttlNum)){
        options.ttlHours = ttlNum;
        break;
      }
    }
    const imageBase = overrideImageBase || cfg.imageBase || cfg.tmdbImageBase;
    if(imageBase) options.imageBase = imageBase;

    let token = typeof overrideToken === 'string' ? overrideToken.trim() : (overrideToken ?? '');
    if(typeof token !== 'string') token = '';
    if(!token && preferStoredToken){
      token = readStoredToken();
    }
    if(!token && typeof cfg.tmdbToken === 'string'){
      token = cfg.tmdbToken.trim();
    }

    let apiKey = typeof overrideApiKey === 'string' ? overrideApiKey.trim() : (overrideApiKey ?? '');
    if(typeof apiKey !== 'string') apiKey = '';
    if(!apiKey && typeof cfg.tmdbApiKey === 'string'){
      apiKey = cfg.tmdbApiKey.trim();
    }

    if(token){
      options.token = token;
    }else if(apiKey){
      options.apiKey = apiKey;
    }

    configureMetadataServiceDefaults(options);
  }catch(err){
    console.warn(`${LOG_PREFIX} Failed to sync default metadata service:`, err?.message || err);
  }
}

export const getMovieEnriched = (...args) => ensureDefaultService().getMovieEnriched(...args);
export const getTvEnriched = (...args) => ensureDefaultService().getTvEnriched(...args);
export const getSeasonEnriched = (...args) => ensureDefaultService().getSeasonEnriched(...args);

const metadataServiceFacade = {
  getMovieEnriched: (...args) => ensureDefaultService().getMovieEnriched(...args),
  getTvEnriched: (...args) => ensureDefaultService().getTvEnriched(...args),
  getSeasonEnriched: (...args) => ensureDefaultService().getSeasonEnriched(...args),
  clear(prefix){
    return ensureDefaultService().clear(prefix);
  },
  configure: configureMetadataServiceDefaults,
  sync: syncDefaultMetadataService,
};

Object.defineProperties(metadataServiceFacade, {
  client: {
    get(){
      return ensureDefaultService().client;
    },
  },
  cache: {
    get(){
      return ensureDefaultService().cache;
    },
  },
  config: {
    get(){
      return ensureDefaultService().config;
    },
  },
});

export default metadataServiceFacade;
