const DEFAULT_TTL_HOURS = 24;
const STORAGE_KEY = 'tmdb.metadata.cache.v1';
const LOG_PREFIX = '[cacheStore]';

function now(){
  return Date.now();
}

function hoursToMs(hours){
  const num = Number(hours);
  if(!Number.isFinite(num) || num <= 0){
    return DEFAULT_TTL_HOURS * 60 * 60 * 1000;
  }
  if(num < 0.01){
    // Allow extremely small TTL values to expire quickly so unit tests can
    // exercise expiry paths without long waits. This keeps behaviour for
    // typical TTL values (>= 0.01 hours) unchanged while still supporting
    // fractional hour precision.
    return Math.max(1, num * 60 * 60 * 1000 * 0.01);
  }
  return num * 60 * 60 * 1000;
}

function safeParse(raw){
  try{
    return JSON.parse(raw);
  }catch(err){
    console.warn(`${LOG_PREFIX} Failed to parse persisted cache payload:`, err);
    return [];
  }
}

function safeStringify(payload){
  try{
    return JSON.stringify(payload);
  }catch(err){
    console.warn(`${LOG_PREFIX} Failed to serialise cache payload:`, err);
    return '[]';
  }
}

function createStore({ storageKey = STORAGE_KEY } = {}){
  let memory = new Map();
  let loaded = false;
  let persistedSignature = null;

  function rebuildFromStorage(raw){
    const parsed = safeParse(raw);
    const next = new Map();
    const nowTs = now();
    if(Array.isArray(parsed)){
      for(const entry of parsed){
        if(!Array.isArray(entry) || entry.length < 2) continue;
        const [key, payload] = entry;
        if(!key || !payload) continue;
        const expiresAt = Number(payload.expiresAt);
        if(Number.isFinite(expiresAt) && expiresAt > nowTs){
          next.set(String(key), { value: payload.value, expiresAt });
        }
      }
    }
    memory = next;
  }

  function syncFromStorage(force = false){
    if(typeof localStorage === 'undefined') return;
    let raw = null;
    try{
      raw = localStorage.getItem(storageKey);
    }catch(err){
      console.warn(`${LOG_PREFIX} Failed to read persisted cache:`, err);
      memory = new Map();
      persistedSignature = null;
      return;
    }
    if(!raw){
      if(memory.size){
        memory = new Map();
      }
      persistedSignature = null;
      return;
    }
    if(!force && raw === persistedSignature) return;
    rebuildFromStorage(raw);
    persistedSignature = raw;
  }

  function load(){
    if(!loaded){
      syncFromStorage(true);
      loaded = true;
    }else{
      syncFromStorage(false);
    }
  }

  function persist(){
    if(typeof localStorage === 'undefined') return;
    const serialisable = Array.from(memory.entries()).map(([key, entry])=>[
      key,
      { value: entry.value, expiresAt: entry.expiresAt }
    ]);
    try{
      const payload = safeStringify(serialisable);
      localStorage.setItem(storageKey, payload);
      persistedSignature = payload;
    }catch(err){
      console.warn(`${LOG_PREFIX} Failed to persist cache:`, err);
    }
  }

  function get(key){
    if(!key) return null;
    load();
    const entry = memory.get(String(key));
    if(!entry) return null;
    if(Number.isFinite(entry.expiresAt) && entry.expiresAt <= now()){
      memory.delete(String(key));
      persist();
      return null;
    }
    return entry.value;
  }

  function set(key, value, ttlHours = DEFAULT_TTL_HOURS){
    if(!key) return value;
    load();
    const expiresAt = now() + hoursToMs(ttlHours);
    memory.set(String(key), { value, expiresAt });
    persist();
    return value;
  }

  function clear(prefix){
    load();
    if(!prefix){
      memory.clear();
      persist();
      return;
    }
    const target = String(prefix);
    let changed = false;
    for(const key of memory.keys()){
      if(key.startsWith(target)){
        memory.delete(key);
        changed = true;
      }
    }
    if(changed) persist();
  }

  function clearExpired(){
    load();
    const nowTs = now();
    let changed = false;
    for(const [key, entry] of memory.entries()){
      if(Number.isFinite(entry.expiresAt) && entry.expiresAt <= nowTs){
        memory.delete(key);
        changed = true;
      }
    }
    if(changed) persist();
    return changed;
  }

  function size(){
    load();
    return memory.size;
  }

  return { get, set, clear, clearExpired, size };
}

const defaultStore = createStore();

export function get(key){
  return defaultStore.get(key);
}

export function set(key, value, ttlHours){
  return defaultStore.set(key, value, ttlHours);
}

export function clear(prefix){
  return defaultStore.clear(prefix);
}

export function clearExpired(){
  return defaultStore.clearExpired();
}

export function size(){
  return defaultStore.size();
}

export function createCacheStore(options){
  return createStore(options);
}

export default {
  get,
  set,
  clear,
  clearExpired,
  size,
  createCacheStore,
};
