import {
  collectionTags,
  getGenreNames,
  humanYear,
  normalizeText,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  type MediaFilterOptions,
  type MediaPaginationOptions,
  type SortKey,
} from '@plex-exporter/shared';

import type {
  LibraryKind,
  LoadLibraryOptions,
  MovieExportEntry,
  ShowExportEntry,
} from './exportService.js';

const SORT_KEYS: SortKey[] = ['title-asc', 'title-desc', 'year-desc', 'year-asc', 'added-desc'];

const collator = new Intl.Collator('de', { sensitivity: 'base', ignorePunctuation: true });

const normalizeSortKey = (value: SortKey | undefined): SortKey => {
  if (!value) return 'title-asc';
  return SORT_KEYS.includes(value) ? value : 'title-asc';
};

const ensureArray = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (value == null) return [];
  return [value as T];
};

const parseAddedAt = (value: unknown): number | null => {
  if (!value) return null;
  const ts = Date.parse(String(value));
  return Number.isFinite(ts) ? ts : null;
};

const parseYear = (entry: unknown): number | null => {
  const yearString = humanYear(entry as { originallyAvailableAt?: unknown });
  if (!yearString) return null;
  const parsed = Number.parseInt(yearString, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const computeIsNew = (addedAtMs: number | null, newDays: number | undefined, now: number): boolean => {
  if (!addedAtMs) return false;
  const days = Number.isFinite(newDays) && (newDays ?? 0) > 0 ? Number(newDays) : 30;
  const maxAge = days * DAY_IN_MS;
  return now - addedAtMs <= maxAge;
};

const extractRoleTokens = (entry: unknown): string[] => {
  const roles = ensureArray<unknown>((entry as { roles?: unknown })?.roles);
  const tokens: string[] = [];
  for (const role of roles) {
    if (!role || typeof role !== 'object') continue;
    const raw = String(
      (role as { tag?: unknown; role?: unknown; name?: unknown }).tag ??
        (role as { role?: unknown; name?: unknown }).role ??
        (role as { name?: unknown }).name ??
        '',
    ).trim();
    if (raw) tokens.push(raw);
  }
  return tokens;
};

const buildSearchText = (entry: MovieExportEntry | ShowExportEntry): string => {
  const parts: string[] = [];
  const { title, originalTitle, summary, studio } = entry as {
    title?: unknown;
    originalTitle?: unknown;
    summary?: unknown;
    studio?: unknown;
  };

  if (title) parts.push(String(title));
  if (originalTitle) parts.push(String(originalTitle));
  if (summary) parts.push(String(summary));
  if (studio) parts.push(String(studio));

  getGenreNames((entry as { genres?: unknown }).genres).forEach((genre) => parts.push(genre));
  extractRoleTokens(entry).forEach((token) => parts.push(token));
  collectionTags(entry as { collections?: unknown }).forEach((token) => parts.push(token));

  return parts.filter(Boolean).join(' ');
};

export interface SearchIndexMeta {
  normalizedSearch: string;
  searchTokens: string[];
  genres: string[];
  genreSet: Set<string>;
  collections: string[];
  collectionSet: Set<string>;
  year: number | null;
  addedAt: number | null;
  normalizedTitle: string;
  sortTitle: string;
}

export interface IndexedMediaEntry<T extends MovieExportEntry | ShowExportEntry> {
  id: string;
  kind: LibraryKind;
  entry: T;
  meta: SearchIndexMeta;
}

export interface SearchIndexLibrary<T extends MovieExportEntry | ShowExportEntry> {
  kind: LibraryKind;
  entries: Array<IndexedMediaEntry<T>>;
  updatedAt: number;
}

type AnySearchIndexLibrary = SearchIndexLibrary<MovieExportEntry> | SearchIndexLibrary<ShowExportEntry>;

export interface SearchFacets {
  genres: string[];
  years: number[];
  collections: string[];
}

type CacheEntry<T extends MovieExportEntry | ShowExportEntry> = {
  source: T[];
  index: SearchIndexLibrary<T>;
};

const facetCache = new Map<string, SearchFacets>();
const facetCacheKeysByKind = new Map<LibraryKind, string>();

const buildFacetCacheKey = (library: AnySearchIndexLibrary): string => {
  return `${library.kind}:${library.updatedAt}`;
};

const sortStrings = (values: Iterable<string>): string[] => {
  return Array.from(values).sort((a, b) => collator.compare(a ?? '', b ?? ''));
};

const sortNumbers = (values: Iterable<number>): number[] => {
  return Array.from(values).sort((a, b) => a - b);
};

const getLibraryFacets = (library: AnySearchIndexLibrary): SearchFacets => {
  const cacheKey = buildFacetCacheKey(library);
  const cached = facetCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const genres = new Set<string>();
  const years = new Set<number>();
  const collections = new Set<string>();

  for (const entry of library.entries) {
    for (const genre of entry.meta.genreSet) {
      genres.add(genre);
    }
    if (entry.meta.year != null) {
      years.add(entry.meta.year);
    }
    for (const collection of entry.meta.collectionSet) {
      collections.add(collection);
    }
  }

  const facets: SearchFacets = {
    genres: sortStrings(genres),
    years: sortNumbers(years),
    collections: sortStrings(collections),
  };

  const previousKey = facetCacheKeysByKind.get(library.kind);
  if (previousKey && previousKey !== cacheKey) {
    facetCache.delete(previousKey);
  }

  facetCache.set(cacheKey, facets);
  facetCacheKeysByKind.set(library.kind, cacheKey);

  return facets;
};

export const buildFacets = (...libraries: Array<AnySearchIndexLibrary | null | undefined>): SearchFacets => {
  const validLibraries = libraries.filter((library): library is AnySearchIndexLibrary => Boolean(library));

  if (validLibraries.length === 0) {
    return { genres: [], years: [], collections: [] };
  }

  if (validLibraries.length === 1) {
    return getLibraryFacets(validLibraries[0]);
  }

  const genres = new Set<string>();
  const years = new Set<number>();
  const collections = new Set<string>();

  for (const library of validLibraries) {
    const facets = getLibraryFacets(library);
    for (const genre of facets.genres) {
      genres.add(genre);
    }
    for (const year of facets.years) {
      years.add(year);
    }
    for (const collection of facets.collections) {
      collections.add(collection);
    }
  }

  return {
    genres: sortStrings(genres),
    years: sortNumbers(years),
    collections: sortStrings(collections),
  };
};

const toIdentifier = (entry: MovieExportEntry | ShowExportEntry): string => {
  const rawId =
    (entry as { ratingKey?: unknown }).ratingKey ??
    (entry as { guid?: unknown }).guid ??
    (entry as { title?: unknown }).title ??
    '';
  return String(rawId);
};

const toLibraryKind = (entry: MovieExportEntry | ShowExportEntry, fallback: LibraryKind): LibraryKind => {
  const raw = (entry as { type?: unknown }).type;
  if (raw === 'movie' || raw === 'show') return raw;
  if (raw === 'series' || raw === 'tv') return 'show';
  return fallback;
};

const createIndexedEntry = <T extends MovieExportEntry | ShowExportEntry>(
  entry: T,
  kind: LibraryKind,
): IndexedMediaEntry<T> => {
  const normalizedTitle = normalizeText((entry as { title?: unknown }).title ?? '');
  const searchText = buildSearchText(entry);
  const normalizedSearch = normalizeText(searchText);
  const searchTokens = normalizedSearch.split(/\s+/).filter(Boolean);
  const genres = getGenreNames((entry as { genres?: unknown }).genres);
  const collections = collectionTags(entry as { collections?: unknown });
  const year = parseYear(entry);
  const addedAt = parseAddedAt((entry as { addedAt?: unknown }).addedAt);

  return {
    id: toIdentifier(entry),
    kind: toLibraryKind(entry, kind),
    entry,
    meta: {
      normalizedSearch,
      searchTokens,
      genres,
      genreSet: new Set(genres),
      collections,
      collectionSet: new Set(collections),
      year,
      addedAt,
      normalizedTitle,
      sortTitle: String((entry as { title?: unknown }).title ?? ''),
    },
  };
};

const matchesFilters = <T extends MovieExportEntry | ShowExportEntry>(
  item: IndexedMediaEntry<T>,
  filters: MediaFilterOptions,
  now: number,
): boolean => {
  const {
    query = '',
    onlyNew = false,
    yearFrom = null,
    yearTo = null,
    genres = [],
    collection = '',
    newDays,
  } = filters || {};

  if (query) {
    const needle = normalizeText(query);
    if (!item.meta.normalizedSearch.includes(needle)) {
      return false;
    }
  }

  if (onlyNew && !computeIsNew(item.meta.addedAt, newDays, now)) {
    return false;
  }

  if (yearFrom != null) {
    if (item.meta.year == null || item.meta.year < yearFrom) {
      return false;
    }
  }

  if (yearTo != null) {
    if (item.meta.year == null || item.meta.year > yearTo) {
      return false;
    }
  }

  if (Array.isArray(genres) && genres.length > 0) {
    for (const genre of genres) {
      if (!item.meta.genreSet.has(genre)) {
        return false;
      }
    }
  }

  if (collection) {
    if (!item.meta.collectionSet.has(collection)) {
      return false;
    }
  }

  return true;
};

const compareBySortKey = <T extends MovieExportEntry | ShowExportEntry>(
  a: IndexedMediaEntry<T>,
  b: IndexedMediaEntry<T>,
  sortKey: SortKey,
): number => {
  const compareTitle = () => collator.compare(a.meta.sortTitle, b.meta.sortTitle);

  switch (sortKey) {
    case 'year-desc': {
      const diff = (b.meta.year ?? 0) - (a.meta.year ?? 0);
      if (diff !== 0) return diff;
      return compareTitle();
    }
    case 'year-asc': {
      const diff = (a.meta.year ?? 0) - (b.meta.year ?? 0);
      if (diff !== 0) return diff;
      return compareTitle();
    }
    case 'title-desc':
      return collator.compare(b.meta.sortTitle, a.meta.sortTitle);
    case 'added-desc': {
      const diff = (b.meta.addedAt ?? 0) - (a.meta.addedAt ?? 0);
      if (diff !== 0) return diff;
      return compareTitle();
    }
    case 'title-asc':
    default:
      return compareTitle();
  }
};

const normalizePagination = (pagination: MediaPaginationOptions = {}): { offset: number; limit: number } => {
  const toInteger = (value: unknown, fallback: number): number => {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    const int = Math.floor(num);
    return Number.isFinite(int) ? int : fallback;
  };

  const offset = Math.max(0, toInteger(pagination.offset ?? 0, 0));
  const requestedLimit = toInteger(pagination.limit ?? DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE);
  const limit = Math.min(Math.max(requestedLimit, 0), MAX_PAGE_SIZE);
  return { offset, limit };
};

export const filterIndexedMediaItems = <T extends MovieExportEntry | ShowExportEntry>(
  items: Array<IndexedMediaEntry<T>>,
  filters: MediaFilterOptions = {},
  now: number = Date.now(),
): Array<IndexedMediaEntry<T>> => {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const sortKey = normalizeSortKey(filters.sort);
  const filtered = items.filter((item) => matchesFilters(item, filters, now));
  return filtered.sort((a, b) => compareBySortKey(a, b, sortKey));
};

export interface IndexedMediaPage<T extends MovieExportEntry | ShowExportEntry> {
  items: Array<IndexedMediaEntry<T>>;
  total: number;
}

export const filterIndexedMediaItemsPaged = <T extends MovieExportEntry | ShowExportEntry>(
  items: Array<IndexedMediaEntry<T>>,
  filters: MediaFilterOptions = {},
  pagination: MediaPaginationOptions = {},
  now: number = Date.now(),
): IndexedMediaPage<T> => {
  const sorted = filterIndexedMediaItems(items, filters, now);
  const total = sorted.length;
  if (total === 0) {
    return { items: [], total: 0 };
  }

  const { offset, limit } = normalizePagination(pagination);
  if (limit <= 0) {
    return { items: [], total };
  }

  const start = Math.min(offset, total);
  const end = Math.min(start + limit, total);
  return {
    items: sorted.slice(start, end),
    total,
  };
};

type ExportServiceInstance = {
  loadMovies(options?: LoadLibraryOptions): Promise<MovieExportEntry[]>;
  loadSeries(options?: LoadLibraryOptions): Promise<ShowExportEntry[]>;
};

export interface SearchIndexService {
  getIndexedLibrary(kind: 'movie', options?: LoadLibraryOptions): Promise<SearchIndexLibrary<MovieExportEntry>>;
  getIndexedLibrary(kind: 'show', options?: LoadLibraryOptions): Promise<SearchIndexLibrary<ShowExportEntry>>;
}

export interface SearchIndexServiceOptions {
  exportService: ExportServiceInstance;
}

type LibraryEntryMap = {
  movie: MovieExportEntry;
  show: ShowExportEntry;
};

export const createSearchIndexService = ({ exportService }: SearchIndexServiceOptions): SearchIndexService => {
  const cache = new Map<LibraryKind, CacheEntry<MovieExportEntry | ShowExportEntry>>();

  const buildIndex = <T extends MovieExportEntry | ShowExportEntry>(
    kind: LibraryKind,
    entries: T[],
  ): SearchIndexLibrary<T> => {
    const indexed = entries.map((entry) => createIndexedEntry(entry, kind));
    return { kind, entries: indexed, updatedAt: Date.now() };
  };

  const getCached = <T extends MovieExportEntry | ShowExportEntry>(
    kind: LibraryKind,
  ): CacheEntry<T> | undefined => {
    return cache.get(kind) as CacheEntry<T> | undefined;
  };

  const setCached = <T extends MovieExportEntry | ShowExportEntry>(
    kind: LibraryKind,
    entry: CacheEntry<T>,
  ) => {
    cache.set(kind, entry as CacheEntry<MovieExportEntry | ShowExportEntry>);
  };

  const getIndexedLibraryInternal = async <T extends MovieExportEntry | ShowExportEntry>(
    kind: LibraryKind,
    loader: () => Promise<T[]>,
    force: boolean,
  ): Promise<SearchIndexLibrary<T>> => {
    const data = await loader();
    const cached = getCached<T>(kind);
    if (cached && cached.source === data && !force) {
      return cached.index;
    }

    const index = buildIndex(kind, data);
    setCached(kind, { source: data, index });
    return index;
  };

  const getIndexedLibrary = async <K extends LibraryKind>(
    kind: K,
    options?: LoadLibraryOptions,
  ): Promise<SearchIndexLibrary<LibraryEntryMap[K]>> => {
    const force = options?.force === true;
    if (kind === 'movie') {
      return (await getIndexedLibraryInternal(
        'movie',
        () => exportService.loadMovies(options),
        force,
      )) as SearchIndexLibrary<LibraryEntryMap[K]>;
    }

    return (await getIndexedLibraryInternal(
      'show',
      () => exportService.loadSeries(options),
      force,
    )) as SearchIndexLibrary<LibraryEntryMap[K]>;
  };

  return {
    getIndexedLibrary: getIndexedLibrary as SearchIndexService['getIndexedLibrary'],
  };
};

export default createSearchIndexService;
