import { getCache, setCache } from './cache.js';

const LOG_PREFIX = '[data]';

let lastSources = { movies: null, shows: null };
const showDetailCache = new Map();
let loadRetryCount = { movies: 0, shows: 0 };
const MAX_RETRIES = 3;
const DATA_CACHE_TTL = 1000 * 60 * 30; // 30 minutes for data files

const MOVIE_THUMB_BASE = 'data/movies/';
const SHOW_THUMB_BASE = 'data/series/';
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

async function fetchJson(url, retries = 2, useCache = true){
  // Try cache first if enabled
  if(useCache){
    const cached = getCache(url);
    if(cached !== null) {
      console.log(`${LOG_PREFIX} Cache hit for ${url}`);
      return cached;
    }
  }

  let lastError = null;
  for(let attempt = 0; attempt <= retries; attempt++){
    try{
      const r = await fetch(url, { cache:'no-store' });
      if(r && r.ok) {
        const data = await r.json();
        // Cache successful responses
        if(useCache && data) {
          setCache(url, data, DATA_CACHE_TTL);
        }
        return data;
      }
      if(r && r.status === 404) return null; // Don't retry 404s
      lastError = new Error(`HTTP ${r.status}: ${r.statusText}`);
    }
    catch(err){
      lastError = err;
      console.warn(`${LOG_PREFIX} Fetch attempt ${attempt + 1}/${retries + 1} failed for ${url}:`, err.message);
    }
    if(attempt < retries){
      // Exponential backoff
      const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  if(lastError){
    console.error(`${LOG_PREFIX} All fetch attempts failed for ${url}:`, lastError.message);
  }
  return null;
}

function embeddedJsonById(id){
  try{
    const n = document.getElementById(id);
    if(n && n.textContent) return JSON.parse(n.textContent);
  }
  catch(err){
    console.warn(`${LOG_PREFIX} Failed to parse embedded JSON #${id}:`, err.message);
  }
  return null;
}

function fromGlobalBag(key){
  try{
    const bag = window.__PLEX_EXPORTER__;
    const arr = bag && Array.isArray(bag[key]) ? bag[key] : null;
    return arr || null;
  }
  catch(err){
    console.warn(`${LOG_PREFIX} Failed to access global bag[${key}]:`, err.message);
    return null;
  }
}

function fromWindow(varName){
  try{
    const arr = Array.isArray(window[varName]) ? window[varName] : null;
    return arr || null;
  }
  catch(err){
    console.warn(`${LOG_PREFIX} Failed to access window.${varName}:`, err.message);
    return null;
  }
}

async function loadWithCompat(primaryUrl, opts){
  // default: try site/data first
  let data = await fetchJson(primaryUrl);
  if(Array.isArray(data) && data.length){ markSource(opts?.label, `primary:${primaryUrl}`); return data; }
  // fallback: embedded <script id="..."> JSON
  if(opts?.embedId){ const emb = embeddedJsonById(opts.embedId); if(Array.isArray(emb) && emb.length){ markSource(opts?.label, `embedded:${opts.embedId}`); return emb; } }
  // fallback: global exporter bag
  if(opts?.exportKey){ const bag = fromGlobalBag(opts.exportKey); if(Array.isArray(bag) && bag.length){ markSource(opts?.label, `globalBag:${opts.exportKey}`); return bag; } }
  // fallback: window variable
  if(opts?.globalVar){ const win = fromWindow(opts.globalVar); if(Array.isArray(win) && win.length){ markSource(opts?.label, `window:${opts.globalVar}`); return win; } }
  // alt paths (legacy)
  for(const alt of (opts?.altUrls||[])){
    const j = await fetchJson(alt); if(Array.isArray(j) && j.length){ markSource(opts?.label, `alt:${alt}`); return j; }
  }
  // last resort: empty array
  markSource(opts?.label, 'empty');
  return Array.isArray(data) ? data : [];
}

export function prefixThumbValue(value, base){
  const raw = value == null ? '' : String(value).trim();
  if(!raw) return '';
  if(raw.startsWith('//') || raw.startsWith('/') || SCHEME_RE.test(raw)) return raw;
  const normalizedRaw = raw.replace(/\\/g, '/');
  const normalizedBase = base ? (base.endsWith('/') ? base : `${base}/`) : '';
  let decodeWarned = false;
  const encodePath = path => path.split('/').map(segment => {
    if(!segment) return '';
    try{
      return encodeURIComponent(decodeURIComponent(segment));
    }catch(err){
      if(!decodeWarned){
        decodeWarned = true;
        console.warn(`${LOG_PREFIX} Failed to normalize thumb segment "${segment}":`, err);
      }
      return encodeURIComponent(segment);
    }
  }).join('/');
  const trimmed = normalizedRaw.replace(/^\/+/, '');
  const segments = trimmed.split('/');
  const normalizedSegments = [];
  for(const segment of segments){
    if(!segment || segment === '.') continue;
    if(segment === '..'){
      if(normalizedSegments.length) normalizedSegments.pop();
      continue;
    }
    normalizedSegments.push(segment);
  }
  const normalizedPath = normalizedSegments.join('/');
  if(normalizedPath.startsWith('data/')) return encodePath(normalizedPath);
  let relativeSegments = normalizedSegments;
  if(normalizedBase && relativeSegments.length){
    const baseDir = normalizedBase.replace(/\/+$/, '').split('/').pop();
    if(baseDir && relativeSegments[0] === baseDir){
      relativeSegments = relativeSegments.slice(1);
    }
  }
  const cleaned = relativeSegments.join('/');
  const encoded = encodePath(cleaned);
  return `${normalizedBase}${encoded}`;
}


export function prefixThumb(obj, base){
  if(!obj || typeof obj !== 'object') return obj;
  const current = obj.thumbFile ?? obj.thumb ?? '';
  const prefixed = prefixThumbValue(current, base);
  if(prefixed){
    obj.thumbFile = prefixed;
    obj.thumb = prefixed;
  }else if(current){
    const str = String(current);
    obj.thumbFile = str;
    if(obj.thumb == null) obj.thumb = str;
  }
  return obj;
}

export function prefixMovieThumb(obj){
  return prefixThumb(obj, MOVIE_THUMB_BASE);
}

export function prefixShowThumb(obj){
  return prefixThumb(obj, SHOW_THUMB_BASE);
}

export function prefixShowTree(show){
  if(!show || typeof show !== 'object') return show;
  prefixShowThumb(show);
  if(Array.isArray(show.seasons)) show.seasons.forEach(prefixSeasonTree);
  return show;
}

function prefixSeasonTree(season){
  if(!season || typeof season !== 'object') return season;
  prefixShowThumb(season);
  if(Array.isArray(season.episodes)) season.episodes.forEach(ep=>prefixShowThumb(ep));
  return season;
}

function normalizeMovieThumbs(list){
  if(!Array.isArray(list)) return [];
  list.forEach(item=>{ if(item && typeof item === 'object') prefixMovieThumb(item); });
  return list;
}

function normalizeShowThumbs(list){
  if(!Array.isArray(list)) return [];
  list.forEach(item=>{ if(item && typeof item === 'object') prefixShowTree(item); });
  return list;
}

export async function loadMovies(){
  try {
    const movies = await loadWithCompat('data/movies/movies.json', {
      label: 'movies',
      embedId: 'movies-json',
      exportKey: 'movies',
      globalVar: '__PLEX_MOVIES__',
      altUrls: [
        'movies/movies.json',
        'data/movies.json',
        'Filme/movies.json',
        'movies.json',
      ],
    });
    loadRetryCount.movies = 0; // Reset on success
    return normalizeMovieThumbs(movies);
  } catch (error) {
    console.error(`${LOG_PREFIX} loadMovies failed:`, error);
    if (loadRetryCount.movies < MAX_RETRIES) {
      loadRetryCount.movies++;
      console.log(`${LOG_PREFIX} Retrying loadMovies (${loadRetryCount.movies}/${MAX_RETRIES})...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * loadRetryCount.movies));
      return loadMovies();
    }
    console.warn(`${LOG_PREFIX} loadMovies exhausted retries, returning empty array.`);
    loadRetryCount.movies = 0;
    return [];
  }
}
export async function loadShows(){
  try {
    const shows = await loadWithCompat('data/series/series_index.json', {
      label: 'shows',
      embedId: 'series-json',
      exportKey: 'shows',
      globalVar: '__PLEX_SHOWS__',
      altUrls: [
        'series/series_index.json',
        'data/shows.json',
        'data/series.json',
        'Serien/series.json',
        'series/series.json',
        'series.json',
        'shows.json',
      ],
    });
    loadRetryCount.shows = 0; // Reset on success
    return normalizeShowThumbs(shows);
  } catch (error) {
    console.error(`${LOG_PREFIX} loadShows failed:`, error);
    if (loadRetryCount.shows < MAX_RETRIES) {
      loadRetryCount.shows++;
      console.log(`${LOG_PREFIX} Retrying loadShows (${loadRetryCount.shows}/${MAX_RETRIES})...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * loadRetryCount.shows));
      return loadShows();
    }
    console.warn(`${LOG_PREFIX} loadShows exhausted retries, returning empty array.`);
    loadRetryCount.shows = 0;
    return [];
  }
}

export async function loadShowDetail(item){
  if(!item) return null;
  const keys = cacheKeys(item);
  const cached = getCachedDetail(keys);
  if(cached !== undefined) return cached;

  const urls = detailUrlCandidates(item);
  let lastError = null;

  for(const url of urls){
    try {
      const data = await fetchJson(url);
      if(data && typeof data === 'object'){
        const normalized = normalizeShowDetail(data);
        storeDetail(keys, normalized, item);
        return cloneDetail(normalized);
      }
    } catch (error) {
      lastError = error;
      console.warn(`${LOG_PREFIX} Failed to load show detail from ${url}:`, error.message);
    }
  }

  if(lastError) {
    console.error(`${LOG_PREFIX} Could not load show detail for ${item.title || 'unknown'}`, lastError);
  }

  storeDetail(keys, null, item);
  return null;
}

function markSource(label, src){
  if(!label) return;
  try{
    lastSources[label] = src;
  }catch(err){
    console.warn(`${LOG_PREFIX} Failed to record source for ${label}:`, err);
  }
}

export function getSources(){ return { ...lastSources }; }
function cacheKeys(item){
  const keys = [];
  if(item?.ratingKey !== undefined && item?.ratingKey !== null && item?.ratingKey !== ''){
    keys.push(`rk:${String(item.ratingKey)}`);
  }
  const href = normalizeHrefKey(item?.href);
  if(href) keys.push(`href:${href}`);
  return keys;
}

function normalizeHrefKey(href){
  if(!href) return '';
  return String(href).trim().replace(/^\.\//,'').replace(/^\/+/, '');
}

function getCachedDetail(keys){
  for(const key of keys){
    if(showDetailCache.has(key)){
      const cached = showDetailCache.get(key);
      return cached ? cloneDetail(cached) : null;
    }
  }
  return undefined;
}

function storeDetail(keys, value, item){
  const val = value;
  keys.forEach(key=>{ showDetailCache.set(key, val); });
  const rk = item?.ratingKey;
  if(rk !== undefined && rk !== null){
    showDetailCache.set(`rk:${String(rk)}`, val);
  }
  const detailKey = value && typeof value === 'object' ? value.ratingKey : undefined;
  if(detailKey !== undefined && detailKey !== null){
    showDetailCache.set(`rk:${String(detailKey)}`, val);
  }
  const href = normalizeHrefKey(item?.href);
  if(href){
    showDetailCache.set(`href:${href}`, val);
  }
  const detailHref = value && typeof value === 'object' ? normalizeHrefKey(value.href) : '';
  if(detailHref){
    showDetailCache.set(`href:${detailHref}`, val);
  }
}

function detailUrlCandidates(item){
  const urls = new Set();
  const hrefKey = normalizeHrefKey(item?.href);
  if(hrefKey){
    if(/^https?:/i.test(hrefKey)){ urls.add(hrefKey); }
    else{
      if(hrefKey.startsWith('data/')) urls.add(hrefKey);
      else urls.add(`data/${hrefKey}`);
      const withoutData = hrefKey.replace(/^data\//,'');
      if(!withoutData.startsWith('series/')) urls.add(`data/series/${withoutData}`);
      const idPart = withoutData.replace(/^series\//,'').replace(/^details\//,'').replace(/\.json$/,'');
      if(idPart) urls.add(`data/series/details/${idPart}.json`);
    }
  }
  const rk = item?.ratingKey;
  if(rk !== undefined && rk !== null){
    urls.add(`data/series/details/${String(rk)}.json`);
  }
  return Array.from(urls);
}

function normalizeShowDetail(data){
  if(!data || typeof data !== 'object') return null;
  const show = { ...data };
  prefixShowThumb(show);
  show.genres = normalizeGenres(show.genres);
  const castList = normalizePeople(show.cast || show.roles || []);
  show.cast = castList;
  show.roles = castList;
  show.seasons = Array.isArray(show.seasons) ? show.seasons.map(normalizeSeason).filter(Boolean) : [];
  show.seasonCount = Number.isFinite(show.seasonCount) ? show.seasonCount : show.seasons.length;
  prefixShowTree(show);
  return show;
}

function normalizeSeason(season){
  if(!season || typeof season !== 'object') return null;
  const out = { ...season };
  prefixShowThumb(out);
  out.genres = normalizeGenres(out.genres);
  out.episodes = Array.isArray(out.episodes) ? out.episodes.map(normalizeEpisode).filter(Boolean) : [];
  prefixSeasonTree(out);
  return out;
}

function normalizeEpisode(ep){
  if(!ep || typeof ep !== 'object') return null;
  const out = { ...ep };
  prefixShowThumb(out);
  out.genres = normalizeGenres(out.genres);
  return out;
}

function normalizeGenres(list){
  if(!Array.isArray(list)) return [];
  const seen = new Set();
  const result = [];
  list.forEach(entry=>{
    let obj = null;
    if(typeof entry === 'string'){
      const tag = entry.trim();
      if(tag) obj = { tag };
    }else if(entry && typeof entry === 'object'){
      const tag = String(entry.tag || entry.title || entry.name || entry.label || '').trim();
      if(tag){ obj = { ...entry, tag }; }
    }
    if(obj && !seen.has(obj.tag)){
      seen.add(obj.tag);
      result.push(obj);
    }
  });
  return result;
}

function normalizePeople(list){
  if(!Array.isArray(list)) return [];
  return list.map(entry=>{
    if(!entry) return null;
    if(typeof entry === 'string'){
      const tag = entry.trim();
      return tag ? { tag } : null;
    }
    if(typeof entry === 'object'){
      const tag = String(entry.tag || entry.name || entry.role || '').trim();
      if(tag){ return { ...entry, tag }; }
      return { ...entry };
    }
    return null;
  }).filter(Boolean);
}

function cloneDetail(detail){
  if(detail === null || detail === undefined) return detail;
  try{
    return structuredClone(detail);
  }catch(err){
    console.warn(`${LOG_PREFIX} structuredClone failed for show detail:`, err);
  }
  try{
    return JSON.parse(JSON.stringify(detail));
  }catch(err){
    console.warn(`${LOG_PREFIX} JSON clone failed for show detail:`, err);
  }
  return detail;
}
