import { DEFAULT_PAGE_SIZE } from '@plex-exporter/shared';

const S = {
  view: 'movies',
  movies: [],
  shows: [],
  facets: {},
  filtered: [],
  filteredMeta: { page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0 },
  cfg: {},
  heroPolicy: null,
  heroPolicyIssues: [],
};
const listeners = new Set();

export const getState = () => S;
export function setState(patch){ Object.assign(S, patch); listeners.forEach(fn=>fn(S)); }
export function subscribe(fn){ listeners.add(fn); return ()=>listeners.delete(fn); }
