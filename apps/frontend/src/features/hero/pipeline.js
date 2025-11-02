const LOG_PREFIX = '[hero:pipeline]';
const FEATURE_FLAG_KEY = 'feature.heroPipeline';
const UPDATE_EVENT = 'hero:pipeline-update';
const HERO_API_BASE = '/api/hero';

function resolveHeroApiBase(){
  try{
    if(typeof window !== 'undefined'){
      const override =
        window.PLEX_EXPORTER_API_BASE ||
        window.__PLEX_EXPORTER_API_BASE ||
        window?.__PLEX_EXPORTER__?.apiBase;
      if(override){
        const base = String(override).trim();
        if(base){
          return `${base.replace(/\/$/, '')}${HERO_API_BASE}`;
        }
      }
    }
  }catch(err){
    logWarn('Failed to resolve hero API base override:', err?.message || err);
  }
  return HERO_API_BASE;
}

const listeners = new Set();
const state = {
  cfg: {},
  policy: null,
  enabled: true,
  featureSource: 'default',
  ready: false,
  sources: { movies: [], series: [] },
  pools: { movies: [], series: [] },
  status: {
    movies: createStatus('movies'),
    series: createStatus('series')
  },
  activeKind: 'movies',
  inFlight: new Map()
};

function logWarn(...args){
  try {
    console.warn(LOG_PREFIX, ...args);
  } catch (_err) {
    // ignore
  }
}

function now(){
  return Date.now();
}

function normalizeKind(kind){
  if(kind === 'show' || kind === 'shows' || kind === 'series') return 'series';
  return 'movies';
}

function createStatus(kind){
  return {
    kind,
    state: 'idle',
    regenerating: false,
    size: 0,
    updatedAt: 0,
    expiresAt: 0,
    fromCache: false,
    source: '',
    policyHash: '',
    slotSummary: {},
    matchesPolicy: true,
    isExpired: false,
    lastError: null,
    lastRefresh: 0
  };
}

function cloneStatus(status){
  if(!status) return null;
  const copy = { ...status };
  copy.slotSummary = status.slotSummary ? { ...status.slotSummary } : {};
  return copy;
}

function readFeatureFlag(){
  if(typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(FEATURE_FLAG_KEY);
    if(raw === '1' || raw === '0') return raw;
  } catch (err) {
    logWarn('Failed to read feature flag:', err?.message || err);
  }
  return null;
}

function computeFeatureState(cfg){
  const stored = readFeatureFlag();
  if(stored != null){
    return { enabled: stored === '1', source: 'localStorage' };
  }
  if(cfg && typeof cfg.heroPipelineEnabled === 'boolean'){
    return { enabled: !!cfg.heroPipelineEnabled, source: 'config.heroPipelineEnabled' };
  }
  if(cfg && cfg.features && typeof cfg.features.heroPipeline === 'boolean'){
    return { enabled: !!cfg.features.heroPipeline, source: 'config.features.heroPipeline' };
  }
  return { enabled: true, source: 'default' };
}

function buildSnapshot(){
  return {
    enabled: state.enabled,
    featureSource: state.featureSource,
    ready: state.ready,
    activeKind: state.activeKind,
    status: {
      movies: cloneStatus(state.status.movies),
      series: cloneStatus(state.status.series)
    },
    pools: {
      movies: state.pools.movies.slice(),
      series: state.pools.series.slice()
    }
  };
}

function notify(){
  const snapshot = buildSnapshot();
  for(const listener of listeners){
    try {
      listener(snapshot);
    } catch (err) {
      logWarn('Listener failed:', err?.message || err);
    }
  }
  try {
    if(typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function'){
      window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: snapshot }));
    }
  } catch (err) {
    logWarn('Failed to dispatch pipeline event:', err?.message || err);
  }
  return snapshot;
}

function updateStatus(kind, patch){
  const normalized = normalizeKind(kind);
  const status = state.status[normalized];
  if(!status) return;
  const next = { ...patch };
  if(next.slotSummary){
    next.slotSummary = { ...next.slotSummary };
  }
  state.status[normalized] = { ...status, ...next };
}

function refreshReadyState(){
  if(!state.enabled){
    state.ready = true;
    return;
  }
  const kinds = ['movies', 'series'];
  const ready = kinds.every(kind => {
    const status = state.status[kind];
    if(!status) return false;
    return status.state === 'ready' || status.state === 'error' || status.state === 'stale';
  });
  state.ready = ready;
}

async function fetchHeroPoolFromBackend(kind, { force = false } = {}){
  const normalized = normalizeKind(kind);
  const params = new URLSearchParams();
  if(force) params.set('force', '1');
  const query = params.toString();
  const base = resolveHeroApiBase();
  const url = `${base}/${normalized}${query ? `?${query}` : ''}`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    credentials: 'include'
  });
  if(!response.ok){
    const error = new Error(`Hero API responded with ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const data = await response.json();
  if(!data || typeof data !== 'object'){
    throw new Error('Hero API returned an invalid payload');
  }
  return data;
}

function applyBackendPayload(kind, payload){
  const normalized = normalizeKind(kind);
  const poolItems = Array.isArray(payload?.items) ? payload.items.slice() : [];
  state.pools[normalized] = poolItems;
  const meta = payload?.meta || {};
  updateStatus(normalized, {
    state: 'ready',
    regenerating: false,
    size: poolItems.length,
    updatedAt: Number(payload?.updatedAt) || now(),
    expiresAt: Number(payload?.expiresAt) || 0,
    fromCache: !!payload?.fromCache,
    source: meta.source || (payload?.fromCache ? 'cache' : 'backend'),
    policyHash: payload?.policyHash || '',
    slotSummary: payload?.slotSummary || {},
    matchesPolicy: payload?.matchesPolicy !== false,
    isExpired: false,
    lastError: null,
    lastRefresh: now()
  });
  refreshReadyState();
  notify();
  return payload;
}

async function runPoolBuilder(kind, { force = false } = {}){
  const normalized = normalizeKind(kind);
  if(!state.enabled){
    updateStatus(normalized, { state: 'disabled', regenerating: false });
    refreshReadyState();
    return null;
  }

  if(state.inFlight.has(normalized)){
    return state.inFlight.get(normalized);
  }

  updateStatus(normalized, {
    state: 'loading',
    regenerating: true,
    lastError: null
  });
  notify();

  const promise = fetchHeroPoolFromBackend(normalized, { force })
    .then(payload => applyBackendPayload(normalized, payload))
    .catch(err => {
      logWarn('Hero API failed for', normalized, err?.message || err);
      updateStatus(normalized, {
        state: 'error',
        regenerating: false,
        lastError: err?.message || String(err)
      });
      refreshReadyState();
      notify();
      throw err;
    })
    .finally(() => {
      state.inFlight.delete(normalized);
    });

  state.inFlight.set(normalized, promise);
  return promise;
}

function computeDaySeed(){
  const nowDate = new Date();
  const year = nowDate.getUTCFullYear();
  const startOfYear = Date.UTC(year, 0, 1);
  const today = Date.UTC(year, nowDate.getUTCMonth(), nowDate.getUTCDate());
  const diff = Math.max(0, today - startOfYear);
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

function comparePoolEntries(a, b){
  const ka = String(a?.poolId || a?.id || '').toLowerCase();
  const kb = String(b?.poolId || b?.id || '').toLowerCase();
  if(ka < kb) return -1;
  if(ka > kb) return 1;
  return 0;
}

function computeRotation(kind, snapshot){
  const normalized = normalizeKind(kind);
  const pool = snapshot?.pools?.[normalized] || [];
  if(!Array.isArray(pool) || !pool.length){
    return { items: [], startIndex: 0 };
  }
  const sorted = pool.slice().sort(comparePoolEntries);
  const status = snapshot.status?.[normalized] || {};
  const freshnessSeed = status.updatedAt ? Math.floor(Number(status.updatedAt) / (24 * 60 * 60 * 1000)) : 0;
  const offset = normalized === 'series' ? 7 : 0;
  const seed = computeDaySeed() + freshnessSeed + offset;
  const startIndex = sorted.length ? seed % sorted.length : 0;
  return { items: sorted, startIndex };
}

export function configure({ cfg, policy } = {}){
  state.cfg = cfg || {};
  state.policy = policy || null;
  const feature = computeFeatureState(cfg);
  state.enabled = !!feature.enabled;
  state.featureSource = feature.source;
  refreshReadyState();
  notify();
  return { enabled: state.enabled, source: state.featureSource };
}

export function setSources({ movies = [], shows = [] } = {}){
  state.sources = { movies: Array.isArray(movies) ? movies : [], series: Array.isArray(shows) ? shows : [] };
}

export function setActiveView(view){
  const normalized = view === 'shows' || view === 'series' ? 'series' : 'movies';
  if(state.activeKind !== normalized){
    state.activeKind = normalized;
    notify();
  }
}

export async function primeAll(options = {}){
  if(!state.enabled){
    refreshReadyState();
    return { skipped: true };
  }
  const kinds = options.kinds || ['movies', 'series'];
  const tasks = kinds.map(kind => runPoolBuilder(kind));
  const results = await Promise.allSettled(tasks);
  refreshReadyState();
  notify();
  return results;
}

export function ensureKind(kind, options = {}){
  return runPoolBuilder(kind, options);
}

export function refreshKind(kind, options = {}){
  return runPoolBuilder(kind, { ...options, force: true });
}

export function refreshAll(){
  if(!state.enabled){
    return Promise.resolve({ skipped: true });
  }
  return Promise.all([refreshKind('movies'), refreshKind('series')]);
}

export function isEnabled(){
  return !!state.enabled;
}

export function isReady(){
  return !!state.ready;
}

export function getSnapshot(){
  return buildSnapshot();
}

export function getStatus(kind){
  if(!kind) return { ...buildSnapshot().status };
  const normalized = normalizeKind(kind);
  return cloneStatus(state.status[normalized]);
}

export function getPool(kind){
  if(!state.enabled) return [];
  const normalized = normalizeKind(kind);
  return state.pools[normalized]?.slice() || [];
}

export function getRotationPlan(kind){
  const snapshot = buildSnapshot();
  const plan = computeRotation(kind, snapshot);
  return { ...plan, snapshot };
}

export function subscribe(listener){
  if(typeof listener !== 'function') return () => {};
  listeners.add(listener);
  try {
    listener(buildSnapshot());
  } catch (err) {
    logWarn('Initial listener invocation failed:', err?.message || err);
  }
  return () => listeners.delete(listener);
}

export function getDebugSnapshot(){
  const snapshot = buildSnapshot();
  return {
    enabled: snapshot.enabled,
    featureSource: snapshot.featureSource,
    ready: snapshot.ready,
    status: snapshot.status,
    poolSizes: {
      movies: snapshot.pools.movies.length,
      series: snapshot.pools.series.length
    }
  };
}

export default {
  configure,
  setSources,
  setActiveView,
  primeAll,
  ensureKind,
  refreshKind,
  refreshAll,
  isEnabled,
  isReady,
  getSnapshot,
  getStatus,
  getPool,
  getRotationPlan,
  subscribe,
  getDebugSnapshot
};
