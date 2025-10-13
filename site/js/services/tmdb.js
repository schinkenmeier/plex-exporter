import cacheStore, { clear as clearCacheStore } from '../cacheStore.js';
import { createMetadataService } from '../metadataService.js';

const API_V3 = 'https://api.themoviedb.org/3';
const LOG_PREFIX = '[tmdb]';
const SESSION_CACHE = new Map();

let metadataInstance = null;
let metadataSignature = '';

function logWarn(...args){
  try {
    console.warn(LOG_PREFIX, ...args);
  } catch (_err) {
    // ignore
  }
}

function normalizeConfig(cfg = {}){
  const language = cfg.lang || cfg.language || 'de-DE';
  const region = cfg.region || cfg.iso || 'DE';
  const ttlHours = Number(cfg.ttlHours || cfg.tmdbTtlHours || 24) || 24;
  const imageBase = cfg.imageBase || cfg.tmdbImageBase;
  return { language, region, ttlHours, imageBase };
}

function buildSignature(cfg, auth){
  const { language, region, ttlHours, imageBase } = normalizeConfig(cfg);
  const authSig = auth?.kind ? `${auth.kind}:${auth.value || ''}` : 'none';
  return JSON.stringify({ language, region, ttlHours, imageBase, auth: authSig });
}

function ensureMetadata(cfg = {}, auth){
  const signature = buildSignature(cfg, auth);
  if(metadataInstance && metadataSignature === signature){
    return metadataInstance;
  }
  const { language, region, ttlHours, imageBase } = normalizeConfig(cfg);
  const options = {
    cacheStore,
    language,
    region,
    ttlHours,
  };
  if(imageBase) options.imageBase = imageBase;
  if(auth?.kind === 'bearer' && auth.value){
    options.token = auth.value;
  } else if(auth?.kind === 'apikey' && auth.value){
    options.apiKey = auth.value;
  }
  metadataInstance = createMetadataService(options);
  metadataSignature = signature;
  return metadataInstance;
}

function keyFor(item){
  const type = (item?.type === 'tv') ? 'tv' : 'movie';
  const imdb = item?.ids?.imdb || '';
  const tmdb = item?.ids?.tmdb || '';
  const title = (item?.title || item?.name || '').toLowerCase();
  const year = String(item?.year || '').slice(0, 4);
  return [type, imdb, tmdb, title, year].filter(Boolean).join('|');
}

export function clearCache(){
  try{
    localStorage.removeItem('tmdbCache');
  }catch(err){
    logWarn('Failed to clear legacy TMDB cache from storage:', err);
  }
  SESSION_CACHE.clear();
  try{
    clearCacheStore('tmdb:');
  }catch(err){
    logWarn('Failed to clear metadata cache store:', err);
  }
  if(metadataInstance){
    try{
      metadataInstance.clear?.('tmdb:');
    }catch(err){
      logWarn('Failed to clear metadata service cache:', err);
    }
  }
}

function tokenFromEnv(cfg){
  try{
    const token = localStorage.getItem('tmdbToken');
    if(token && token.trim()) return { kind: 'bearer', value: token.trim() };
  }catch(err){
    logWarn('Failed to read TMDB token from storage:', err);
  }
  if(cfg?.tmdbToken){
    const val = String(cfg.tmdbToken).trim();
    if(val) return { kind: 'bearer', value: val };
  }
  if(cfg?.tmdbApiKey){
    const val = String(cfg.tmdbApiKey).trim();
    if(val) return { kind: 'apikey', value: val };
  }
  return { kind: 'none', value: '' };
}

async function resolveByExternalId(type, imdbId, cfg, auth){
  if(!imdbId) return null;
  try{
    const service = ensureMetadata(cfg, auth);
    const client = service.client;
    const json = await client.get(`/find/${encodeURIComponent(imdbId)}`, {
      external_source: 'imdb_id',
    });
    if(type === 'movie'){
      return json?.movie_results?.[0]?.id ?? null;
    }
    return json?.tv_results?.[0]?.id ?? null;
  }catch(err){
    logWarn(`Failed to resolve external id ${imdbId}:`, err);
    return null;
  }
}

async function resolveBySearch(type, title, year, cfg, auth){
  const name = String(title || '').trim();
  if(!name) return null;
  try{
    const service = ensureMetadata(cfg, auth);
    const client = service.client;
    const params = {
      query: name,
      include_adult: false,
    };
    if(year){
      if(type === 'movie') params.year = year;
      else params.first_air_date_year = year;
    }
    const json = await client.get(`/search/${type}`, params);
    const result = Array.isArray(json?.results) ? json.results[0] : null;
    return result?.id ?? null;
  }catch(err){
    logWarn(`Search failed for ${type} ${title}:`, err);
    return null;
  }
}

async function hydrateItem(item, cfg, auth){
  const type = (item?.type === 'tv') ? 'tv' : 'movie';
  const cacheKey = keyFor(item);
  if(SESSION_CACHE.has(cacheKey)){
    return SESSION_CACHE.get(cacheKey);
  }
  const service = ensureMetadata(cfg, auth);
  let tmdbId = item?.ids?.tmdb;
  if(!tmdbId && item?.ids?.imdb){
    tmdbId = await resolveByExternalId(type, item.ids.imdb, cfg, auth);
  }
  if(!tmdbId){
    const year = item?.year ? Number(String(item.year).slice(0, 4)) : undefined;
    tmdbId = await resolveBySearch(type, item?.title || item?.name, year, cfg, auth);
  }
  if(!tmdbId){
    SESSION_CACHE.set(cacheKey, null);
    return null;
  }
  try{
    const detail = type === 'tv'
      ? await service.getTvEnriched(tmdbId)
      : await service.getMovieEnriched(tmdbId);
    if(!detail){
      SESSION_CACHE.set(cacheKey, null);
      return null;
    }
    const enriched = {
      id: detail.id || String(tmdbId),
      poster: detail.poster || '',
      backdrop: detail.backdrop || '',
      url: detail.url || `https://www.themoviedb.org/${type}/${tmdbId}`,
    };
    SESSION_CACHE.set(cacheKey, enriched);
    return enriched;
  }catch(err){
    logWarn(`Hydration failed for ${type} ${tmdbId}:`, err);
    SESSION_CACHE.set(cacheKey, null);
    return null;
  }
}

export async function hydrateOptional(movies, shows, cfg = {}){
  try{
    const auth = tokenFromEnv(cfg);
    if(!auth.value){
      return;
    }
    ensureMetadata(cfg, auth);
    const work = [...(movies || []), ...(shows || [])];
    const limit = 40;
    let index = 0;
    const processChunk = async () => {
      const chunk = work.slice(index, index + 4);
      index += 4;
      await Promise.all(chunk.map(async (it) => {
        const data = await hydrateItem(it, cfg, auth);
        if(data){
          it.tmdb = { id: data.id, poster: data.poster, backdrop: data.backdrop, url: data.url };
          it.ids = it.ids || {};
          if(!it.ids.tmdb && data.id){
            it.ids.tmdb = String(data.id);
          }
        }
      }));
      try{
        window.dispatchEvent(new CustomEvent('tmdb:chunk', { detail: { updated: chunk.length, index } }));
      }catch(err){
        logWarn('Failed to dispatch tmdb:chunk event:', err);
      }
      const hasMore = index < Math.min(work.length, limit);
      if(hasMore){
        if(window.requestIdleCallback){
          window.requestIdleCallback(processChunk, { timeout: 500 });
        }else{
          setTimeout(processChunk, 250);
        }
      }else{
        try{
          window.dispatchEvent(new CustomEvent('tmdb:done', { detail: { total: Math.min(work.length, limit) } }));
        }catch(err){
          logWarn('Failed to dispatch tmdb:done event:', err);
        }
      }
    };
    processChunk();
  }catch(err){
    logWarn('hydrateOptional failed to start:', err);
  }
}

function withAuth(url, auth){
  if(!auth || auth.kind === 'none') return { url, init: {} };
  if(auth.kind === 'bearer'){
    return { url, init: { headers: { Authorization: `Bearer ${auth.value}`, Accept: 'application/json' } } };
  }
  const separator = url.includes('?') ? '&' : '?';
  return { url: `${url}${separator}api_key=${encodeURIComponent(auth.value)}`, init: { headers: { Accept: 'application/json' } } };
}

// Lightweight token validation used by settings UI
export async function validateToken(raw){
  const token = String(raw || '').trim();
  if(!token) throw new Error('empty');
  const looksLikeV3 = /^[a-f0-9]{32}$/i.test(token);
  const looksLikeJwt = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(token);
  const decodeJwtPayload = (t)=>{
    try{
      const part = t.split('.')[1];
      const pad = (s)=> s + '='.repeat((4 - (s.length % 4)) % 4);
      const json = atob(pad(part.replace(/-/g,'+').replace(/_/g,'/')));
      return JSON.parse(json);
    }catch(err){
      logWarn('Failed to decode TMDB JWT payload:', err);
      return null;
    }
  };

  if(looksLikeV3){
    const { url, init } = withAuth(`${API_V3}/configuration`, { kind:'apikey', value: token });
    const res = await fetch(url, init);
    if(res.ok) return { ok:true, as:'apikey', hint:'v3Key' };
    return { ok:false, as:'apikey', hint:'looksV3' };
  }

  if(looksLikeJwt){
    const payload = decodeJwtPayload(token);
    if(payload && typeof payload === 'object'){
      const iss = String(payload.iss||'');
      if(iss && !/themoviedb\.org/i.test(iss)){
        return { ok:false, as:'bearer', hint:'issMismatch' };
      }
    }
    const { url, init } = withAuth(`${API_V3}/trending/movie/day`, { kind:'bearer', value: token });
    try{
      const res = await fetch(url, init);
      if(res.ok) return { ok:true, as:'bearer', hint:null };
    }catch(err){
      logWarn('Bearer token validation request failed:', err);
    }
    return { ok:true, as:'bearer', hint:'structOnly' };
  }

  return { ok:false, as:'bearer', hint:null };
}
