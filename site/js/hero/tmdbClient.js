const API_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p/';
const APPEND_FIELDS = 'images,release_dates,content_ratings,credits';
const STORAGE_KEY = 'hero.tmdbCache.v1';
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours
const MAX_CACHE_ENTRIES = 60;
const MIN_REQUEST_INTERVAL = 400; // ms
const MAX_RETRIES = 4;
const BASE_RETRY_DELAY = 400; // ms
const RETRY_DELAY_CAP = 8000; // ms
const RATE_LIMIT_BASE_DELAY = 1200; // ms
const RATE_LIMIT_CAP = 60000; // ms
const MAX_RATE_LIMIT_STRIKES = 5;
const RATE_LIMIT_RECOVERY_WINDOW = 90_000; // ms
const PENALTY_DECAY_STEP = 1;
const LOG_PREFIX = '[hero:tmdbClient]';

let memoryCache = new Map();
let cacheLoaded = false;
let persistTimer = null;
let lastRequestAt = 0;
let configPromise = null;
let cachedConfig = {};
let throttlePenaltyUntil = 0;
let rateLimitState = {
  active: false,
  until: 0,
  retryAfterMs: 0,
  lastStatus: null,
  lastHitAt: 0,
  strikes: 0
};
const rateLimitListeners = new Set();

function logWarn(...args){
  try {
    console.warn(LOG_PREFIX, ...args);
  } catch (_err) {
    // ignore
  }
}

function now(){ return Date.now(); }

function delay(ms){
  return new Promise(resolve => setTimeout(resolve, Math.max(0, ms || 0)));
}

function shallowEqual(a, b){
  if(a === b) return true;
  if(!a || !b) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if(keysA.length !== keysB.length) return false;
  for(const key of keysA){
    if(a[key] !== b[key]) return false;
  }
  return true;
}

function getRateLimitSnapshot(){
  return {
    active: !!rateLimitState.active,
    until: Number(rateLimitState.until) || 0,
    retryAfterMs: Number(rateLimitState.retryAfterMs) || 0,
    lastStatus: rateLimitState.lastStatus ?? null,
    lastHitAt: Number(rateLimitState.lastHitAt) || 0,
    strikes: Number(rateLimitState.strikes) || 0
  };
}

function notifyRateLimitListeners(){
  const snapshot = getRateLimitSnapshot();
  for(const listener of rateLimitListeners){
    try {
      listener(snapshot);
    } catch (err) {
      logWarn('Rate limit listener failed:', err?.message || err);
    }
  }
}

function updateRateLimitState(patch){
  const next = { ...getRateLimitSnapshot(), ...patch };
  if(shallowEqual(rateLimitState, next)) return rateLimitState;
  rateLimitState = next;
  notifyRateLimitListeners();
  return rateLimitState;
}

function computeRetryDelay(attempt){
  return Math.min(RETRY_DELAY_CAP, BASE_RETRY_DELAY * Math.pow(2, Math.max(0, attempt)));
}

function computeRateLimitDelay(strikes, fallback){
  const scaled = RATE_LIMIT_BASE_DELAY * Math.pow(2, Math.max(0, strikes - 1));
  const candidate = Math.max(fallback || 0, scaled);
  return Math.min(RATE_LIMIT_CAP, candidate);
}

function registerRateLimitHit(retryAfterMs, status = 429){
  const nowTs = now();
  const strikes = Math.min(MAX_RATE_LIMIT_STRIKES, (rateLimitState.strikes || 0) + 1);
  const delayMs = computeRateLimitDelay(strikes, retryAfterMs);
  throttlePenaltyUntil = Math.max(throttlePenaltyUntil, nowTs + delayMs);
  updateRateLimitState({
    active: true,
    strikes,
    retryAfterMs: delayMs,
    until: nowTs + delayMs,
    lastStatus: status,
    lastHitAt: nowTs
  });
  return delayMs;
}

function decayRateLimitStrikes(){
  if(!rateLimitState.strikes) return;
  const strikes = Math.max(0, rateLimitState.strikes - PENALTY_DECAY_STEP);
  updateRateLimitState({
    strikes,
    active: rateLimitState.active && rateLimitState.until > now()
  });
}

function refreshRateLimit(){
  const nowTs = now();
  if(rateLimitState.active && nowTs >= rateLimitState.until){
    updateRateLimitState({ active: false, retryAfterMs: 0, until: 0 });
  } else if(!rateLimitState.active && rateLimitState.strikes > 0 && nowTs - rateLimitState.lastHitAt > RATE_LIMIT_RECOVERY_WINDOW){
    updateRateLimitState({ strikes: Math.max(0, rateLimitState.strikes - PENALTY_DECAY_STEP) });
  }
  if(throttlePenaltyUntil && nowTs >= throttlePenaltyUntil){
    throttlePenaltyUntil = 0;
  }
}

function getCacheKey(type, id, language){
  const t = (type === 'tv') ? 'tv' : 'movie';
  const lang = String(language || 'en-US').trim() || 'en-US';
  return `${t}:${String(id || '').trim()}:${lang}`;
}

function ensureCacheLoaded(){
  if(cacheLoaded) return;
  cacheLoaded = true;
  if(typeof localStorage === 'undefined') return;
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return;
  } catch (err) {
    logWarn('Failed to read TMDB cache from storage:', err?.message || err);
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    logWarn('Stored TMDB cache invalid JSON:', err?.message || err);
    return;
  }
  if(!Array.isArray(parsed)) return;
  const nowTs = now();
  parsed.forEach(([key, entry]) => {
    if(!key || !entry) return;
    const ts = Number(entry.ts ?? entry.timestamp ?? entry.fetchedAt);
    if(!Number.isFinite(ts)) return;
    if(nowTs - ts > CACHE_TTL) return;
    memoryCache.set(String(key), { ts, data: entry.data ?? entry.payload ?? null });
  });
}

function pruneExpired(){
  const nowTs = now();
  let changed = false;
  for(const [key, entry] of memoryCache.entries()){
    if(!entry || typeof entry !== 'object'){ memoryCache.delete(key); changed = true; continue; }
    const ts = Number(entry.ts);
    if(!Number.isFinite(ts) || nowTs - ts > CACHE_TTL){ memoryCache.delete(key); changed = true; }
  }
  if(changed) schedulePersist();
}

function getCacheEntry(key){
  ensureCacheLoaded();
  const entry = memoryCache.get(key);
  if(!entry) return null;
  const ts = Number(entry.ts);
  if(!Number.isFinite(ts) || now() - ts > CACHE_TTL){
    memoryCache.delete(key);
    schedulePersist();
    return null;
  }
  return entry;
}

function setCacheEntry(key, data){
  ensureCacheLoaded();
  memoryCache.set(key, { ts: now(), data });
  pruneOverflow();
  schedulePersist();
}

function pruneOverflow(){
  if(memoryCache.size <= MAX_CACHE_ENTRIES) return;
  const entries = Array.from(memoryCache.entries());
  entries.sort((a, b) => {
    const at = Number(a[1]?.ts || 0);
    const bt = Number(b[1]?.ts || 0);
    return bt - at;
  });
  const trimmed = entries.slice(0, MAX_CACHE_ENTRIES);
  memoryCache = new Map(trimmed);
}

function schedulePersist(){
  if(typeof localStorage === 'undefined') return;
  if(persistTimer) return;
  persistTimer = setTimeout(()=>{
    persistTimer = null;
    persistCache();
  }, 120);
}

function persistCache(){
  if(typeof localStorage === 'undefined') return;
  const entries = Array.from(memoryCache.entries()).map(([key, entry])=>{
    return [key, { ts: entry?.ts ?? now(), data: entry?.data ?? null }];
  });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (err) {
    logWarn('Failed to persist TMDB cache:', err?.message || err);
  }
}

function parseRetryAfter(value){
  if(!value) return 0;
  const num = Number(value);
  if(Number.isFinite(num)) return Math.max(0, num * 1000);
  const date = Date.parse(value);
  if(Number.isFinite(date)) return Math.max(0, date - now());
  return 0;
}

function shouldRetryStatus(status){
  return status === 429 || (status >= 500 && status < 600);
}

function isAbortError(err){
  return err && (err.name === 'AbortError' || err.code === 'ABORT_ERR');
}

function shouldRetryError(err){
  if(isAbortError(err)) return false;
  if(err && typeof err === 'object'){
    if(err.name === 'TypeError' && /network/i.test(err.message || '')) return true;
    if(/network/i.test(err?.message || '')) return true;
  }
  return false;
}

function withAuth(url, auth){
  if(!auth || !auth.value) return { url, init: { headers: { 'Accept': 'application/json' } } };
  if(auth.kind === 'apikey'){
    const sep = url.includes('?') ? '&' : '?';
    return {
      url: `${url}${sep}api_key=${encodeURIComponent(auth.value)}`,
      init: { headers: { 'Accept': 'application/json' } }
    };
  }
  return {
    url,
    init: {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${auth.value}`
      }
    }
  };
}

async function throttle(){
  refreshRateLimit();
  const nowTs = now();
  const waitInterval = Math.max(0, (lastRequestAt + MIN_REQUEST_INTERVAL) - nowTs);
  const waitPenalty = Math.max(0, throttlePenaltyUntil - nowTs);
  const wait = Math.max(waitInterval, waitPenalty);
  if(wait > 0){
    await delay(wait);
  }
  lastRequestAt = now();
}

async function fetchJson(url, auth, { signal } = {}, attempt = 0){
  const { url: finalUrl, init } = withAuth(url, auth);
  const requestInit = { ...init, signal };
  await throttle();
  let response;
  try {
    response = await fetch(finalUrl, requestInit);
  } catch (err) {
    if(attempt < MAX_RETRIES && shouldRetryError(err)){
      const wait = computeRetryDelay(attempt);
      await delay(wait);
      return fetchJson(url, auth, { signal }, attempt + 1);
    }
    throw err;
  }
  if(!response.ok){
    const status = response.status;
    const retryable = shouldRetryStatus(status) && attempt < MAX_RETRIES;
    if(status === 429){
      const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
      const wait = registerRateLimitHit(retryAfter, status);
      if(retryable){
        await delay(wait);
        return fetchJson(url, auth, { signal }, attempt + 1);
      }
    } else if(retryable){
      const wait = computeRetryDelay(attempt);
      await delay(wait);
      return fetchJson(url, auth, { signal }, attempt + 1);
    }
    const text = await response.text().catch(()=> '');
    const err = new Error(`HTTP ${status}${text ? `: ${text}` : ''}`);
    err.status = status;
    if(status === 429) err.code = 'RATE_LIMIT';
    throw err;
  }
  decayRateLimitStrikes();
  refreshRateLimit();
  return response.json();
}

function classifyCredential(raw, forcedKind){
  if(!raw && raw !== 0) return null;
  const value = String(raw || '').trim();
  if(!value) return null;
  const kind = forcedKind || (/^[a-f0-9]{32}$/i.test(value) ? 'apikey' : 'bearer');
  return { kind, value };
}

function readLocalStorageToken(){
  if(typeof localStorage === 'undefined') return '';
  try {
    const token = localStorage.getItem('tmdbToken');
    return token || '';
  } catch (err) {
    logWarn('Failed to read tmdbToken from storage:', err?.message || err);
    return '';
  }
}

function parseCfg(text){
  if(!text) return {};
  const trimmed = text.trim();
  if(!trimmed) return {};
  if(trimmed.startsWith('{') || trimmed.startsWith('[')){
    try {
      const json = JSON.parse(trimmed);
      if(json && typeof json === 'object') return json;
    } catch (err) {
      logWarn('Failed to parse config.cfg JSON:', err?.message || err);
    }
  }
  const out = {};
  trimmed.split(/\r?\n/).forEach(line => {
    const clean = line.trim();
    if(!clean || clean.startsWith('#') || clean.startsWith(';')) return;
    const idx = clean.indexOf('=');
    if(idx === -1) return;
    const key = clean.slice(0, idx).trim();
    const value = clean.slice(idx + 1).trim();
    if(key) out[key] = value;
  });
  return out;
}

async function loadConfigCfg(){
  if(configPromise) return configPromise;
  configPromise = (async ()=>{
    if(typeof fetch !== 'function') return {};
    try {
      const response = await fetch('config.cfg', { cache: 'no-cache' });
      if(!response.ok){
        if(response.status !== 404){
          logWarn(`Failed to load config.cfg (HTTP ${response.status})`);
        }
        return {};
      }
      const text = await response.text();
      cachedConfig = parseCfg(text);
      return cachedConfig;
    } catch (err) {
      logWarn('Error loading config.cfg:', err?.message || err);
      return {};
    }
  })();
  return configPromise;
}

function extractCredentialFromSettings(settings){
  if(!settings || typeof settings !== 'object') return null;
  if(settings.tmdbToken){
    const token = classifyCredential(settings.tmdbToken, 'bearer');
    if(token) return { ...token, source: 'settings.tmdbToken' };
  }
  if(settings.tmdbApiKey){
    const key = classifyCredential(settings.tmdbApiKey, 'apikey');
    if(key) return { ...key, source: 'settings.tmdbApiKey' };
  }
  return null;
}

function extractCredentialFromLocalStorage(){
  const token = classifyCredential(readLocalStorageToken(), 'bearer');
  if(token) return { ...token, source: 'localStorage.tmdbToken' };
  return null;
}

function extractCredentialFromConfig(cfg){
  if(!cfg || typeof cfg !== 'object') return null;
  if(cfg.tmdbToken){
    const token = classifyCredential(cfg.tmdbToken, 'bearer');
    if(token) return { ...token, source: 'config.cfg.tmdbToken' };
  }
  if(cfg.tmdbApiKey){
    const key = classifyCredential(cfg.tmdbApiKey, 'apikey');
    if(key) return { ...key, source: 'config.cfg.tmdbApiKey' };
  }
  return null;
}

export async function resolveAuth(settings={}, options={}){
  if(options.credentials){
    if(typeof options.credentials === 'string' || typeof options.credentials === 'number'){
      const classified = classifyCredential(options.credentials);
      if(classified) return { ...classified, source: 'explicit' };
    } else if(options.credentials && typeof options.credentials === 'object' && options.credentials.value){
      const classified = classifyCredential(options.credentials.value, options.credentials.kind);
      if(classified) return { ...classified, source: options.credentials.source || 'explicit' };
    }
  }
  const fromSettings = extractCredentialFromSettings(settings);
  if(fromSettings) return fromSettings;
  const fromLocalStorage = extractCredentialFromLocalStorage();
  if(fromLocalStorage) return fromLocalStorage;
  if(settings && settings.tmdbApiKey){
    const key = classifyCredential(settings.tmdbApiKey, 'apikey');
    if(key) return { ...key, source: 'settings.tmdbApiKey' };
  }
  const cfg = await loadConfigCfg().catch(()=> (cachedConfig || {}));
  const fromCfg = extractCredentialFromConfig(cfg);
  if(fromCfg) return fromCfg;
  if(options.fallbackCredential){
    const fallback = classifyCredential(options.fallbackCredential);
    if(fallback) return { ...fallback, source: 'fallback' };
  }
  return null;
}

export function getRateLimitState(){
  return getRateLimitSnapshot();
}

export function addRateLimitListener(listener){
  if(typeof listener !== 'function') return () => {};
  rateLimitListeners.add(listener);
  try {
    listener(getRateLimitSnapshot());
  } catch (err) {
    logWarn('Rate limit listener threw during init:', err?.message || err);
  }
  return () => rateLimitListeners.delete(listener);
}

export function tmdbImageUrl(path, size='original'){
  const raw = typeof path === 'string' ? path : '';
  const trimmed = raw.trim();
  if(!trimmed) return '';
  const normalizedPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const variant = String(size || 'original').trim() || 'original';
  return `${IMG_BASE}${variant}${normalizedPath}`;
}

function cleanId(value){
  if(value == null) return '';
  const str = String(value).trim();
  return str;
}

export function clearCache(){
  memoryCache.clear();
  cacheLoaded = true;
  if(typeof localStorage !== 'undefined'){
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      logWarn('Failed to clear TMDB cache from storage:', err?.message || err);
    }
  }
}

export function getCached(type, id, language){
  const key = getCacheKey(type, id, language);
  const entry = getCacheEntry(key);
  return entry ? { data: entry.data, fetchedAt: entry.ts } : null;
}

export async function fetchDetails(type, id, options = {}){
  const normalizedType = type === 'tv' ? 'tv' : 'movie';
  const normalizedId = cleanId(id);
  if(!normalizedId) return null;
  const language = cleanId(options.language) || 'en-US';
  const key = getCacheKey(normalizedType, normalizedId, language);
  if(!options.forceRefresh){
    const cached = getCacheEntry(key);
    if(cached){
      return {
        id: normalizedId,
        type: normalizedType,
        language,
        data: cached.data,
        fetchedAt: cached.ts,
        source: 'cache'
      };
    }
  }
  const auth = options.auth || await resolveAuth(options.settings, options.authOptions || {});
  if(!auth){
    logWarn('TMDB credentials missing; cannot fetch details.');
    return null;
  }
  const url = `${API_BASE}/${normalizedType}/${encodeURIComponent(normalizedId)}?language=${encodeURIComponent(language)}&append_to_response=${APPEND_FIELDS}`;
  let data;
  try {
    data = await fetchJson(url, auth, { signal: options.signal });
  } catch (err) {
    logWarn(`Failed to fetch TMDB ${normalizedType}#${normalizedId}:`, err?.message || err);
    throw err;
  }
  setCacheEntry(key, data);
  const entry = getCacheEntry(key);
  return {
    id: normalizedId,
    type: normalizedType,
    language,
    data,
    fetchedAt: entry?.ts || now(),
    source: 'network'
  };
}

function extractRawTitle(item){
  if(!item || typeof item !== 'object') return '';
  const candidates = [item.title, item.name, item.originalTitle, item.original_name, item.original_title];
  for(const candidate of candidates){
    const str = typeof candidate === 'string' ? candidate.trim() : '';
    if(str) return str;
  }
  return '';
}

function parseYear(value){
  if(value == null) return null;
  const num = Number(value);
  if(Number.isFinite(num) && num > 1800) return Math.trunc(num);
  if(typeof value === 'string'){
    const match = value.match(/(19|20|21)\d{2}/);
    if(match) return Number(match[0]);
  }
  return null;
}

function extractRawYear(item){
  if(!item || typeof item !== 'object') return null;
  const direct = parseYear(item.year ?? item.startYear);
  if(direct) return direct;
  const dateCandidate = item.originallyAvailableAt || item.premieredAt || item.releaseDate || item.firstAirDate;
  const fromDate = parseYear(dateCandidate);
  if(fromDate) return fromDate;
  return null;
}

async function fetchByExternalId(type, imdbId, options){
  const language = options.language || 'en-US';
  const url = `${API_BASE}/find/${encodeURIComponent(imdbId)}?external_source=imdb_id&language=${encodeURIComponent(language)}`;
  const json = await fetchJson(url, options.auth, { signal: options.signal });
  const key = type === 'tv' ? 'tv_results' : 'movie_results';
  const results = Array.isArray(json?.[key]) ? json[key] : [];
  const hit = results.find(entry => entry && entry.id != null);
  if(!hit || hit.id == null) return null;
  const resolvedId = String(hit.id);
  const details = await fetchDetails(type, resolvedId, options);
  if(details){
    details.id = resolvedId;
    details.resolvedId = resolvedId;
  }
  return details;
}

function buildSearchUrl(type, title, language, year){
  const encodedTitle = encodeURIComponent(title);
  const lang = encodeURIComponent(language || 'en-US');
  const base = `${API_BASE}/search/${type}?query=${encodedTitle}&language=${lang}`;
  if(!year) return base;
  const param = type === 'tv' ? 'first_air_date_year' : 'year';
  return `${base}&${param}=${encodeURIComponent(String(year))}`;
}

async function fetchBySearch(type, title, year, options){
  if(!title) return null;
  const language = options.language || 'en-US';
  const url = buildSearchUrl(type, title, language, year);
  const json = await fetchJson(url, options.auth, { signal: options.signal });
  const results = Array.isArray(json?.results) ? json.results : [];
  if(!results.length) return null;
  const hit = results.find(entry => entry && entry.id != null) || results[0];
  if(!hit || hit.id == null) return null;
  const resolvedId = String(hit.id);
  const details = await fetchDetails(type, resolvedId, options);
  if(details){
    details.id = resolvedId;
    details.resolvedId = resolvedId;
  }
  return details;
}

function extractIds(item){
  const ids = { tmdb: '', imdb: '' };
  if(!item || typeof item !== 'object') return ids;
  const merge = (guid)=>{
    const raw = typeof guid === 'string' ? guid : guid?.id;
    if(!raw) return;
    const str = String(raw).trim();
    if(!str) return;
    const [schemePart, restPart] = str.split('://');
    if(!restPart){
      if(str.startsWith('tt')) ids.imdb = str;
      return;
    }
    const scheme = schemePart.toLowerCase();
    const rest = restPart.split('?')[0].replace(/^\//, '');
    const tail = rest.split('/').pop();
    if(scheme === 'imdb' || scheme.includes('imdb')){
      ids.imdb = tail || ids.imdb;
      return;
    }
    if(scheme === 'tmdb' || scheme.includes('themoviedb')){
      ids.tmdb = tail || ids.tmdb;
      return;
    }
  };
  if(item.ids && typeof item.ids === 'object'){
    if(item.ids.tmdb) ids.tmdb = cleanId(item.ids.tmdb);
    if(item.ids.imdb) ids.imdb = cleanId(item.ids.imdb);
  }
  merge(item.guid);
  if(Array.isArray(item.guids)) item.guids.forEach(merge);
  return ids;
}

function buildSearchTitleOverride(raw, options){
  const preferred = cleanId(options?.searchTitle);
  if(preferred) return preferred;
  return extractRawTitle(raw);
}

export async function fetchDetailsForItem(raw, options = {}){
  if(!raw || typeof raw !== 'object') return null;
  const type = raw.type === 'tv' ? 'tv' : 'movie';
  const language = cleanId(options.language) || 'en-US';
  const auth = options.auth || await resolveAuth(options.settings, options.authOptions || {});
  if(!auth){
    logWarn('Skipping TMDB lookup (missing credentials).');
    return null;
  }
  const baseOptions = { ...options, auth, language };
  const ids = extractIds(raw);
  const attempts = [];

  if(ids.tmdb){
    attempts.push({ label: 'direct id', fn: ()=> fetchDetails(type, ids.tmdb, baseOptions) });
  }
  if(ids.imdb){
    attempts.push({ label: 'imdb find', fn: ()=> fetchByExternalId(type, ids.imdb, baseOptions) });
  }
  const searchTitle = buildSearchTitleOverride(raw, options);
  if(searchTitle){
    const searchYear = options.searchYear ?? extractRawYear(raw);
    attempts.push({ label: 'search', fn: ()=> fetchBySearch(type, searchTitle, searchYear, baseOptions) });
  }

  for(const attempt of attempts){
    try {
      const result = await attempt.fn();
      if(result){
        if(!result.resolvedId && result.id) result.resolvedId = result.id;
        return result;
      }
    } catch (err) {
      logWarn(`TMDB ${attempt.label} lookup failed:`, err?.message || err);
    }
  }
  return null;
}

// Periodically prune expired entries
setInterval(()=>{ try { pruneExpired(); } catch(_err){} }, CACHE_TTL / 6).unref?.();

export default {
  fetchDetails,
  fetchDetailsForItem,
  resolveAuth,
  clearCache,
  getCached,
  tmdbImageUrl,
  getRateLimitState,
  addRateLimitListener
};
