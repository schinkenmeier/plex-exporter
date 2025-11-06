import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../db/index.js';
import { heroPools } from '../db/schema.js';
import MediaRepository, { type MediaRecord } from '../repositories/mediaRepository.js';
import ThumbnailRepository from '../repositories/thumbnailRepository.js';
import logger from './logger.js';
import type { TmdbService, TmdbHeroDetails, TmdbRateLimitState } from './tmdbService.js';
import { TmdbRateLimitError } from './tmdbService.js';

type HeroKind = 'movies' | 'series';

interface HeroPolicy {
  poolSizeMovies: number;
  poolSizeSeries: number;
  slots: Record<string, { quota?: number }>;
  diversity?: {
    genre?: number;
    year?: number;
    antiRepeat?: number;
  };
  cache?: {
    ttlHours?: number;
    graceMinutes?: number;
  };
  language?: string;
}

interface HistoryEntry {
  id: string;
  ts: number;
}

type HeroPoolRow = typeof heroPools.$inferSelect;

interface HeroPipelineOptions {
  drizzleDatabase: DrizzleDatabase;
  mediaRepository: MediaRepository;
  thumbnailRepository?: ThumbnailRepository | null;
  tmdbService?: TmdbService | null;
  policyPath?: string | null;
}

export interface HeroPoolItem {
  id: string;
  poolId: string;
  poolSlot: string;
  slot: string;
  type: 'movie' | 'tv';
  title: string;
  tagline: string;
  overview: string;
  year: number | null;
  runtime: number | null;
  rating: number | null;
  voteCount: number | null;
  genres: string[];
  certification: string | null;
  backdrops: string[];
  poster: string | null;
  cta: {
    id: string;
    kind: 'movie' | 'show';
    label: string;
    target: string;
  };
  ids: Record<string, string>;
  source: 'tmdb' | 'plex';
}

export interface HeroPoolPayload {
  kind: HeroKind;
  items: HeroPoolItem[];
  updatedAt: number;
  expiresAt: number;
  policyHash: string;
  slotSummary: Record<string, number>;
  matchesPolicy: boolean;
  fromCache: boolean;
  meta: {
    source: 'fresh' | 'cache';
    plan: Record<string, number>;
    totalCandidates: number;
    selectionCount: number;
    tmdb: {
      enabled: boolean;
      rateLimit: TmdbRateLimitState;
      hitLimit: boolean;
    };
  };
}

export interface HeroPipelineService {
  getPool(kind: HeroKind, options?: { force?: boolean }): Promise<HeroPoolPayload>;
  setTmdbService(next: TmdbService | null): void;
}

const DEFAULT_POLICY: HeroPolicy = {
  poolSizeMovies: 10,
  poolSizeSeries: 10,
  slots: {
    new: { quota: 0.3 },
    topRated: { quota: 0.3 },
    oldButGold: { quota: 0.2 },
    random: { quota: 0.2 },
  },
  diversity: {
    genre: 0.45,
    year: 0.35,
    antiRepeat: 0.2,
  },
  cache: {
    ttlHours: 24,
    graceMinutes: 30,
  },
  language: 'en-US',
};

const HISTORY_LIMIT = 60;
const HISTORY_WINDOW_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const NEW_WINDOW_MS = 1000 * 60 * 60 * 24 * 90; // 90 days
const OLD_THRESHOLD_YEARS = 12;

const SLOT_KEYS: Array<'new' | 'topRated' | 'oldButGold' | 'random'> = [
  'new',
  'topRated',
  'oldButGold',
  'random',
];

interface Candidate {
  id: string;
  raw: MediaRecord;
  addedAt: number;
  year: number | null;
  rating: number;
  voteCount: number;
  genres: string[];
  isNew: boolean;
  isOld: boolean;
}

interface SelectionContext {
  poolSize: number;
  caps: { perGenre: number; perYear: number };
  selected: Array<Candidate & { slot: HeroPoolItem['slot'] }>;
  summary: Record<string, number>;
  genreCounts: Map<string, number>;
  yearCounts: Map<number, number>;
  selectedIds: Set<string>;
  historySet: Set<string>;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const parseDate = (value: string | null | undefined): number => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseYear = (value: number | string | null | undefined): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 1800 && value < 2100) return Math.trunc(value);
    return null;
  }
  if (typeof value === 'string') {
    const match = value.match(/(19|20|21)\d{2}/);
    if (match) return Number(match[0]);
  }
  return null;
};

const parseRating = (record: MediaRecord): number => {
  const candidates = [record.rating, record.audienceRating];
  for (const candidate of candidates) {
    const num = Number(candidate);
    if (Number.isFinite(num) && num > 0) {
      return clamp(Math.round(num * 10) / 10, 0, 10);
    }
  }
  return 0;
};

const parseGenres = (record: MediaRecord): string[] => {
  if (!Array.isArray(record.genres)) return [];
  const normalized: string[] = [];
  for (const entry of record.genres) {
    if (!entry) continue;
    const str = String(entry).trim();
    if (!str) continue;
    if (!normalized.includes(str)) normalized.push(str);
  }
  return normalized.slice(0, 3);
};

const prepareCandidates = (records: MediaRecord[]): Candidate[] => {
  const nowTs = Date.now();
  const seen = new Set<string>();
  const prepared: Candidate[] = [];
  for (const record of records) {
    const id = record.plexId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const addedAt = parseDate(record.plexAddedAt || record.createdAt || null);
    const year = parseYear(record.year ?? null);
    const rating = parseRating(record);
    const genres = parseGenres(record);
    const candidate: Candidate = {
      id,
      raw: record,
      addedAt,
      year,
      rating,
      voteCount: 0,
      genres,
      isNew: addedAt > 0 && nowTs - addedAt <= NEW_WINDOW_MS,
      isOld: year ? new Date().getUTCFullYear() - year >= OLD_THRESHOLD_YEARS : false,
    };
    prepared.push(candidate);
  }
  return prepared;
};

const sortNew = (list: Candidate[]) => list.slice().sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));

const sortTopRated = (list: Candidate[]) =>
  list.slice().sort((a, b) => {
    const diff = (b.rating || 0) - (a.rating || 0);
    if (diff !== 0) return diff;
    return (b.addedAt || 0) - (a.addedAt || 0);
  });

const sortOld = (list: Candidate[]) =>
  list.slice().sort((a, b) => {
    const ya = a.year || 0;
    const yb = b.year || 0;
    if (ya && yb && ya !== yb) return ya - yb;
    const rb = (b.rating || 0) - (a.rating || 0);
    if (rb !== 0) return rb;
    return (b.addedAt || 0) - (a.addedAt || 0);
  });

const shuffle = (list: Candidate[]) => {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const computeSlotPlan = (poolSize: number, slots: HeroPolicy['slots']): Record<string, number> => {
  const plan: Record<string, number> = { new: 0, topRated: 0, oldButGold: 0, random: 0 };
  let remaining = poolSize;
  for (let index = 0; index < SLOT_KEYS.length; index += 1) {
    const key = SLOT_KEYS[index];
    if (index === SLOT_KEYS.length - 1) {
      plan[key] = Math.max(0, remaining);
      remaining = 0;
      break;
    }
    const quota = Number(slots?.[key]?.quota);
    if (!Number.isFinite(quota) || quota <= 0) {
      plan[key] = 0;
      continue;
    }
    const count = Math.max(0, Math.round(poolSize * clamp(quota, 0, 1)));
    plan[key] = Math.min(remaining, count);
    remaining -= plan[key];
  }
  let cursor = 0;
  while (remaining > 0) {
    const key = SLOT_KEYS[cursor % SLOT_KEYS.length];
    plan[key] += 1;
    remaining -= 1;
    cursor += 1;
  }
  return plan;
};

const computeCaps = (poolSize: number, diversity?: HeroPolicy['diversity']) => {
  const genreWeight = clamp(Number(diversity?.genre) || 0.4, 0.1, 0.9);
  const yearWeight = clamp(Number(diversity?.year) || 0.35, 0.1, 0.9);
  const genreCap = Math.max(1, Math.round(poolSize * clamp(genreWeight * 0.5, 0.1, 0.35)));
  const yearCap = Math.max(1, Math.round(poolSize * clamp(yearWeight * 0.5, 0.1, 0.35)));
  return { perGenre: genreCap, perYear: yearCap };
};

const passesCaps = (context: SelectionContext, candidate: Candidate): boolean => {
  const { caps, genreCounts, yearCounts } = context;
  if (caps.perGenre > 0 && candidate.genres && candidate.genres.length) {
    for (const genre of candidate.genres) {
      const count = genreCounts.get(genre) || 0;
      if (count >= caps.perGenre) return false;
    }
  }
  if (caps.perYear > 0 && candidate.year) {
    const count = yearCounts.get(candidate.year) || 0;
    if (count >= caps.perYear) return false;
  }
  return true;
};

const applySelection = (context: SelectionContext, candidate: Candidate, slot: HeroPoolItem['slot']) => {
  context.selected.push({ ...candidate, slot });
  context.selectedIds.add(candidate.id);
  context.summary[slot] = (context.summary[slot] || 0) + 1;
  if (candidate.genres) {
    for (const genre of candidate.genres) {
      context.genreCounts.set(genre, (context.genreCounts.get(genre) || 0) + 1);
    }
  }
  if (candidate.year) {
    context.yearCounts.set(candidate.year, (context.yearCounts.get(candidate.year) || 0) + 1);
  }
};

const attemptSelection = (
  list: Candidate[],
  count: number,
  slot: HeroPoolItem['slot'],
  context: SelectionContext,
  { allowHistory = false, filter }: { allowHistory?: boolean; filter?: (candidate: Candidate) => boolean } = {},
) => {
  if (count <= 0) return;
  const deferredHistory: Candidate[] = [];
  for (const candidate of list) {
    if (context.selected.length >= context.poolSize) break;
    if (context.summary[slot] >= count) break;
    if (context.selectedIds.has(candidate.id)) continue;
    if (filter && !filter(candidate)) continue;
    if (!passesCaps(context, candidate)) continue;
    if (!allowHistory && context.historySet.has(candidate.id)) {
      deferredHistory.push(candidate);
      continue;
    }
    applySelection(context, candidate, slot);
  }
  if (context.summary[slot] >= count || context.selected.length >= context.poolSize) return;
  for (const candidate of deferredHistory) {
    if (context.selected.length >= context.poolSize) break;
    if (context.summary[slot] >= count) break;
    if (context.selectedIds.has(candidate.id)) continue;
    if (!passesCaps(context, candidate)) continue;
    applySelection(context, candidate, slot);
  }
};

const ensureMinimum = (context: SelectionContext, list: Candidate[]) => {
  for (const candidate of list) {
    if (context.selected.length >= context.poolSize) break;
    if (context.selectedIds.has(candidate.id)) continue;
    applySelection(context, candidate, 'random');
  }
};

const classifyCandidates = (
  records: MediaRecord[],
  plan: Record<string, number>,
  diversity: HeroPolicy['diversity'],
  history: { entries: HistoryEntry[]; set: Set<string> },
): SelectionContext => {
  const poolSize = Object.values(plan).reduce((sum, value) => sum + value, 0);
  const context: SelectionContext = {
    poolSize,
    caps: computeCaps(poolSize, diversity),
    selected: [],
    summary: { new: 0, topRated: 0, oldButGold: 0, random: 0 },
    genreCounts: new Map(),
    yearCounts: new Map(),
    selectedIds: new Set(),
    historySet: history.set || new Set(),
  };

  const prepared = prepareCandidates(records);
  const newList = sortNew(prepared);
  const topList = sortTopRated(prepared);
  const oldList = sortOld(prepared.filter((entry) => entry.isOld));
  const randomList = shuffle(prepared);

  attemptSelection(newList, plan.new, 'new', context, { allowHistory: false, filter: (candidate) => candidate.isNew });
  attemptSelection(newList, plan.new, 'new', context, { allowHistory: false });
  attemptSelection(newList, plan.new, 'new', context, { allowHistory: true });

  attemptSelection(topList, plan.topRated, 'topRated', context, { allowHistory: false });
  attemptSelection(topList, plan.topRated, 'topRated', context, { allowHistory: true });

  attemptSelection(oldList, plan.oldButGold, 'oldButGold', context, { allowHistory: false });
  attemptSelection(oldList, plan.oldButGold, 'oldButGold', context, { allowHistory: true });

  const remainingRandom = randomList.filter((candidate) => !context.selectedIds.has(candidate.id));
  attemptSelection(remainingRandom, plan.random, 'random', context, { allowHistory: false });
  attemptSelection(remainingRandom, plan.random, 'random', context, { allowHistory: true });

  if (context.selected.length < poolSize) {
    const leftovers = prepared.filter((candidate) => !context.selectedIds.has(candidate.id));
    ensureMinimum(context, leftovers);
  }

  return context;
};

const buildHistorySnapshot = (
  entries: HistoryEntry[],
  nowTs: number,
  windowMs: number,
  limit: number,
): { entries: HistoryEntry[]; set: Set<string> } => {
  const seen = new Set<string>();
  const filtered: HistoryEntry[] = [];
  for (const entry of entries) {
    if (!entry?.id) continue;
    if (entry.ts < nowTs - windowMs) continue;
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    filtered.push(entry);
    if (filtered.length >= limit) break;
  }
  return { entries: filtered, set: seen };
};

const mergeGenres = (primary: string[], secondary: string[]): string[] => {
  const seen = new Set<string>();
  const merged: string[] = [];
  [...primary, ...secondary].forEach((value) => {
    const str = String(value || '').trim();
    if (!str) return;
    const key = str.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(str);
  });
  return merged.slice(0, 3);
};

const minutesFromDuration = (value: number | null | undefined): number | null => {
  if (value == null) return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  if (num > 1000) {
    return Math.max(1, Math.round(num / 60000));
  }
  return Math.round(num);
};

const parseGuid = (guid: string | null | undefined, ids: Record<string, string>) => {
  if (!guid) return;
  const trimmed = guid.trim();
  if (!trimmed) return;
  const [schemePart, restPart] = trimmed.split('://');
  if (!restPart) {
    if (trimmed.startsWith('tt')) ids.imdb = trimmed;
    return;
  }
  const scheme = schemePart.toLowerCase();
  const rest = restPart.split('?')[0].replace(/^\/+/, '');
  const tail = rest.split('/').pop() || rest;
  if (!tail) return;
  if (scheme.includes('imdb')) ids.imdb = tail;
  if (scheme.includes('themoviedb')) ids.tmdb = tail;
  if (scheme.includes('thetvdb')) ids.tvdb = tail;
};

const extractIds = (record: MediaRecord): Record<string, string> => {
  const ids: Record<string, string> = {};
  if (record.plexId) ids.ratingKey = record.plexId;
  parseGuid(record.guid, ids);
  return ids;
};

const ensureCtaId = (ids: Record<string, string>): string => {
  // Always prefer ratingKey for API calls
  if (ids.ratingKey) return ids.ratingKey;
  // Fallback to external IDs only if ratingKey is missing
  if (ids.imdb) return ids.imdb;
  if (ids.tmdb) return ids.tmdb;
  if (ids.tvdb) return ids.tvdb;
  return crypto.randomUUID();
};

const parseYearFromDetails = (details: TmdbHeroDetails | null, record: MediaRecord): number | null => {
  if (details) {
    const source = details.type === 'tv' ? details.firstAirDate : details.releaseDate;
    const parsed = parseYear(source ?? null);
    if (parsed) return parsed;
  }
  return parseYear(record.year ?? null);
};

const normalizeImageCandidate = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  let candidate = trimmed.replace(/\\/g, '/');

  let tautulliProbe = candidate;
  if (/^https?:\/\//i.test(candidate)) {
    try {
      const parsed = new URL(candidate);
      tautulliProbe = `${parsed.pathname || ''}${parsed.search || ''}`;
    } catch {
      tautulliProbe = candidate;
    }
  } else if (candidate.startsWith('//')) {
    const slashIndex = candidate.indexOf('/', 2);
    tautulliProbe = slashIndex >= 0 ? candidate.slice(slashIndex) : '';
  }

  const tautulliMatch =
    tautulliProbe.match(/\/library\/metadata\/(\d+)\/(thumb|art)\/(\d+)/) ??
    tautulliProbe.match(/^library\/metadata\/(\d+)\/(thumb|art)\/(\d+)/);
  if (tautulliMatch) {
    const [, id, type, timestamp] = tautulliMatch;
    return `/api/thumbnails/tautulli/library/metadata/${id}/${type}/${timestamp}`;
  }

  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('data:')) {
    return trimmed;
  }

  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }

  if (candidate.startsWith('/api/thumbnails/')) {
    return candidate;
  }
  if (candidate.startsWith('api/thumbnails/')) {
    return `/${candidate}`;
  }

  if (/(^|\/)\.\.(\/|$)/.test(candidate)) {
    return null;
  }

  candidate = candidate.replace(/^\.\/+/, '');

  if (candidate.startsWith('/covers/')) {
    return candidate;
  }
  if (candidate.startsWith('covers/')) {
    return candidate;
  }

  if (candidate.startsWith('/')) {
    return candidate;
  }

  return candidate;
};

const dedupeImages = (values: Array<string | null | undefined>): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const candidate = normalizeImageCandidate(value);
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    result.push(candidate);
  }
  return result;
};

const resolvePoster = (
  details: TmdbHeroDetails | null,
  record: MediaRecord,
  thumbnails: string[],
): string | null => {
  const candidates: Array<string | null | undefined> = [
    details?.poster ?? null,
    record.poster,
    thumbnails[0] ?? null,
    record.backdrop,
  ];
  const [poster] = dedupeImages(candidates);
  return poster ?? null;
};

const resolveBackdrops = (
  details: TmdbHeroDetails | null,
  record: MediaRecord,
  thumbnails: string[],
): string[] => {
  const logContext = {
    namespace: 'hero',
    recordId: record.id,
    title: record.title,
    tmdbBackdrops: details?.backdrops?.length ?? 0,
    tmdbPoster: Boolean(details?.poster),
    thumbnails: thumbnails.length,
    hasRecordBackdrop: Boolean(record.backdrop),
    hasRecordPoster: Boolean(record.poster),
    tmdbSource: details ? 'tmdb' : 'plex',
  };
  logger.debug('Resolving hero backdrops', logContext);

  const primaryCandidates: Array<string | null | undefined> = [];
  if (details && Array.isArray(details.backdrops)) {
    primaryCandidates.push(...details.backdrops);
  }
  const primary = dedupeImages(primaryCandidates);
  if (primary.length > 0) {
    logger.debug('Using TMDB backdrops for hero entry', {
      ...logContext,
      selection: primary.slice(0, 3),
      selectionCount: primary.length,
    });
    return primary;
  }

  const fallbackCandidates: Array<string | null | undefined> = [
    record.backdrop,
    ...thumbnails,
    record.poster,
    details?.poster ?? null,
  ];
  const fallback = dedupeImages(fallbackCandidates);
  if (fallback.length > 0) {
    logger.debug('Using fallback backdrops for hero entry', {
      ...logContext,
      selection: fallback.slice(0, 3),
      selectionCount: fallback.length,
      fallbackSources: {
        recordBackdrop: Boolean(record.backdrop),
        thumbnails: thumbnails.length,
        recordPoster: Boolean(record.poster),
      },
    });
  } else {
    logger.warn('No backdrops resolved for hero entry', logContext);
  }
  return fallback;
};

const buildNormalizedItem = (
  candidate: Candidate,
  slot: HeroPoolItem['slot'],
  type: 'movie' | 'tv',
  record: MediaRecord,
  ids: Record<string, string>,
  details: TmdbHeroDetails | null,
  thumbnails: string[],
): HeroPoolItem => {
  const title = (details?.title || record.title || '').trim();
  const overview = (details?.overview || record.summary || '').trim();
  const tagline = (details?.tagline || record.tagline || '').trim();
  const runtime = details?.runtimeMinutes ?? minutesFromDuration(record.duration);
  const rating = details?.voteAverage ?? (candidate.rating || null);
  const voteCount = details?.voteCount ?? null;
  const genres = mergeGenres(details?.genres || [], parseGenres(record));
  const certification = details?.certification || (record.contentRating || null);
  const year = parseYearFromDetails(details, record);
  const poolId = candidate.id;
  const ctaId = ensureCtaId(ids);
  const ctaKind = type === 'tv' ? 'show' : 'movie';
  const ctaLabel = ctaKind === 'show' ? 'View show details' : 'View movie details';
  const target = `#/${ctaKind}/${ctaId}`;

  return {
    id: record.plexId || `${ctaKind}-${ctaId}`,
    poolId,
    poolSlot: slot,
    slot,
    type,
    title,
    tagline,
    overview,
    year,
    runtime,
    rating,
    voteCount,
    genres,
    certification,
    cta: {
      id: ctaId,
      kind: ctaKind,
      label: ctaLabel,
      target,
    },
    ids,
    source: details ? 'tmdb' : 'plex',
    backdrops: resolveBackdrops(details, record, thumbnails),
    poster: resolvePoster(details, record, thumbnails),
  };
};

const updateHistory = (entries: HistoryEntry[], additions: HeroPoolItem[], timestamp: number): HistoryEntry[] => {
  const existing = entries.slice(0);
  const map = new Map<string, HistoryEntry>();
  for (const entry of existing) {
    if (!entry?.id) continue;
    map.set(entry.id, entry);
  }
  for (const item of additions) {
    const id = item.poolId || item.id;
    if (!id) continue;
    map.set(id, { id, ts: timestamp });
  }
  const values = Array.from(map.values())
    .filter((entry) => entry.ts >= timestamp - HISTORY_WINDOW_MS)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, HISTORY_LIMIT);
  return values;
};

const resolvePolicyPath = async (explicitPath?: string | null): Promise<string | null> => {
  const candidates = [
    explicitPath,
    path.resolve(process.cwd(), 'apps/frontend/public/hero.policy.json'),
    path.resolve(process.cwd(), '../frontend/public/hero.policy.json'),
    path.resolve(process.cwd(), '../../apps/frontend/public/hero.policy.json'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // continue
    }
  }
  return null;
};

const readPolicy = async (
  policyPath?: string | null,
  resolvedPath?: string | null,
): Promise<{ policy: HeroPolicy; hash: string }> => {
  try {
    const pathToUse = resolvedPath ?? (await resolvePolicyPath(policyPath));
    if (!pathToUse) {
      const hash = crypto.createHash('sha1').update(JSON.stringify(DEFAULT_POLICY)).digest('hex');
      return { policy: DEFAULT_POLICY, hash };
    }
    const raw = await fs.readFile(pathToUse, 'utf8');
    const parsed = JSON.parse(raw);
    const policy = { ...DEFAULT_POLICY, ...parsed } as HeroPolicy;
    const hash = crypto.createHash('sha1').update(JSON.stringify(policy)).digest('hex');
    return { policy, hash };
  } catch (error) {
    logger.warn('Falling back to default hero policy', {
      namespace: 'hero',
      error: error instanceof Error ? error.message : error,
    });
    const hash = crypto.createHash('sha1').update(JSON.stringify(DEFAULT_POLICY)).digest('hex');
    return { policy: DEFAULT_POLICY, hash };
  }
};

const parseHistoryJson = (json: string | null | undefined): HistoryEntry[] => {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => ({
        id: typeof entry?.id === 'string' ? entry.id : '',
        ts: Number(entry?.ts ?? entry?.timestamp ?? 0),
      }))
      .filter((entry) => entry.id && Number.isFinite(entry.ts));
  } catch {
    return [];
  }
};

const serializeHistory = (entries: HistoryEntry[]): string => JSON.stringify(entries);

const parsePayload = (payload: string | null | undefined): HeroPoolPayload | null => {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as HeroPoolPayload;
  } catch (error) {
    logger.warn('Failed to parse stored hero pool payload', {
      namespace: 'hero',
      error: error instanceof Error ? error.message : error,
    });
    return null;
  }
};

export const createHeroPipelineService = ({
  drizzleDatabase,
  mediaRepository,
  thumbnailRepository,
  tmdbService: initialTmdbService,
  policyPath,
}: HeroPipelineOptions): HeroPipelineService => {
  let activeTmdbService = initialTmdbService ?? null;
  let cachedPolicy: { policy: HeroPolicy; hash: string } | null = null;
  let cachedPolicyMeta: { path: string | null; mtimeMs: number | null } | null = null;

  const buildTmdbMeta = (hitLimit: boolean) => ({
    enabled: !!activeTmdbService?.isEnabled(),
    rateLimit: activeTmdbService?.getRateLimitState() ?? {
      active: false,
      until: 0,
      retryAfterMs: 0,
      lastStatus: null,
      strikes: 0,
    },
    hitLimit,
  });

  const loadPolicy = async ({ force = false }: { force?: boolean } = {}): Promise<{
    policy: HeroPolicy;
    hash: string;
  }> => {
    let resolvedPolicyPath = await resolvePolicyPath(policyPath);
    let mtimeMs: number | null = null;

    if (resolvedPolicyPath) {
      try {
        const stats = await fs.stat(resolvedPolicyPath);
        mtimeMs = stats.mtimeMs;
      } catch (error) {
        const err = error as { code?: string; message?: string };
        if (err?.code === 'ENOENT') {
          resolvedPolicyPath = null;
          mtimeMs = null;
        } else {
          const normalizedError =
            (typeof err?.message === 'string' && err.message.length > 0
              ? err.message
              : null) ?? (error instanceof Error ? error.message : error);
          logger.warn('Failed to read hero policy metadata', {
            namespace: 'hero',
            error: normalizedError,
            path: resolvedPolicyPath,
          });
          resolvedPolicyPath = null;
          mtimeMs = null;
        }
      }
    }

    const needsReload =
      force ||
      !cachedPolicy ||
      !cachedPolicyMeta ||
      cachedPolicyMeta.path !== resolvedPolicyPath ||
      cachedPolicyMeta.mtimeMs !== mtimeMs;

    if (!cachedPolicy || needsReload) {
      const nextPolicy = await readPolicy(policyPath, resolvedPolicyPath);
      cachedPolicy = nextPolicy;
      cachedPolicyMeta = { path: resolvedPolicyPath, mtimeMs };
    }

    if (!cachedPolicy) {
      throw new Error('Failed to load hero policy');
    }

    return cachedPolicy;
  };

  const loadStored = (kind: HeroKind): { row: HeroPoolRow; payload: HeroPoolPayload | null; history: HistoryEntry[] } | null => {
    const rows = drizzleDatabase
      .select()
      .from(heroPools)
      .where(eq(heroPools.kind, kind))
      .limit(1)
      .all();
    const row = rows[0];
    if (!row) return null;
    const payload = parsePayload(row.payload);
    const history = parseHistoryJson(row.history);
    return { row, payload, history };
  };

  const normalizeSelection = async (
    selection: Array<Candidate & { slot: HeroPoolItem['slot'] }>,
    kind: HeroKind,
    policy: HeroPolicy,
    thumbnailMap: Map<number, string[]>,
  ): Promise<{ items: HeroPoolItem[]; rateLimitHit: boolean }> => {
    const items: HeroPoolItem[] = [];
    let rateLimitHit = false;
    const language = policy.language || 'en-US';
    const mediaKind: 'movie' | 'tv' = kind === 'series' ? 'tv' : 'movie';

    const fetchDetailsForEntry = async (
      entry: Candidate & { slot: HeroPoolItem['slot'] },
      ids: Record<string, string>,
      preferredLanguage: string,
    ): Promise<{ details: TmdbHeroDetails | null; rateLimitHit: boolean }> => {
      const tmdbService = activeTmdbService;
      if (!tmdbService?.isEnabled()) {
        return { details: null, rateLimitHit: false };
      }
      if (!ids.tmdb && !ids.imdb) {
        return { details: null, rateLimitHit: false };
      }

      const languagesToTry = Array.from(
        new Set(
          [preferredLanguage, 'en-US'].filter(
            (value): value is string => typeof value === 'string' && value.trim().length > 0,
          ),
        ),
      );

      let primaryDetails: TmdbHeroDetails | null = null;
      let fallbackDetails: TmdbHeroDetails | null = null;
      let hitLimit = false;

      for (let index = 0; index < languagesToTry.length; index += 1) {
        const lang = languagesToTry[index];
        const isPrimaryAttempt = index === 0;
        try {
          let fetched: TmdbHeroDetails | null = null;
          if (ids.tmdb) {
            fetched = await tmdbService.fetchDetails(mediaKind, ids.tmdb, { language: lang });
          } else if (ids.imdb) {
            fetched = await tmdbService.fetchDetailsByImdb(mediaKind, ids.imdb, { language: lang });
          }
          if (!fetched) {
            continue;
          }
          if (isPrimaryAttempt) {
            primaryDetails = fetched;
            const hasBackdrops = Array.isArray(fetched.backdrops) && fetched.backdrops.length > 0;
            if (hasBackdrops || languagesToTry.length === 1) {
              break;
            }
            const fallbackLanguage = languagesToTry[index + 1];
            if (fallbackLanguage) {
              logger.debug('Primary TMDB hero details missing backdrops, attempting fallback language', {
                namespace: 'hero',
                id: entry.id,
                language: lang,
                fallbackLanguage,
              });
            }
            continue;
          }
          fallbackDetails = fetched;
          break;
        } catch (error) {
          if ((error as TmdbRateLimitError)?.code === 'RATE_LIMIT') {
            hitLimit = true;
            logger.warn('TMDB rate limit hit while fetching hero details', {
              namespace: 'hero',
              id: entry.id,
              language: lang,
            });
            break;
          }
          logger.warn(
            ids.tmdb ? 'Failed to enrich hero entry via TMDB' : 'Failed to enrich hero entry via TMDB (imdb fallback)',
            {
              namespace: 'hero',
              error: error instanceof Error ? error.message : error,
              id: entry.id,
              language: lang,
              ...(ids.imdb && !ids.tmdb ? { imdb: ids.imdb } : {}),
            },
          );
        }
      }

      if (primaryDetails && fallbackDetails) {
        const mergedBackdrops = dedupeImages([
          ...(Array.isArray(primaryDetails.backdrops) ? primaryDetails.backdrops : []),
          ...(Array.isArray(fallbackDetails.backdrops) ? fallbackDetails.backdrops : []),
        ]);
        const poster = primaryDetails.poster ?? fallbackDetails.poster ?? null;
        const fallbackLanguage = languagesToTry.length > 1 ? languagesToTry[1] : null;
        if (
          mergedBackdrops.length >
          (Array.isArray(primaryDetails.backdrops) ? primaryDetails.backdrops.length : 0)
        ) {
          logger.debug('Merged TMDB hero backdrops from fallback language', {
            namespace: 'hero',
            id: entry.id,
            primaryLanguage: languagesToTry[0],
            fallbackLanguage,
            mergedCount: mergedBackdrops.length,
          });
        }
        return {
          details: {
            ...primaryDetails,
            backdrops: mergedBackdrops,
            poster,
          },
          rateLimitHit: hitLimit,
        };
      }

      return {
        details: primaryDetails ?? fallbackDetails ?? null,
        rateLimitHit: hitLimit,
      };
    };

    for (const entry of selection) {
      const ids = extractIds(entry.raw);
      const thumbnails = thumbnailMap.get(entry.raw.id) ?? [];
      const { details, rateLimitHit: hitLimitForEntry } = await fetchDetailsForEntry(entry, ids, language);
      if (hitLimitForEntry) {
        rateLimitHit = true;
      }
      if (details?.id && !ids.tmdb) {
        ids.tmdb = String(details.id);
      }
      const normalized = buildNormalizedItem(
        entry,
        entry.slot,
        mediaKind,
        entry.raw,
        ids,
        details,
        thumbnails,
      );
      items.push(normalized);
    }
    return { items, rateLimitHit };
  };

  const buildPool = async (kind: HeroKind, options: { force?: boolean } = {}): Promise<HeroPoolPayload> => {
    const { policy, hash: policyHash } = await loadPolicy({ force: options.force });
    const normalizedKind: HeroKind = kind === 'series' ? 'series' : 'movies';
    const stored = loadStored(normalizedKind);
    const nowTs = Date.now();

    if (!options.force && stored?.payload && stored.row.expiresAt > nowTs && stored.row.policyHash === policyHash) {
      const payload = stored.payload;
      return {
        ...payload,
        fromCache: true,
        meta: {
          ...payload.meta,
          source: 'cache',
          tmdb: buildTmdbMeta(payload.meta?.tmdb?.hitLimit ?? false),
        },
      };
    }

    const poolSize = normalizedKind === 'series' ? policy.poolSizeSeries : policy.poolSizeMovies;
    if (!poolSize || poolSize <= 0) {
      return {
        kind: normalizedKind,
        items: [],
        updatedAt: nowTs,
        expiresAt: nowTs,
        policyHash,
        slotSummary: {},
        matchesPolicy: true,
        fromCache: false,
        meta: {
          source: 'fresh',
          plan: {},
          totalCandidates: 0,
          selectionCount: 0,
          tmdb: buildTmdbMeta(false),
        },
      };
    }

    const allMedia = mediaRepository.listAll();
    const candidates = allMedia.filter((record) =>
      normalizedKind === 'series' ? record.mediaType === 'tv' : record.mediaType === 'movie',
    );

    const thumbnailMap: Map<number, string[]> = new Map();
    if (thumbnailRepository) {
      const mediaIds = candidates.map((record) => record.id).filter((id) => Number.isFinite(id));
      if (mediaIds.length > 0) {
        const grouped = thumbnailRepository.listByMediaIds(mediaIds);
        grouped.forEach((records, mediaId) => {
          const paths = dedupeImages(records.map((entry) => entry.path));
          if (paths.length > 0) {
            thumbnailMap.set(mediaId, paths);
          }
        });
      }
    }

    const plan = computeSlotPlan(poolSize, policy.slots);
    const historyEntries = stored?.history ?? [];
    const historySnapshot = buildHistorySnapshot(historyEntries, nowTs, HISTORY_WINDOW_MS, HISTORY_LIMIT);
    const context = classifyCandidates(candidates, plan, policy.diversity, historySnapshot);
    const trimmedSelection = context.selected.slice(0, poolSize);

    const { items, rateLimitHit } = await normalizeSelection(
      trimmedSelection,
      normalizedKind,
      policy,
      thumbnailMap,
    );
    const ttlMs = Math.max(1, (policy.cache?.ttlHours ?? 24) * 60 * 60 * 1000);
    const updatedAt = nowTs;
    const expiresAt = updatedAt + ttlMs;

    const payload: HeroPoolPayload = {
      kind: normalizedKind,
      items,
      updatedAt,
      expiresAt,
      policyHash,
      slotSummary: context.summary,
      matchesPolicy: true,
      fromCache: false,
      meta: {
        source: 'fresh',
        plan,
        totalCandidates: candidates.length,
        selectionCount: items.length,
        tmdb: buildTmdbMeta(rateLimitHit),
      },
    };

    const nextHistory = updateHistory(historyEntries, items, updatedAt);
    const serializedPayload = JSON.stringify(payload);
    const serializedHistory = serializeHistory(nextHistory);

    drizzleDatabase
      .insert(heroPools)
      .values({
        kind: normalizedKind,
        policyHash,
        payload: serializedPayload,
        history: serializedHistory,
        expiresAt,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: heroPools.kind,
        set: {
          policyHash,
          payload: serializedPayload,
          history: serializedHistory,
          expiresAt,
          updatedAt,
        },
      })
      .run();

    return payload;
  };

  const getPool = async (kind: HeroKind, options: { force?: boolean } = {}) => buildPool(kind, options);
  const setTmdbService = (next: TmdbService | null) => {
    activeTmdbService = next ?? null;
  };

  return {
    getPool,
    setTmdbService,
  };
};

export default createHeroPipelineService;
