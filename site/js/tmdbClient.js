import { createCacheStore } from './cacheStore.js';

const DEFAULT_API_BASE = 'https://api.themoviedb.org/3';
const DEFAULT_LANGUAGE = 'de-DE';
const DEFAULT_REGION = 'DE';
const LOG_PREFIX = '[tmdbClient]';
const MAX_RETRIES = 4;
const BASE_DELAY = 500;
const DELAY_CAP = 10_000;

function delay(ms){
  return new Promise(resolve => setTimeout(resolve, Math.max(0, ms || 0)));
}

function parseRetryAfter(value){
  if(!value) return null;
  const num = Number(value);
  if(Number.isFinite(num)) return num * 1000;
  const date = Date.parse(value);
  if(Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}

function computeRetryDelay(attempt, retryAfter){
  if(Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter, DELAY_CAP);
  const factor = Math.pow(2, Math.max(0, attempt));
  return Math.min(DELAY_CAP, BASE_DELAY * factor);
}

function normaliseAppend(append){
  if(!append) return '';
  if(Array.isArray(append)) return append.filter(Boolean).join(',');
  if(typeof append === 'string') return append.split(',').map(str => str.trim()).filter(Boolean).join(',');
  return '';
}

function resolveCredential(options = {}){
  const preferred = [
    options.token,
    options.tmdbToken,
    options?.credentials?.token,
    options?.settings?.tmdbToken,
  ].find(value => typeof value === 'string' && value.trim());
  if(preferred){
    return { kind: 'bearer', value: preferred.trim() };
  }

  const key = [
    options.apiKey,
    options.tmdbApiKey,
    options?.credentials?.apiKey,
    options?.settings?.tmdbApiKey,
  ].find(value => typeof value === 'string' && value.trim());
  if(key){
    return { kind: 'apikey', value: key.trim() };
  }

  if(typeof localStorage !== 'undefined'){
    try{
      const token = localStorage.getItem('tmdbToken');
      if(token && token.trim()) return { kind: 'bearer', value: token.trim() };
    }catch(err){
      console.warn(`${LOG_PREFIX} Unable to read tmdbToken from storage:`, err);
    }
  }

  return { kind: 'none', value: '' };
}

function createRequestInit(credential){
  const headers = { Accept: 'application/json;charset=utf-8' };
  if(credential?.kind === 'bearer' && credential.value){
    headers.Authorization = `Bearer ${credential.value}`;
  }
  return { headers };
}

function applyCredentialToUrl(url, credential){
  if(credential?.kind !== 'apikey' || !credential.value) return url;
  const u = new URL(url);
  u.searchParams.set('api_key', credential.value);
  return u.toString();
}

function buildUrl(path, params, config){
  const base = String(config.apiBase || DEFAULT_API_BASE).replace(/\/$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${base}${cleanPath}`);
  const search = url.searchParams;

  const append = normaliseAppend(params.append_to_response);
  if(append){
    search.set('append_to_response', append);
  }

  const language = params.language || config.language || DEFAULT_LANGUAGE;
  if(language) search.set('language', language);

  const region = params.region || config.region || DEFAULT_REGION;
  if(region) search.set('region', region);

  for(const [key, value] of Object.entries(params)){
    if(value === undefined || value === null) continue;
    if(key === 'append_to_response' || key === 'language' || key === 'region') continue;
    if(Array.isArray(value)){
      if(value.length) search.set(key, value.join(','));
      continue;
    }
    search.set(key, String(value));
  }

  const finalUrl = url.toString();
  if(append){
    return finalUrl.replace(/append_to_response=([^&]+)/, (_, value) => `append_to_response=${decodeURIComponent(value)}`);
  }
  return finalUrl;
}

async function fetchJson(url, init, { retries = MAX_RETRIES } = {}){
  let attempt = 0;
  let lastError = null;
  while(attempt <= retries){
    try{
      const response = await fetch(url, init);
      if(response.status === 204) return null;
      if(response.status === 429 && attempt < retries){
        const retryAfter = parseRetryAfter(response.headers.get('Retry-After'));
        await delay(computeRetryDelay(attempt, retryAfter));
        attempt += 1;
        continue;
      }
      if(!response.ok){
        const error = new Error(`TMDB request failed with status ${response.status}`);
        error.status = response.status;
        error.url = url;
        try{
          error.body = await response.text();
        }catch(_err){
          error.body = null;
        }
        throw error;
      }
      const data = await response.json();
      return data;
    }catch(err){
      lastError = err;
      const status = typeof err?.status === 'number' ? err.status : null;
      const shouldRetry = status == null || status >= 500 || status === 429;
      if(attempt >= retries || !shouldRetry){
        break;
      }
      await delay(computeRetryDelay(attempt, null));
      attempt += 1;
    }
  }
  throw lastError || new Error('TMDB request failed');
}

/**
 * Creates a TMDB API client with caching and retry logic
 * @param {Object} [options] - Configuration options
 * @param {string} [options.apiBase] - TMDB API base URL
 * @param {string} [options.language] - Default language (e.g., 'de-DE')
 * @param {string} [options.region] - Default region (e.g., 'DE')
 * @param {string} [options.token] - TMDB v4 Bearer token
 * @param {string} [options.apiKey] - TMDB v3 API key
 * @param {number} [options.ttlHours] - Cache TTL in hours
 * @param {boolean} [options.useCache] - Enable caching
 * @param {Object} [options.cacheStore] - Custom cache store instance
 * @returns {Object} TMDB client with get method
 */
export function createTmdbClient(options = {}){
  const cache = options.cache instanceof Map ? options.cache : null;
  const config = {
    apiBase: options.apiBase || DEFAULT_API_BASE,
    language: options.language || DEFAULT_LANGUAGE,
    region: options.region || DEFAULT_REGION,
    ttlHours: options.ttlHours || options.ttl || 0,
  };
  const credential = resolveCredential(options);
  const store = options.cacheStore || (options.useCache ? createCacheStore() : null);

  function getCacheKey(method, params){
    if(!cache && !store) return '';
    const sorted = Object.keys(params).sort().map(key => `${key}=${JSON.stringify(params[key])}`).join('&');
    return `${method}?${sorted}`;
  }

  async function get(path, params = {}, opts = {}){
    const requestParams = { ...params };
    if(opts.append){
      const baseAppend = normaliseAppend(requestParams.append_to_response);
      const nextAppend = normaliseAppend(opts.append);
      const combined = [baseAppend, nextAppend].filter(Boolean).join(',');
      if(combined){
        requestParams.append_to_response = combined;
      }
    }
    if(opts.language) requestParams.language = opts.language;
    if(opts.region) requestParams.region = opts.region;
    const url = buildUrl(path, requestParams, config);
    const authedUrl = applyCredentialToUrl(url, credential);
    const init = createRequestInit(credential);
    const cacheKey = getCacheKey(path, requestParams);
    if(cacheKey){
      if(cache && cache.has(cacheKey)) return cache.get(cacheKey);
      if(store){
        const cached = store.get(cacheKey);
        if(cached) return cached;
      }
    }
    const data = await fetchJson(authedUrl, init, { retries: opts.retries ?? MAX_RETRIES });
    if(cacheKey){
      if(cache) cache.set(cacheKey, data);
      if(store){
        try{
          store.set(cacheKey, data, options.ttlHours || 0);
        }catch(err){
          console.warn(`${LOG_PREFIX} Failed to persist response cache:`, err);
        }
      }
    }
    return data;
  }

  return {
    get,
    get credential(){ return credential; },
    get config(){ return { ...config }; },
  };
}

const defaultClient = createTmdbClient();

export async function get(path, params){
  return defaultClient.get(path, params);
}

export default defaultClient;
