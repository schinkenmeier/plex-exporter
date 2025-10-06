const LOG_PREFIX = '[hero:storage]';
const POOL_PREFIX = 'heroPool:';
const HISTORY_PREFIX = 'heroHistory:';
const MEMORY_PREFIX = 'heroMemory:';
const FAILURE_PREFIX = 'heroFailures:';
const SESSION_SUFFIX = ':session';
const HISTORY_LIMIT = 80;
const HISTORY_WINDOW_MS = 1000 * 60 * 60 * 24 * 14; // 14 days
const MEMORY_LIMIT = 120;
const FAILURE_LIMIT = 80;

function now(){
  return Date.now();
}

function safeArea(name){
  try {
    if(typeof globalThis !== 'undefined' && globalThis[name]){
      return globalThis[name];
    }
  } catch (err) {
    console.warn(LOG_PREFIX, `Failed to resolve storage area ${name}:`, err?.message || err);
  }
  return null;
}

function readRaw(area, key){
  if(!area) return null;
  try {
    return area.getItem(key);
  } catch (err) {
    console.warn(LOG_PREFIX, `Failed to read ${key} from storage:`, err?.message || err);
    return null;
  }
}

function writeRaw(area, key, value){
  if(!area) return;
  try {
    if(value == null){
      area.removeItem(key);
    } else {
      area.setItem(key, value);
    }
  } catch (err) {
    console.warn(LOG_PREFIX, `Failed to write ${key} to storage:`, err?.message || err);
  }
}

function parseJson(raw){
  if(!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn(LOG_PREFIX, 'Failed to parse storage JSON:', err?.message || err);
    return null;
  }
}

function stringifyJson(value){
  try {
    return JSON.stringify(value);
  } catch (err) {
    console.warn(LOG_PREFIX, 'Failed to stringify storage payload:', err?.message || err);
    return null;
  }
}

function normalizeKind(kind){
  if(kind === 'shows' || kind === 'show' || kind === 'series') return 'series';
  return 'movies';
}

function poolKey(kind){
  return `${POOL_PREFIX}${normalizeKind(kind)}`;
}

function sessionPoolKey(kind){
  return `${poolKey(kind)}${SESSION_SUFFIX}`;
}

function historyKey(kind){
  return `${HISTORY_PREFIX}${normalizeKind(kind)}`;
}

function memoryKey(kind){
  return `${MEMORY_PREFIX}${normalizeKind(kind)}`;
}

function failureKey(kind){
  return `${FAILURE_PREFIX}${normalizeKind(kind)}`;
}

function readPoolFrom(area, key){
  const raw = readRaw(area, key);
  if(!raw) return null;
  const parsed = parseJson(raw);
  if(!parsed || typeof parsed !== 'object') return null;
  return parsed;
}

function writePoolTo(area, key, payload){
  const json = stringifyJson(payload);
  if(json == null) return;
  writeRaw(area, key, json);
}

function readMemory(kind){
  const { local } = resolveAreas();
  const key = memoryKey(kind);
  const raw = readPoolFrom(local, key);
  if(!Array.isArray(raw)) return [];
  return raw.map(entry => ({
    id: typeof entry?.id === 'string' ? entry.id : String(entry?.id || ''),
    ts: Number(entry?.ts ?? entry?.timestamp ?? entry?.time ?? 0),
    slot: typeof entry?.slot === 'string' ? entry.slot : (entry?.slot != null ? String(entry.slot) : undefined)
  })).filter(entry => entry.id && Number.isFinite(entry.ts));
}

function writeMemory(kind, entries){
  const payload = Array.isArray(entries) ? entries.map(entry => ({
    id: entry.id,
    ts: entry.ts,
    slot: entry.slot
  })) : [];
  const json = stringifyJson(payload);
  if(json == null) return;
  const { local, session } = resolveAreas();
  const key = memoryKey(kind);
  writeRaw(local, key, json);
  writeRaw(session, `${key}${SESSION_SUFFIX}`, json);
}

function readFailures(kind){
  const { local } = resolveAreas();
  const key = failureKey(kind);
  const raw = readPoolFrom(local, key);
  if(!Array.isArray(raw)) return [];
  return raw.map(entry => ({
    id: typeof entry?.id === 'string' ? entry.id : String(entry?.id || ''),
    ts: Number(entry?.ts ?? entry?.timestamp ?? entry?.time ?? 0),
    reason: typeof entry?.reason === 'string' ? entry.reason : '',
    hits: Number(entry?.hits) || 0
  })).filter(entry => entry.id && Number.isFinite(entry.ts));
}

function writeFailures(kind, entries){
  const payload = Array.isArray(entries) ? entries.map(entry => ({
    id: entry.id,
    ts: entry.ts,
    reason: entry.reason || '',
    hits: Number(entry.hits) || 0
  })) : [];
  const json = stringifyJson(payload);
  if(json == null) return;
  const { local, session } = resolveAreas();
  const key = failureKey(kind);
  writeRaw(local, key, json);
  writeRaw(session, `${key}${SESSION_SUFFIX}`, json);
}

function resolveAreas(){
  return {
    local: safeArea('localStorage'),
    session: safeArea('sessionStorage')
  };
}

function clonePoolData(data){
  if(!data || typeof data !== 'object') return null;
  const copy = {
    kind: normalizeKind(data.kind || data.library || data.type),
    items: Array.isArray(data.items) ? data.items.slice() : [],
    updatedAt: Number(data.updatedAt) || now(),
    expiresAt: Number(data.expiresAt) || 0,
    policyHash: typeof data.policyHash === 'string' ? data.policyHash : '',
    slotSummary: data.slotSummary && typeof data.slotSummary === 'object' ? { ...data.slotSummary } : {},
    meta: data.meta && typeof data.meta === 'object' ? { ...data.meta } : undefined
  };
  if(data.generatedAt && !copy.updatedAt){
    copy.updatedAt = Number(data.generatedAt) || copy.updatedAt;
  }
  return copy;
}

export function getStoredPool(kind, { now: nowTs = now(), policyHash = null, allowExpired = false } = {}){
  const { local, session } = resolveAreas();
  const key = poolKey(kind);
  const sessionKey = sessionPoolKey(kind);
  const sessionPool = readPoolFrom(session, sessionKey);
  const localPool = readPoolFrom(local, key);
  const source = sessionPool || localPool || null;
  if(!source) return null;
  const pool = clonePoolData(source);
  if(!pool) return null;
  const expiry = Number(pool.expiresAt) || 0;
  const valid = expiry > nowTs;
  const matchesPolicy = policyHash ? pool.policyHash === policyHash : true;
  if(!allowExpired && !valid) return null;
  if(policyHash && !matchesPolicy) return null;
  pool.isExpired = !valid;
  pool.matchesPolicy = matchesPolicy;
  pool.source = sessionPool ? 'session' : 'local';
  return pool;
}

export function storePool(kind, data){
  const { local, session } = resolveAreas();
  if(!data || typeof data !== 'object'){
    invalidatePool(kind);
    return;
  }
  const payload = clonePoolData({ ...data, kind });
  if(!payload) return;
  const key = poolKey(kind);
  const sessionKey = sessionPoolKey(kind);
  const json = stringifyJson(payload);
  if(json == null) return;
  writeRaw(local, key, json);
  writeRaw(session, sessionKey, json);
}

export function invalidatePool(kind){
  const { local, session } = resolveAreas();
  const key = poolKey(kind);
  const sessionKey = sessionPoolKey(kind);
  writeRaw(local, key, null);
  writeRaw(session, sessionKey, null);
}

function readHistory(kind){
  const { local } = resolveAreas();
  const key = historyKey(kind);
  const raw = readPoolFrom(local, key);
  if(!Array.isArray(raw)) return [];
  return raw.map(entry => ({
    id: typeof entry?.id === 'string' ? entry.id : String(entry?.id || ''),
    ts: Number(entry?.ts ?? entry?.timestamp ?? entry?.time ?? entry?.at)
  })).filter(entry => entry.id && Number.isFinite(entry.ts));
}

function writeHistory(kind, entries){
  const { local, session } = resolveAreas();
  const key = historyKey(kind);
  const payload = Array.isArray(entries) ? entries.map(entry => ({ id: entry.id, ts: entry.ts })) : [];
  const json = stringifyJson(payload);
  if(json == null) return;
  writeRaw(local, key, json);
  writeRaw(session, `${key}${SESSION_SUFFIX}`, json);
}

function resolveEntryKey(entry){
  if(!entry) return null;
  if(typeof entry === 'string') return entry.trim() || null;
  if(typeof entry === 'number') return `#${entry}`;
  if(entry && typeof entry === 'object'){
    if(entry.poolId != null) return String(entry.poolId);
    if(entry.poolEntryId != null) return String(entry.poolEntryId);
    if(entry.heroId != null) return String(entry.heroId);
    if(entry.cta && entry.cta.id != null) return String(entry.cta.id);
    if(entry.ids && typeof entry.ids === 'object'){
      if(entry.ids.imdb) return `imdb:${entry.ids.imdb}`;
      if(entry.ids.tmdb) return `tmdb:${entry.ids.tmdb}`;
      if(entry.ids.tvdb) return `tvdb:${entry.ids.tvdb}`;
    }
    if(entry.guid) return String(entry.guid);
    if(entry.ratingKey != null) return `rk:${entry.ratingKey}`;
    if(entry.id != null) return String(entry.id);
    if(entry.slug) return String(entry.slug);
    if(entry.key) return String(entry.key);
    if(entry.title){
      const suffix = entry.year ? `:${entry.year}` : '';
      return `title:${entry.title}${suffix}`;
    }
  }
  return null;
}

function resolveHistoryId(entry){
  return resolveEntryKey(entry);
}

export function recordHeroHistory(kind, entry, { timestamp = now(), limit = HISTORY_LIMIT } = {}){
  const id = resolveHistoryId(entry);
  if(!id) return null;
  const list = readHistory(kind);
  const filtered = list.filter(item => item.id !== id);
  filtered.unshift({ id, ts: timestamp });
  const pruned = filtered
    .filter(item => timestamp - item.ts <= HISTORY_WINDOW_MS)
    .slice(0, Math.max(1, limit));
  writeHistory(kind, pruned);
  return pruned;
}

export function getHeroHistory(kind, { now: nowTs = now(), windowMs = HISTORY_WINDOW_MS, limit = HISTORY_LIMIT } = {}){
  const list = readHistory(kind);
  if(!list.length) return { entries: [], set: new Set() };
  const threshold = nowTs - Math.max(0, windowMs);
  const seen = new Set();
  const entries = [];
  for(const item of list){
    if(!item || !item.id) continue;
    if(item.ts < threshold) continue;
    if(seen.has(item.id)) continue;
    seen.add(item.id);
    entries.push({ id: item.id, ts: item.ts });
    if(entries.length >= limit) break;
  }
  return { entries, set: seen };
}

export function recordHeroMemory(kind, entries, { timestamp = now(), ttlMs = 0, limit = MEMORY_LIMIT } = {}){
  if(!Array.isArray(entries) || !entries.length) return [];
  const threshold = ttlMs > 0 ? Math.max(0, timestamp - ttlMs) : 0;
  const list = readMemory(kind);
  const seen = new Set();
  const preserved = [];
  for(const item of list){
    if(!item || !item.id) continue;
    if(threshold && item.ts < threshold) continue;
    if(seen.has(item.id)) continue;
    seen.add(item.id);
    preserved.push(item);
  }
  const additions = [];
  const additionIds = new Set();
  for(const entry of entries){
    const id = resolveEntryKey(entry);
    if(!id) continue;
    const slot = typeof entry?.slot === 'string' ? entry.slot : (entry?.poolSlot ? String(entry.poolSlot) : undefined);
    additions.push({ id, ts: timestamp, slot });
    additionIds.add(id);
  }
  const filteredPreserved = preserved.filter(item => !additionIds.has(item.id));
  const merged = [...additions, ...filteredPreserved].filter(item => item && item.id);
  const limited = merged.slice(0, Math.max(1, limit));
  const deduped = [];
  const finalSeen = new Set();
  for(const item of limited){
    if(finalSeen.has(item.id)) continue;
    finalSeen.add(item.id);
    deduped.push(item);
  }
  writeMemory(kind, deduped);
  return deduped;
}

export function getHeroMemory(kind, { now: nowTs = now(), windowMs = 0, limit = MEMORY_LIMIT } = {}){
  const list = readMemory(kind);
  if(!list.length) return { entries: [], set: new Set() };
  const threshold = windowMs > 0 ? Math.max(0, nowTs - windowMs) : 0;
  const seen = new Set();
  const entries = [];
  for(const item of list){
    if(!item || !item.id) continue;
    if(threshold && item.ts < threshold) continue;
    if(seen.has(item.id)) continue;
    seen.add(item.id);
    entries.push({ id: item.id, ts: item.ts, slot: item.slot });
    if(entries.length >= limit) break;
  }
  return { entries, set: seen };
}

export function clearHeroMemory(kind){
  const { local, session } = resolveAreas();
  const key = memoryKey(kind);
  writeRaw(local, key, null);
  writeRaw(session, `${key}${SESSION_SUFFIX}`, null);
}

export function recordHeroFailure(kind, entry, { timestamp = now(), ttlMs = 0, limit = FAILURE_LIMIT, reason = '' } = {}){
  const id = resolveEntryKey(entry);
  if(!id) return null;
  const threshold = ttlMs > 0 ? Math.max(0, timestamp - ttlMs) : 0;
  const list = readFailures(kind);
  const filtered = [];
  let hits = 0;
  for(const item of list){
    if(!item || !item.id) continue;
    if(item.id === id){
      hits = (item.hits || 0) + 1;
      continue;
    }
    if(threshold && item.ts < threshold) continue;
    filtered.push(item);
  }
  const payload = { id, ts: timestamp, reason: reason || '', hits };
  filtered.unshift(payload);
  const limited = filtered.slice(0, Math.max(1, limit));
  writeFailures(kind, limited);
  return payload;
}

export function resolveHeroFailure(kind, entry){
  const id = resolveEntryKey(entry);
  if(!id) return;
  const list = readFailures(kind);
  const filtered = list.filter(item => item && item.id !== id);
  if(filtered.length === list.length) return;
  writeFailures(kind, filtered);
}

export function getHeroFailures(kind, { now: nowTs = now(), windowMs = 0, limit = FAILURE_LIMIT } = {}){
  const list = readFailures(kind);
  if(!list.length) return { entries: [], set: new Set() };
  const threshold = windowMs > 0 ? Math.max(0, nowTs - windowMs) : 0;
  const seen = new Set();
  const entries = [];
  for(const item of list){
    if(!item || !item.id) continue;
    if(threshold && item.ts < threshold) continue;
    if(seen.has(item.id)) continue;
    seen.add(item.id);
    entries.push({ id: item.id, ts: item.ts, reason: item.reason || '', hits: item.hits || 0 });
    if(entries.length >= limit) break;
  }
  return { entries, set: seen };
}

export function clearHeroFailures(kind){
  const { local, session } = resolveAreas();
  const key = failureKey(kind);
  writeRaw(local, key, null);
  writeRaw(session, `${key}${SESSION_SUFFIX}`, null);
}

export default {
  getStoredPool,
  storePool,
  invalidatePool,
  recordHeroHistory,
  getHeroHistory,
  recordHeroMemory,
  getHeroMemory,
  clearHeroMemory,
  recordHeroFailure,
  resolveHeroFailure,
  getHeroFailures,
  clearHeroFailures
};
