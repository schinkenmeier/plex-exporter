import { getCache, setCache } from '../shared/cache.js';
import { validateLibraryList } from './data/validators.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, computeFacets } from '@plex-exporter/shared';

const LOG_PREFIX = '[data]';
const MAX_PAGE = 1000;

let lastSources = { movies: null, shows: null };
const showDetailCache = new Map();
const DATA_CACHE_TTL = 1000 * 60 * 30; // 30 minutes for data files

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

function buildApiPath(path, params){
  const rawPath = String(path || '');
  if(!rawPath) return '';
  const normalized = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  const search = params ? params.toString() : '';
  const base = resolveApiBase();
  const withParams = search ? `${normalized}?${search}` : normalized;
  return base ? `${base}${withParams}` : withParams;
}

function normalizeApiLibraryEntry(entry, kind){
  if(!entry || typeof entry !== 'object') return null;
  const title = typeof entry.title === 'string' ? entry.title.trim() : '';
  const ratingKeyRaw = entry.ratingKey ?? entry.plexId ?? entry.id ?? entry.guid;
  if(!title || ratingKeyRaw == null) return null;
  const resolvedKind = (() => {
    const rawMediaType = typeof entry.mediaType === 'string' ? entry.mediaType.toLowerCase() : '';
    if(rawMediaType === 'tv' || rawMediaType === 'show') return 'show';
    if(rawMediaType === 'movie') return 'movie';
    if(kind === 'show' || kind === 'movie') return kind;
    return 'movie';
  })();
  const normalizedType = resolvedKind === 'show' ? 'tv' : 'movie';
  const thumbFile = typeof entry.thumbFile === 'string' ? entry.thumbFile : '';
  const thumb = typeof entry.thumb === 'string' ? entry.thumb : thumbFile;
  const normalized = {
    ...entry,
    type: normalizedType,
    title,
    ratingKey: String(ratingKeyRaw),
    thumbFile,
    thumb,
    href: typeof entry.href === 'string' ? entry.href : '',
    mediaType: normalizedType,
    genres: Array.isArray(entry.genres) ? entry.genres : [],
    collections: Array.isArray(entry.collections) ? entry.collections : [],
  };
  if(resolvedKind === 'show'){
    normalized.seasons = Array.isArray(entry.seasons) ? entry.seasons : [];
  }
  return normalized;
}

export async function fetchJson(url, retries = 2, useCache = true){
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
  const message = lastError?.message || 'Unbekannter Fehler';
  console.error(`${LOG_PREFIX} All fetch attempts failed for ${url}:`, message);
  const error = new Error(`Daten konnten nicht geladen werden: ${url} (${message})`);
  if(lastError && typeof lastError === 'object'){
    error.cause = lastError;
  }
  throw error;
}

function notifyUiError(title, message){
  if(typeof window === 'undefined' || typeof document === 'undefined' || typeof document.createElement !== 'function'){
    console.warn(`${LOG_PREFIX} Skipping UI error feedback (environment missing DOM APIs): ${title} - ${message}`);
    return;
  }
  import('../core/errorHandler.js').then(mod=>{
    try{
      mod.showError?.(title, message, 8000);
    }catch(err){
      console.warn(`${LOG_PREFIX} Failed to display UI error message:`, err?.message || err);
    }
  }).catch(err=>{
    console.warn(`${LOG_PREFIX} Failed to load error handler for UI feedback:`, err?.message || err);
  });
}

const THUMBNAIL_API_ROOT = '/api/thumbnails';

function buildThumbnailUrl(type, segments){
  let decodeWarned = false;
  const encodedSegments = segments.map(segment => {
    try{
      return encodeURIComponent(decodeURIComponent(segment));
    }catch(err){
      if(!decodeWarned){
        decodeWarned = true;
        console.warn(`${LOG_PREFIX} Failed to normalize thumbnail segment "${segment}":`, err?.message || err);
      }
      return encodeURIComponent(segment);
    }
  });
  const suffix = encodedSegments.join('/');
  const path = `${THUMBNAIL_API_ROOT}/${type}${suffix ? `/${suffix}` : ''}`;
  return buildApiPath(path);
}

export function prefixThumbValue(value, type){
  const raw = value == null ? '' : String(value).trim();
  if(!raw) return '';
  if(raw.startsWith('//') || SCHEME_RE.test(raw)) return raw;
  if(raw.startsWith('/api/')) return raw;
  if(raw.startsWith('/')){
    return buildThumbnailUrl(type, [raw]);
  }

  const normalizedRaw = raw.replace(/\\/g, '/');
  const segments = normalizedRaw.split('/');
  const normalizedSegments = [];
  for(const segment of segments){
    if(!segment || segment === '.') continue;
    if(segment === '..'){
      if(normalizedSegments.length) normalizedSegments.pop();
      continue;
    }
    normalizedSegments.push(segment);
  }
  if(normalizedSegments.length > 1 && normalizedSegments[0] === type){
    normalizedSegments.shift();
  }

  if(!normalizedSegments.length){
    return buildThumbnailUrl(type, []);
  }

  return buildThumbnailUrl(type, normalizedSegments);
}


export function prefixThumb(obj, type){
  if(!obj || typeof obj !== 'object') return obj;
  const current = obj.thumbFile ?? obj.thumb ?? '';
  const prefixed = prefixThumbValue(current, type);
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
  return prefixThumb(obj, 'movies');
}

export function prefixShowThumb(obj){
  return prefixThumb(obj, 'series');
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
  const url = buildApiPath('/api/v1/movies');
  try {
    const payload = await fetchJson(url);
    const rawMovies = Array.isArray(payload) ? payload : [];
    let movies;
    try{
      movies = validateLibraryList(rawMovies, 'movie');
    }catch(validationError){
      const message = validationError?.message || 'Unbekannte Validierungsfehler';
      console.warn(`${LOG_PREFIX} Movie validation failed:`, validationError);
      const error = new Error(`Ungültige Filmdaten: ${message}`);
      if(validationError instanceof Error){
        error.cause = validationError;
      }
      throw error;
    }
    markSource('movies', `api:${url}`);
    return normalizeMovieThumbs(movies);
  } catch (error) {
    console.error(`${LOG_PREFIX} loadMovies failed:`, error);
    notifyUiError('Filme konnten nicht geladen werden', error?.message || 'Unbekannter Fehler');
    markSource('movies', 'error');
    return [];
  }
}

export async function loadShows(){
  const url = buildApiPath('/api/v1/series');
  try {
    const payload = await fetchJson(url);
    const rawShows = Array.isArray(payload) ? payload : [];
    let shows;
    try{
      shows = validateLibraryList(rawShows, 'show');
    }catch(validationError){
      const message = validationError?.message || 'Unbekannte Validierungsfehler';
      console.warn(`${LOG_PREFIX} Show validation failed:`, validationError);
      const error = new Error(`Ungültige Seriendaten: ${message}`);
      if(validationError instanceof Error){
        error.cause = validationError;
      }
      throw error;
    }
    markSource('shows', `api:${url}`);
    return normalizeShowThumbs(shows);
  } catch (error) {
    console.error(`${LOG_PREFIX} loadShows failed:`, error);
    notifyUiError('Serien konnten nicht geladen werden', error?.message || 'Unbekannter Fehler');
    markSource('shows', 'error');
    return [];
  }
}

function resolveApiBase(){
  try{
    if(typeof window !== 'undefined'){
      const override =
        window.PLEX_EXPORTER_API_BASE ||
        window.__PLEX_EXPORTER_API_BASE ||
        window?.__PLEX_EXPORTER__?.apiBase ||
        window?.__PLEX_EXPORTER__?.config?.apiBase;
      if(typeof override === 'string' && override.trim()){
        return String(override).trim().replace(/\/$/, '');
      }
    }
  }catch(err){
    console.warn(`${LOG_PREFIX} Unable to read window API base override:`, err?.message || err);
  }
  try{
    if(typeof window !== 'undefined' && window.location){
      return '';
    }
  }catch(err){
    console.warn(`${LOG_PREFIX} Unable to inspect window.location:`, err?.message || err);
  }

  try{
    const globalLocation = typeof globalThis !== 'undefined' ? globalThis.location : undefined;
    if(globalLocation && typeof globalLocation === 'object'){
      if(typeof globalLocation.origin === 'string' && globalLocation.origin){
        return globalLocation.origin.replace(/\/$/, '');
      }
      const protocol = typeof globalLocation.protocol === 'string' ? globalLocation.protocol : '';
      const host = typeof globalLocation.host === 'string' ? globalLocation.host : '';
      if(protocol && host){
        return `${protocol}//${host}`.replace(/\/$/, '');
      }
    }
  }catch(err){
    console.warn(`${LOG_PREFIX} Unable to resolve global location:`, err?.message || err);
  }

  try{
    if(typeof process !== 'undefined' && process?.env){
      const envBase =
        process.env.PLEX_EXPORTER_API_BASE ||
        process.env.PLEX_EXPORTER_BASE_URL ||
        process.env.PUBLIC_URL ||
        process.env.APP_ORIGIN ||
        '';
      if(envBase){
        return String(envBase).replace(/\/$/, '');
      }
    }
  }catch(err){
    console.warn(`${LOG_PREFIX} Unable to resolve API base from env:`, err?.message || err);
  }

  return 'http://localhost';
}

function resolveSortConfig(sort){
  const value = typeof sort === 'string' ? sort.trim() : '';
  switch(value){
    case 'title-desc':
      return { sortBy: 'title', sortOrder: 'desc' };
    case 'year-asc':
      return { sortBy: 'year', sortOrder: 'asc' };
    case 'year-desc':
      return { sortBy: 'year', sortOrder: 'desc' };
    case 'added-desc':
      return { sortBy: 'added', sortOrder: 'desc' };
    case 'title-asc':
    default:
      return { sortBy: 'title', sortOrder: 'asc' };
  }
}

export async function fetchCatalogFacets(){
  const collectItems = async (mediaType) => {
    const limit = 250;
    let offset = 0;
    const collected = [];
    for(let guard = 0; guard < 20; guard += 1){
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      if(mediaType){
        params.set('type', mediaType);
      }
      const url = buildApiPath('/api/v1/filter', params);
      const data = await fetchJson(url, 1, true);
      if(!data || typeof data !== 'object'){
        break;
      }
      const chunk = Array.isArray(data.items) ? data.items : [];
      chunk.forEach(entry => {
        const normalized = normalizeApiLibraryEntry(entry, mediaType === 'tv' ? 'show' : 'movie');
        if(normalized) collected.push(normalized);
      });
      const pagination = data.pagination || {};
      if(!pagination.hasMore){
        break;
      }
      offset += limit;
    }
    return collected;
  };

  const [movies, shows] = await Promise.all([
    collectItems('movie'),
    collectItems('tv'),
  ]);
  return computeFacets(movies, shows);
}

export async function searchLibrary(kind, filters = {}, options = {}){
  const params = new URLSearchParams();
  const normalizedKind = (()=>{
    if(kind === 'all') return 'all';
    if(kind === 'shows' || kind === 'show' || kind === 'series') return 'show';
    return 'movie';
  })();
  const resolvePositiveInt = (value, { min = 1, max, fallback }) => {
    const num = Number(value);
    if(!Number.isFinite(num)) return fallback;
    const int = Math.floor(num);
    if(int < min) return fallback;
    if(Number.isFinite(max) && max != null && int > max) return max;
    return int;
  };

  const normalizedPageSize = resolvePositiveInt(options.pageSize, {
    min: 1,
    max: MAX_PAGE_SIZE,
    fallback: DEFAULT_PAGE_SIZE,
  });
  const normalizedPage = resolvePositiveInt(options.page, {
    min: 1,
    max: MAX_PAGE,
    fallback: 1,
  });

  const { query, onlyNew, yearFrom, yearTo, genres, collection, sort, newDays } = filters || {};

  const limit = normalizedPageSize;
  const offset = (normalizedPage - 1) * normalizedPageSize;
  params.set('limit', String(limit));
  params.set('offset', String(offset));

  if(normalizedKind === 'movie'){
    params.set('type', 'movie');
  }else if(normalizedKind === 'show'){
    params.set('type', 'tv');
  }

  if(typeof query === 'string' && query.trim()) params.set('search', query.trim());
  if(Number.isFinite(yearFrom)) params.set('yearFrom', String(yearFrom));
  if(Number.isFinite(yearTo)) params.set('yearTo', String(yearTo));
  if(Array.isArray(genres) && genres.length) params.set('genres', genres.join(','));
  if(typeof collection === 'string' && collection.trim()) params.set('collection', collection.trim());
  if(onlyNew){
    params.set('onlyNew', '1');
    if(Number.isFinite(newDays) && newDays > 0){
      params.set('newDays', String(Math.floor(newDays)));
    }
  }else if(Number.isFinite(newDays) && newDays > 0){
    params.set('newDays', String(Math.floor(newDays)));
  }

  const sortConfig = resolveSortConfig(sort);
  params.set('sortBy', sortConfig.sortBy);
  params.set('sortOrder', sortConfig.sortOrder);

  const url = buildApiPath('/api/v1/filter', params);
  const data = await fetchJson(url, 1, false);
  const rawItems = data && typeof data === 'object' && Array.isArray(data.items) ? data.items : [];
  const normalizedItems = rawItems
    .map(entry => normalizeApiLibraryEntry(entry))
    .filter(Boolean);
  const pagination = data && typeof data === 'object' && data.pagination ? data.pagination : {};
  const totalRaw = Number(pagination.total);
  const total = Number.isFinite(totalRaw) && totalRaw >= 0 ? totalRaw : normalizedItems.length;
  const limitRaw = Number(pagination.limit);
  const resolvedLimit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : limit;
  const offsetRaw = Number(pagination.offset);
  const resolvedOffset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? Math.floor(offsetRaw) : offset;
  const page = resolvedLimit > 0 ? Math.floor(resolvedOffset / resolvedLimit) + 1 : normalizedPage;
  const hasMore = Boolean(pagination.hasMore);

  return {
    items: normalizedItems,
    total,
    page,
    pageSize: resolvedLimit,
    hasMore,
    pagination: {
      total,
      limit: resolvedLimit,
      offset: resolvedOffset,
      hasMore,
    },
  };
}

function resolveShowDetailId(item){
  if(!item || typeof item !== 'object') return '';
  if(item.ratingKey != null) return String(item.ratingKey);
  if(item.plexId != null) return String(item.plexId);
  if(item.id != null) return String(item.id);
  const href = typeof item.href === 'string' ? item.href : '';
  if(href){
    const apiMatch = href.match(/\/api\/v1\/series\/([^/?#]+)/i);
    if(apiMatch && apiMatch[1]) return decodeURIComponent(apiMatch[1]);
    const legacyMatch = href.match(/series\/(?:details\/)?([^/?#]+)/i);
    if(legacyMatch && legacyMatch[1]) return decodeURIComponent(legacyMatch[1].replace(/\.json$/, ''));
  }
  return '';
}

export async function loadShowDetail(item){
  if(!item) return null;
  const keys = cacheKeys(item);
  const cached = getCachedDetail(keys);
  if(cached !== undefined) return cached;

  const id = resolveShowDetailId(item);
  if(!id){
    console.warn(`${LOG_PREFIX} Cannot resolve show detail id for item`, item);
    storeDetail(keys, null, item);
    return null;
  }

  const encodedId = encodeURIComponent(id);
  const path = `/api/v1/series/${encodedId}`;
  const url = buildApiPath(path);

  try {
    const data = await fetchJson(url);
    if(data && typeof data === 'object'){
      const normalized = normalizeShowDetail(data);
      storeDetail(keys, normalized, item);
      markSource(`show-detail:${id}`, `api:${path}`);
      return cloneDetail(normalized);
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Could not load show detail for ${item.title || id}`, error);
    notifyUiError('Details konnten nicht geladen werden', error?.message || 'Bitte später erneut versuchen.');
    markSource(`show-detail:${id}`, 'error');
    storeDetail(keys, null, item);
    return null;
  }

  storeDetail(keys, null, item);
  markSource(`show-detail:${id}`, 'empty');
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

export function resetDataCachesForTest(){
  showDetailCache.clear();
  lastSources = { movies: null, shows: null };
}
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

function normalizeShowDetail(data){
  if(!data || typeof data !== 'object') return null;
  const show = { ...data };
  prefixShowThumb(show);
  show.genres = normalizeGenres(show.genres);
  const castList = normalizePeople(show.cast || show.roles || []);
  castList.forEach(person => {
    if(!person || typeof person !== 'object') return;
    if(person.photo && !person.thumb && !person.thumbFile){
      person.thumb = person.photo;
    }
    if(person.thumb || person.thumbFile){
      prefixShowThumb(person);
    }
  });
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
  return list
    .map(entry => {
      if(!entry) return null;
      if(typeof entry === 'string'){
        const tag = entry.trim();
        if(!tag) return null;
        return { tag, name: tag };
      }
      if(typeof entry !== 'object') return null;
      const clone = { ...entry };
      const tag = String(clone.tag || clone.name || clone.role || clone.character || '').trim();
      if(tag){
        clone.tag = tag;
        if(!clone.name) clone.name = tag;
      }
      if(typeof clone.character === 'string' && !clone.role){
        const character = clone.character.trim();
        if(character) clone.role = character;
      }
      if(clone.photo && !clone.thumb && !clone.thumbFile){
        clone.thumb = clone.photo;
      }
      if(clone.thumbFile && !clone.thumb){
        clone.thumb = clone.thumbFile;
      }
      if(clone.order != null && !Number.isFinite(Number(clone.order))){
        delete clone.order;
      }
      return clone;
    })
    .filter(Boolean);
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
