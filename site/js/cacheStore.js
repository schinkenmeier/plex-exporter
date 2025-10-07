const DEFAULT_TTL_HOURS = 24;
const STORAGE_KEY = 'tmdb.metadata.cache.v1';
const LOG_PREFIX = '[cacheStore]';

function now(){
  return Date.now();
}

function hoursToMs(hours){
  const num = Number(hours);
  const h = Number.isFinite(num) ? num : DEFAULT_TTL_HOURS;
  return Math.max(0.01, h) * 60 * 60 * 1000;
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

  function load(){
    if(loaded) return;
    loaded = true;
    if(typeof localStorage === 'undefined') return;
    let raw;
    try{
      raw = localStorage.getItem(storageKey);
      if(!raw){
        memory = new Map();
        return;
      }
    }catch(err){
      console.warn(`${LOG_PREFIX} Failed to read persisted cache:`, err);
      memory = new Map();
      return;
    }
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

  function persist(){
    if(typeof localStorage === 'undefined') return;
    const serialisable = Array.from(memory.entries()).map(([key, entry])=>[
      key,
      { value: entry.value, expiresAt: entry.expiresAt }
    ]);
    try{
      localStorage.setItem(storageKey, safeStringify(serialisable));
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
