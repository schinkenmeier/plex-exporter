const S = { view: 'movies', movies: [], shows: [], facets: {}, filtered: [], cfg: {} };
const listeners = new Set();

export const getState = () => S;
export function setState(patch){ Object.assign(S, patch); listeners.forEach(fn=>fn(S)); }
export function subscribe(fn){ listeners.add(fn); return ()=>listeners.delete(fn); }
