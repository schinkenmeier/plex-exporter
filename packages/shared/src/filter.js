import { collectionTags, getGenreNames, humanYear, isMediaNew, normalizeText } from './media.js';

const SORT_KEYS = ['title-asc', 'title-desc', 'year-desc', 'year-asc', 'added-desc'];
export const DEFAULT_PAGE_SIZE = 48;
export const MAX_PAGE_SIZE = 200;

const normalizeSortKey = (value) => {
  const raw = typeof value === 'string' ? value : '';
  return SORT_KEYS.includes(raw) ? raw : 'title-asc';
};

const toSearchString = (item) => {
  const parts = [];
  if (item && item.title) parts.push(String(item.title));
  if (item && item.originalTitle) parts.push(String(item.originalTitle));
  if (item && item.summary) parts.push(String(item.summary));
  if (item && item.studio) parts.push(String(item.studio));
  getGenreNames(item && item.genres).forEach((genre) => parts.push(genre));
  const roles = Array.isArray(item && item.roles) ? item.roles : [];
  for (const role of roles) {
    if (!role || typeof role !== 'object') continue;
    const value = String(role.tag ?? role.role ?? role.name ?? '').trim();
    if (value) parts.push(value);
  }
  collectionTags(item).forEach((tag) => parts.push(tag));
  return parts.filter(Boolean).join(' ');
};

const matchesFilters = (item, filters, now) => {
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
    const haystack = normalizeText(toSearchString(item));
    if (!haystack.includes(normalizeText(query))) {
      return false;
    }
  }

  if (onlyNew && !isMediaNew(item, newDays ?? 30, now)) {
    return false;
  }

  const yearValue = Number.parseInt(humanYear(item) || '', 10) || null;
  if (yearFrom && (!yearValue || yearValue < yearFrom)) {
    return false;
  }
  if (yearTo && (!yearValue || yearValue > yearTo)) {
    return false;
  }

  if (Array.isArray(genres) && genres.length) {
    const itemGenres = new Set(getGenreNames(item && item.genres));
    for (const genre of genres) {
      if (!itemGenres.has(genre)) {
        return false;
      }
    }
  }

  if (collection) {
    const tags = new Set(collectionTags(item));
    if (!tags.has(collection)) {
      return false;
    }
  }

  return true;
};

const compareBySortKey = (a, b, sortKey) => {
  switch (sortKey) {
    case 'year-desc': {
      const diff = (Number(humanYear(b)) || 0) - (Number(humanYear(a)) || 0);
      if (diff !== 0) return diff;
      return String(a?.title ?? '').localeCompare(String(b?.title ?? ''), 'de');
    }
    case 'year-asc': {
      const diff = (Number(humanYear(a)) || 0) - (Number(humanYear(b)) || 0);
      if (diff !== 0) return diff;
      return String(a?.title ?? '').localeCompare(String(b?.title ?? ''), 'de');
    }
    case 'title-desc':
      return String(b?.title ?? '').localeCompare(String(a?.title ?? ''), 'de');
    case 'added-desc': {
      const getTime = (item) => {
        if (!item || !item.addedAt) return 0;
        const date = new Date(item.addedAt);
        return Number.isFinite(date.getTime()) ? date.getTime() : 0;
      };
      const diff = getTime(b) - getTime(a);
      if (diff !== 0) return diff;
      return String(a?.title ?? '').localeCompare(String(b?.title ?? ''), 'de');
    }
    case 'title-asc':
    default:
      return String(a?.title ?? '').localeCompare(String(b?.title ?? ''), 'de');
  }
};

const filterAndSortMediaItems = (items, filters = {}, now = Date.now()) => {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }
  const normalizedFilters = {
    ...filters,
    sort: normalizeSortKey(filters.sort),
  };
  const filtered = items.filter((item) => matchesFilters(item, normalizedFilters, now));
  const sortKey = normalizedFilters.sort || 'title-asc';
  return filtered.sort((a, b) => compareBySortKey(a, b, sortKey));
};

export const filterMediaItems = (items, filters = {}, now = Date.now()) => {
  return filterAndSortMediaItems(items, filters, now);
};

const toInteger = (value, fallback = 0) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const int = Math.floor(num);
  return Number.isFinite(int) ? int : fallback;
};

const normalizePagination = (pagination = {}) => {
  const offset = Math.max(0, toInteger(pagination.offset, 0));
  const requestedLimit = toInteger(pagination.limit, DEFAULT_PAGE_SIZE);
  const limit = Math.min(Math.max(requestedLimit, 0), MAX_PAGE_SIZE);
  return {
    offset,
    limit,
  };
};

export const filterMediaItemsPaged = (items, filters = {}, pagination = {}, now = Date.now()) => {
  const sorted = filterAndSortMediaItems(items, filters, now);
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

export const computeFacets = (movies, shows) => {
  const genres = new Set();
  const years = new Set();
  const collections = new Set();

  const add = (list) => {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      getGenreNames(item && item.genres).forEach((genre) => genres.add(genre));
      const year = Number.parseInt(humanYear(item) || '', 10);
      if (Number.isFinite(year)) {
        years.add(year);
      }
      collectionTags(item).forEach((tag) => collections.add(tag));
    }
  };

  add(movies);
  add(shows);

  return {
    genres: Array.from(genres).sort((a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'de')),
    years: Array.from(years).sort((a, b) => a - b),
    collections: Array.from(collections).sort((a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'de')),
  };
};

export const SORT_KEY_VALUES = SORT_KEYS.slice();
