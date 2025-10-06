import { normalizeItem } from './normalizer.js';
import { getHeroPolicy, getCacheTtl } from './policy.js';
import {
  getStoredPool,
  storePool,
  invalidatePool,
  getHeroHistory,
  getHeroMemory,
  recordHeroMemory,
  clearHeroMemory,
  getHeroFailures,
  recordHeroFailure,
  resolveHeroFailure,
  clearHeroFailures
} from './storage.js';

const LOG_PREFIX = '[hero:pool]';
const PROGRESS_EVENT = 'hero:pool-progress';
const HISTORY_WINDOW_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const HISTORY_LIMIT = 60;
const NEW_WINDOW_MS = 1000 * 60 * 60 * 24 * 90; // 90 days
const OLD_THRESHOLD_YEARS = 12;
const FALLBACK_HISTORY_WINDOW_MS = 1000 * 60 * 60 * 24 * 30; // 30 days fallback when pool too small

const SLOT_KEYS = ['new', 'topRated', 'oldButGold', 'random'];

const listeners = new Set();

function now(){
  return Date.now();
}

function logWarn(...args){
  try {
    console.warn(LOG_PREFIX, ...args);
  } catch (_err) {
    // ignore
  }
}

function normalizeKind(kind){
  if(kind === 'series' || kind === 'show' || kind === 'shows') return 'series';
  return 'movies';
}

function policySignature(policy, kind){
  if(!policy || typeof policy !== 'object') return '';
  try {
    const normalizedKind = normalizeKind(kind);
    const fragment = {
      poolSize: normalizedKind === 'series' ? policy.poolSizeSeries : policy.poolSizeMovies,
      slots: policy.slots,
      diversity: policy.diversity,
      language: policy.language || 'en-US'
    };
    return JSON.stringify(fragment);
  } catch (err) {
    logWarn('Failed to compute policy signature:', err?.message || err);
    return '';
  }
}

function clamp(value, min, max){
  return Math.min(max, Math.max(min, value));
}

function parseDate(value){
  if(!value) return 0;
  if(typeof value === 'number' && Number.isFinite(value)){
    if(value > 1_000_000_000_000) return Math.trunc(value);
    return Math.trunc(value * 1000);
  }
  if(typeof value === 'string'){
    const ts = Date.parse(value);
    if(Number.isFinite(ts)) return ts;
  }
  return 0;
}

function parseYear(value){
  if(!value) return null;
  const num = Number(value);
  if(Number.isFinite(num) && num > 1800 && num < 2100) return Math.trunc(num);
  if(typeof value === 'string'){
    const match = value.match(/(19|20|21)\d{2}/);
    if(match) return Number(match[0]);
  }
  return null;
}

function parseGenres(raw){
  const out = [];
  const push = (val)=>{
    if(!val || typeof val !== 'string') return;
    const trimmed = val.trim();
    if(!trimmed) return;
    const normalized = trimmed.replace(/\s+/g, ' ');
    if(!out.includes(normalized)) out.push(normalized);
  };
  if(Array.isArray(raw?.genres)){
    for(const g of raw.genres){
      if(!g) continue;
      if(typeof g === 'string'){ push(g); continue; }
      if(typeof g === 'object'){ push(g.tag || g.title || g.label || g.name || ''); }
    }
  }
  if(Array.isArray(raw?.Genre)){
    for(const g of raw.Genre){ push(typeof g === 'string' ? g : g?.tag); }
  }
  return out.slice(0, 3);
}

function parseRating(raw){
  const candidates = [raw?.rating, raw?.audienceRating, raw?.userRating];
  for(const candidate of candidates){
    const num = Number(candidate);
    if(Number.isFinite(num) && num > 0) return clamp(Math.round(num * 10) / 10, 0, 10);
  }
  return null;
}

function parseVoteCount(raw){
  const candidates = [raw?.ratingCount, raw?.audienceRatingCount, raw?.userRatingCount, raw?.viewCount];
  for(const candidate of candidates){
    const num = Number(candidate);
    if(Number.isFinite(num) && num >= 0) return Math.trunc(num);
  }
  return 0;
}

function resolveId(raw){
  if(!raw || typeof raw !== 'object') return null;
  if(raw.heroId != null) return String(raw.heroId);
  if(raw.ids && typeof raw.ids === 'object'){
    if(raw.ids.imdb) return `imdb:${raw.ids.imdb}`;
    if(raw.ids.tmdb) return `tmdb:${raw.ids.tmdb}`;
    if(raw.ids.tvdb) return `tvdb:${raw.ids.tvdb}`;
  }
  if(raw.guid) return String(raw.guid);
  if(raw.ratingKey != null) return `rk:${raw.ratingKey}`;
  if(raw.id != null) return String(raw.id);
  if(raw.slug) return String(raw.slug);
  if(raw.key != null){
    const key = typeof raw.key === 'string' ? raw.key.trim() : String(raw.key);
    if(key) return key;
  }
  if(raw.title){
    const suffix = raw.year ? `:${raw.year}` : '';
    return `title:${raw.title}${suffix}`;
  }
  return null;
}

function computeSlotPlan(poolSize, slots){
  const plan = { new: 0, topRated: 0, oldButGold: 0, random: 0 };
  let remaining = poolSize;
  const quotas = slots && typeof slots === 'object' ? slots : {};
  SLOT_KEYS.forEach((key, index) => {
    if(index === SLOT_KEYS.length - 1){
      plan[key] = Math.max(0, remaining);
      remaining = 0;
      return;
    }
    const quota = Number(quotas[key]?.quota);
    if(!Number.isFinite(quota) || quota <= 0){
      plan[key] = 0;
      return;
    }
    const count = Math.max(0, Math.round(poolSize * clamp(quota, 0, 1)));
    plan[key] = Math.min(remaining, count);
    remaining -= plan[key];
  });
  let cursor = 0;
  while(remaining > 0){
    const key = SLOT_KEYS[cursor % SLOT_KEYS.length];
    plan[key] += 1;
    remaining -= 1;
    cursor += 1;
  }
  return plan;
}

function computeCaps(poolSize, diversity){
  const genreWeight = clamp(Number(diversity?.genre) || 0.4, 0.1, 0.9);
  const yearWeight = clamp(Number(diversity?.year) || 0.35, 0.1, 0.9);
  const genreCap = Math.max(1, Math.round(poolSize * clamp(genreWeight * 0.5, 0.1, 0.35)));
  const yearCap = Math.max(1, Math.round(poolSize * clamp(yearWeight * 0.5, 0.1, 0.35)));
  return { perGenre: genreCap, perYear: yearCap };
}

function prepareCandidates(items){
  if(!Array.isArray(items) || !items.length) return [];
  const nowTs = now();
  const seen = new Set();
  const prepared = [];
  for(const raw of items){
    if(!raw || typeof raw !== 'object') continue;
    const id = resolveId(raw);
    if(!id) continue;
    if(seen.has(id)) continue;
    seen.add(id);
    const addedAt = parseDate(raw.addedAt || raw.createdAt || raw.added);
    const year = parseYear(raw.year || raw.originallyAvailableAt);
    const rating = parseRating(raw);
    const voteCount = parseVoteCount(raw);
    const genres = parseGenres(raw);
    const candidate = {
      id,
      raw,
      addedAt,
      year,
      rating: rating ?? 0,
      voteCount,
      genres,
      isNew: addedAt && nowTs - addedAt <= NEW_WINDOW_MS,
      isOld: year ? (new Date().getUTCFullYear() - year) >= OLD_THRESHOLD_YEARS : false
    };
    prepared.push(candidate);
  }
  return prepared;
}

function sortNew(list){
  return list.slice().sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
}

function sortTopRated(list){
  return list.slice().sort((a, b) => {
    const ra = Number.isFinite(a.rating) ? a.rating : 0;
    const rb = Number.isFinite(b.rating) ? b.rating : 0;
    if(rb !== ra) return rb - ra;
    const vc = (b.voteCount || 0) - (a.voteCount || 0);
    if(vc !== 0) return vc;
    return (b.addedAt || 0) - (a.addedAt || 0);
  });
}

function sortOld(list){
  return list.slice().sort((a, b) => {
    const ya = a.year || 0;
    const yb = b.year || 0;
    if(ya && yb && ya !== yb) return ya - yb;
    const rb = (b.rating || 0) - (a.rating || 0);
    if(rb !== 0) return rb;
    return (b.addedAt || 0) - (a.addedAt || 0);
  });
}

function shuffle(list){
  const arr = list.slice();
  for(let i = arr.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function passesCaps(context, candidate){
  const { caps, genreCounts, yearCounts } = context;
  if(caps.perGenre > 0 && candidate.genres && candidate.genres.length){
    for(const genre of candidate.genres){
      const count = genreCounts.get(genre) || 0;
      if(count >= caps.perGenre) return false;
    }
  }
  if(caps.perYear > 0 && candidate.year){
    const count = yearCounts.get(candidate.year) || 0;
    if(count >= caps.perYear) return false;
  }
  return true;
}

function applySelection(context, candidate, slot){
  context.selected.push({ ...candidate, slot });
  context.selectedIds.add(candidate.id);
  context.summary[slot] = (context.summary[slot] || 0) + 1;
  if(candidate.genres){
    for(const genre of candidate.genres){
      context.genreCounts.set(genre, (context.genreCounts.get(genre) || 0) + 1);
    }
  }
  if(candidate.year){
    context.yearCounts.set(candidate.year, (context.yearCounts.get(candidate.year) || 0) + 1);
  }
}

function attemptSelection(list, count, slot, context, { allowHistory = false, filter } = {}){
  if(count <= 0) return 0;
  const deferredHistory = [];
  const deferredMemory = [];
  const deferredFailures = [];
  for(const candidate of list){
    if(context.selected.length >= context.poolSize) break;
    if(context.summary[slot] >= count) break;
    if(context.selectedIds.has(candidate.id)) continue;
    if(filter && !filter(candidate)) continue;
    if(!passesCaps(context, candidate)) continue;
    if(context.failureSet && context.failureSet.has(candidate.id)){
      deferredFailures.push(candidate);
      continue;
    }
    if(context.memorySet && context.memorySet.has(candidate.id)){
      deferredMemory.push(candidate);
      continue;
    }
    if(!allowHistory && context.historySet && context.historySet.has(candidate.id)){
      deferredHistory.push(candidate);
      continue;
    }
    applySelection(context, candidate, slot);
  }
  if(context.summary[slot] >= count || context.selected.length >= context.poolSize) return context.summary[slot];
  const applyQueue = (queue)=>{
    for(const candidate of queue){
      if(context.selected.length >= context.poolSize) break;
      if(context.summary[slot] >= count) break;
      if(context.selectedIds.has(candidate.id)) continue;
      if(!passesCaps(context, candidate)) continue;
      applySelection(context, candidate, slot);
    }
  };
  if(deferredMemory.length){
    applyQueue(deferredMemory);
  }
  if(context.summary[slot] < count && deferredHistory.length){
    applyQueue(deferredHistory);
  }
  if(context.summary[slot] < count && deferredFailures.length){
    applyQueue(deferredFailures);
  }
  return context.summary[slot];
}

function ensureMinimum(context, list){
  for(const candidate of list){
    if(context.selected.length >= context.poolSize) break;
    if(context.selectedIds.has(candidate.id)) continue;
    applySelection(context, candidate, 'random');
  }
}

function emitProgress(detail){
  const payload = { ...detail, timestamp: now() };
  for(const listener of listeners){
    try { listener(payload); } catch (err) { logWarn('Progress listener failed:', err?.message || err); }
  }
  try {
    if(typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function'){
      window.dispatchEvent(new CustomEvent(PROGRESS_EVENT, { detail: payload }));
    }
  } catch (err) {
    logWarn('Failed to dispatch progress event:', err?.message || err);
  }
}

async function normalizeSelection(selection, language, options = {}){
  const normalized = [];
  const total = selection.length;
  const {
    settings,
    auth,
    authOptions,
    signal,
    disableTmdb,
    kind,
    failureTtlMs
  } = options;
  for(let index = 0; index < selection.length; index++){
    const entry = selection[index];
    emitProgress({ stage: 'normalizing', index: index + 1, total, slot: entry.slot, id: entry.id });
    let normalizedItem = null;
    let failureReason = '';
    let rateLimited = false;
    try {
      normalizedItem = await normalizeItem(entry.raw, {
        language,
        settings,
        auth,
        authOptions,
        signal,
        disableTmdb
      });
    } catch (err) {
      logWarn('Failed to normalize hero candidate:', err?.message || err);
      failureReason = err?.message || '';
      if(err?.code === 'RATE_LIMIT') rateLimited = true;
    }
    if(!normalizedItem){
      if(kind && !rateLimited){
        try {
          recordHeroFailure(kind, entry.raw || entry, { timestamp: now(), ttlMs: failureTtlMs, reason: failureReason || 'normalize' });
        } catch (_err){}
      }
      continue;
    }
    if(kind){
      try { resolveHeroFailure(kind, entry.raw || normalizedItem); } catch (_err){}
    }
    normalizedItem.slot = entry.slot;
    normalizedItem.poolSlot = entry.slot;
    normalizedItem.poolId = entry.id;
    normalized.push(normalizedItem);
  }
  return normalized;
}

function classifyCandidates(items, plan, diversity, history, memory, failures){
  const poolSize = Object.values(plan).reduce((sum, value) => sum + value, 0);
  const context = {
    poolSize,
    caps: computeCaps(poolSize, diversity),
    selected: [],
    summary: { new: 0, topRated: 0, oldButGold: 0, random: 0 },
    genreCounts: new Map(),
    yearCounts: new Map(),
    selectedIds: new Set(),
    historySet: history?.set || new Set(),
    memorySet: memory?.set || new Set(),
    failureSet: failures?.set || new Set()
  };

  const prepared = prepareCandidates(items);
  const newList = sortNew(prepared);
  const topList = sortTopRated(prepared);
  const oldList = sortOld(prepared.filter(entry => entry.isOld));
  const randomList = shuffle(prepared);

  attemptSelection(newList, plan.new, 'new', context, { allowHistory: false, filter: candidate => candidate.isNew });
  attemptSelection(newList, plan.new, 'new', context, { allowHistory: false });
  attemptSelection(newList, plan.new, 'new', context, { allowHistory: true });

  attemptSelection(topList, plan.topRated, 'topRated', context, { allowHistory: false });
  attemptSelection(topList, plan.topRated, 'topRated', context, { allowHistory: true });

  attemptSelection(oldList, plan.oldButGold, 'oldButGold', context, { allowHistory: false });
  attemptSelection(oldList, plan.oldButGold, 'oldButGold', context, { allowHistory: true });

  const remainingRandom = randomList.filter(candidate => !context.selectedIds.has(candidate.id));
  attemptSelection(remainingRandom, plan.random, 'random', context, { allowHistory: false });
  attemptSelection(remainingRandom, plan.random, 'random', context, { allowHistory: true });

  if(context.selected.length < poolSize){
    const leftovers = prepared.filter(candidate => !context.selectedIds.has(candidate.id));
    ensureMinimum(context, leftovers);
  }

  return context;
}

function shouldReusePool(kind, policyHash, options = {}){
  const nowTs = now();
  const cached = getStoredPool(kind, { now: nowTs, policyHash });
  if(!cached || !Array.isArray(cached.items) || !cached.items.length) return null;
  if(cached.isExpired){
    if(options.allowGrace){
      const { graceMs } = getCacheTtl();
      if(graceMs && graceMs > 0 && cached.expiresAt + graceMs > nowTs){
        emitProgress({ stage: 'cache', status: 'grace', kind, size: cached.items.length });
        return { ...cached, fromCache: true };
      }
    }
    return null;
  }
  emitProgress({ stage: 'cache', status: 'hit', kind, size: cached.items.length });
  return { ...cached, fromCache: true };
}

async function buildPool(kind, items, options = {}){
  const policy = options.policy || getHeroPolicy();
  const normalizedKind = normalizeKind(kind);
  const policyHash = policySignature(policy, normalizedKind);
  const reuse = !options.force && shouldReusePool(normalizedKind, policyHash, { allowGrace: true });
  if(reuse) return reuse;

  if(options.force){
    try { clearHeroMemory(normalizedKind); } catch (_err){}
    try { clearHeroFailures(normalizedKind); } catch (_err){}
  }

  const poolSize = normalizedKind === 'series' ? policy.poolSizeSeries : policy.poolSizeMovies;
  if(!poolSize || poolSize <= 0){
    return { items: [], summary: {}, fromCache: false, updatedAt: now(), expiresAt: 0 };
  }

  emitProgress({ stage: 'start', kind: normalizedKind, total: poolSize });

  const plan = computeSlotPlan(poolSize, policy.slots);
  const ttlInfo = getCacheTtl();
  const nowTs = now();
  const memoryWindow = (()=>{
    const base = Math.max(0, (ttlInfo.ttlMs || 0)) + Math.max(0, ttlInfo.graceMs || 0);
    return base > 0 ? base : HISTORY_WINDOW_MS;
  })();
  const history = getHeroHistory(normalizedKind, { windowMs: HISTORY_WINDOW_MS, limit: HISTORY_LIMIT });
  const memory = getHeroMemory(normalizedKind, { now: nowTs, windowMs: memoryWindow, limit: Math.max(HISTORY_LIMIT * 2, poolSize * 2) });
  const failures = getHeroFailures(normalizedKind, { now: nowTs, windowMs: memoryWindow });

  let context = classifyCandidates(items, plan, { ...policy.diversity, kind: normalizedKind }, history, memory, failures);

  if(context.selected.length < poolSize && history.entries.length){
    const fallbackHistory = getHeroHistory(normalizedKind, { windowMs: FALLBACK_HISTORY_WINDOW_MS, limit: HISTORY_LIMIT });
    context = classifyCandidates(items, plan, { ...policy.diversity, kind: normalizedKind }, fallbackHistory, memory, failures);
  }

  const trimmedSelection = context.selected.slice(0, poolSize);

  const normalizedItems = await normalizeSelection(trimmedSelection, policy.language || 'en-US', {
    ...options.tmdb,
    kind: normalizedKind,
    failureTtlMs: memoryWindow
  });
  const finalItems = normalizedItems.slice(0, poolSize);

  const updatedAt = now();
  const expiresAt = updatedAt + (ttlInfo.ttlMs || 0);

  const payload = {
    kind: normalizedKind,
    items: finalItems,
    updatedAt,
    expiresAt,
    policyHash,
    slotSummary: context.summary,
    meta: {
      plan,
      totalCandidates: items?.length || 0,
      selectionCount: finalItems.length
    }
  };

  try {
    recordHeroMemory(normalizedKind, finalItems, { timestamp: updatedAt, ttlMs: memoryWindow, limit: Math.max(HISTORY_LIMIT * 2, poolSize * 2) });
  } catch (_err){}

  storePool(normalizedKind, payload);
  emitProgress({ stage: 'done', kind: normalizedKind, size: finalItems.length, updatedAt });
  return { ...payload, fromCache: false };
}

export async function ensureHeroPool(kind, items, options = {}){
  return buildPool(kind, items, options);
}

export function forceRegeneratePool(kind, items, options = {}){
  return buildPool(kind, items, { ...options, force: true });
}

export function clearHeroPool(kind){
  invalidatePool(kind);
}

export function addProgressListener(listener){
  if(typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export { PROGRESS_EVENT };

export default {
  ensureHeroPool,
  forceRegeneratePool,
  clearHeroPool,
  addProgressListener,
  PROGRESS_EVENT
};
