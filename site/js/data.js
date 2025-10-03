let lastSources = { movies: null, shows: null };
const showDetailCache = new Map();

const MOVIE_THUMB_BASE = 'data/movies/';
const SHOW_THUMB_BASE = 'data/series/';
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

async function fetchJson(url){
  try{ const r = await fetch(url, { cache:'no-store' }); if(r && r.ok) return await r.json(); }
  catch{}
  return null;
}

function embeddedJsonById(id){
  try{ const n = document.getElementById(id); if(n && n.textContent) return JSON.parse(n.textContent); }
  catch{}
  return null;
}

function fromGlobalBag(key){
  try{ const bag = window.__PLEX_EXPORTER__; const arr = bag && Array.isArray(bag[key]) ? bag[key] : null; return arr || null; }
  catch{ return null; }
}

function fromWindow(varName){
  try{ const arr = Array.isArray(window[varName]) ? window[varName] : null; return arr || null; }
  catch{ return null; }
}

async function loadWithCompat(primaryUrl, opts){
  // default: try site/data first
  let data = await fetchJson(primaryUrl);
  if(Array.isArray(data) && data.length){ markSource(opts?.label, `primary:${primaryUrl}`); return data; }
  // fallback: embedded <script id="..."> JSON
  if(opts?.embedId){ const emb = embeddedJsonById(opts.embedId); if(Array.isArray(emb) && emb.length){ markSource(opts?.label, `embedded:${opts.embedId}`); return emb; } }
  // fallback: global exporter bag
  if(opts?.exportKey){ const bag = fromGlobalBag(opts.exportKey); if(Array.isArray(bag) && bag.length){ markSource(opts?.label, `globalBag:${opts.exportKey}`); return bag; } }
  // fallback: window variable
  if(opts?.globalVar){ const win = fromWindow(opts.globalVar); if(Array.isArray(win) && win.length){ markSource(opts?.label, `window:${opts.globalVar}`); return win; } }
  // alt paths (legacy)
  for(const alt of (opts?.altUrls||[])){
    const j = await fetchJson(alt); if(Array.isArray(j) && j.length){ markSource(opts?.label, `alt:${alt}`); return j; }
  }
  // last resort: empty array
  markSource(opts?.label, 'empty');
  return Array.isArray(data) ? data : [];
}

export function prefixThumbValue(value, base){
  const raw = value == null ? '' : String(value).trim();
  if(!raw) return '';
  if(raw.startsWith('//') || raw.startsWith('/') || SCHEME_RE.test(raw)) return raw;
  const normalizedBase = base ? (base.endsWith('/') ? base : `${base}/`) : '';
  const withoutDots = raw.replace(/^\.\/+/, '');
  if(withoutDots.startsWith('data/')) return withoutDots;
  const cleaned = withoutDots.replace(/^\/+/, '');
  return `${normalizedBase}${cleaned}`;
}


export function prefixThumb(obj, base){
  if(!obj || typeof obj !== 'object') return obj;
  const current = obj.thumbFile ?? obj.thumb ?? '';
  const prefixed = prefixThumbValue(current, base);
  if(prefixed){
    obj.thumbFile = prefixed;
    obj.thumb = prefixed;
  }else if(current){
    const str = String(current);
    obj.thumbFile = str;
    if(obj.thumb == null) obj.thumb = str;
  }
  return obj;
}

export function prefixMovieThumb(obj){
  return prefixThumb(obj, MOVIE_THUMB_BASE);
}

export function prefixShowThumb(obj){
  return prefixThumb(obj, SHOW_THUMB_BASE);
}

export function prefixShowTree(show){
  if(!show || typeof show !== 'object') return show;
  prefixShowThumb(show);
  if(Array.isArray(show.seasons)) show.seasons.forEach(prefixSeasonTree);
  return show;
}

function prefixSeasonTree(season){
  if(!season || typeof season !== 'object') return season;
  prefixShowThumb(season);
  if(Array.isArray(season.episodes)) season.episodes.forEach(ep=>prefixShowThumb(ep));
  return season;
}

function normalizeMovieThumbs(list){
  if(!Array.isArray(list)) return [];
  list.forEach(item=>{ if(item && typeof item === 'object') prefixMovieThumb(item); });
  return list;
}

function normalizeShowThumbs(list){
  if(!Array.isArray(list)) return [];
  list.forEach(item=>{ if(item && typeof item === 'object') prefixShowTree(item); });
  return list;
}

export async function loadMovies(){
  const movies = await loadWithCompat('data/movies/movies.json', {
    label: 'movies',
    embedId: 'movies-json',
    exportKey: 'movies',
    globalVar: '__PLEX_MOVIES__',
    altUrls: [
      'movies/movies.json',
      'data/movies.json',
      'Filme/movies.json',
      'movies.json',
    ],
  });
  return normalizeMovieThumbs(movies);
}
export async function loadShows(){
  const shows = await loadWithCompat('data/series/series_index.json', {
    label: 'shows',
    embedId: 'series-json',
    exportKey: 'shows',
    globalVar: '__PLEX_SHOWS__',
    altUrls: [
      'series/series_index.json',
      'data/shows.json',
      'data/series.json',
      'Serien/series.json',
      'series/series.json',
      'series.json',
      'shows.json',
    ],
  });
  return normalizeShowThumbs(shows);
}

export async function loadShowDetail(item){
  if(!item) return null;
  const keys = cacheKeys(item);
  const cached = getCachedDetail(keys);
  if(cached !== undefined) return cached;

  const urls = detailUrlCandidates(item);
  for(const url of urls){
    const data = await fetchJson(url);
    if(data && typeof data === 'object'){
      const normalized = normalizeShowDetail(data);
      storeDetail(keys, normalized, item);
      return cloneDetail(normalized);
    }
  }
  storeDetail(keys, null, item);
  return null;
}

function markSource(label, src){
  if(!label) return;
  try{ lastSources[label] = src; }catch{}
}

export function getSources(){ return { ...lastSources }; }
export function buildFacets(movies, shows){
  // kept for compatibility; filter.js provides a richer computeFacets
  const genres = new Set();
  const years = new Set();
  (movies||[]).concat(shows||[]).forEach(x=>{
    (x.genres||[]).forEach(g=>{ if(g&&g.tag) genres.add(g.tag); });
    const y = x.year || (x.originallyAvailableAt?String(x.originallyAvailableAt).slice(0,4):'');
    if(y) years.add(Number(y));
  });
  return { genres:[...genres].sort(), years:[...years].sort((a,b)=>a-b), collections: [] };
}

function cacheKeys(item){
  const keys = [];
  if(item?.ratingKey !== undefined && item?.ratingKey !== null && item?.ratingKey !== ''){
    keys.push(`rk:${String(item.ratingKey)}`);
  }
  const href = normalizeHrefKey(item?.href);
  if(href) keys.push(`href:${href}`);
  return keys;
}

function normalizeHrefKey(href){
  if(!href) return '';
  return String(href).trim().replace(/^\.\//,'').replace(/^\/+/, '');
}

function getCachedDetail(keys){
  for(const key of keys){
    if(showDetailCache.has(key)){
      const cached = showDetailCache.get(key);
      return cached ? cloneDetail(cached) : null;
    }
  }
  return undefined;
}

function storeDetail(keys, value, item){
  const val = value;
  keys.forEach(key=>{ showDetailCache.set(key, val); });
  const rk = item?.ratingKey;
  if(rk !== undefined && rk !== null){
    showDetailCache.set(`rk:${String(rk)}`, val);
  }
  const detailKey = value && typeof value === 'object' ? value.ratingKey : undefined;
  if(detailKey !== undefined && detailKey !== null){
    showDetailCache.set(`rk:${String(detailKey)}`, val);
  }
  const href = normalizeHrefKey(item?.href);
  if(href){
    showDetailCache.set(`href:${href}`, val);
  }
  const detailHref = value && typeof value === 'object' ? normalizeHrefKey(value.href) : '';
  if(detailHref){
    showDetailCache.set(`href:${detailHref}`, val);
  }
}

function detailUrlCandidates(item){
  const urls = new Set();
  const hrefKey = normalizeHrefKey(item?.href);
  if(hrefKey){
    if(/^https?:/i.test(hrefKey)){ urls.add(hrefKey); }
    else{
      if(hrefKey.startsWith('data/')) urls.add(hrefKey);
      else urls.add(`data/${hrefKey}`);
      const withoutData = hrefKey.replace(/^data\//,'');
      if(!withoutData.startsWith('series/')) urls.add(`data/series/${withoutData}`);
      const idPart = withoutData.replace(/^series\//,'').replace(/^details\//,'').replace(/\.json$/,'');
      if(idPart) urls.add(`data/series/details/${idPart}.json`);
    }
  }
  const rk = item?.ratingKey;
  if(rk !== undefined && rk !== null){
    urls.add(`data/series/details/${String(rk)}.json`);
  }
  return Array.from(urls);
}

function normalizeShowDetail(data){
  if(!data || typeof data !== 'object') return null;
  const show = { ...data };
  prefixShowThumb(show);
  show.genres = normalizeGenres(show.genres);
  const castList = normalizePeople(show.cast || show.roles || []);
  show.cast = castList;
  show.roles = castList;
  show.seasons = Array.isArray(show.seasons) ? show.seasons.map(normalizeSeason).filter(Boolean) : [];
  show.seasonCount = Number.isFinite(show.seasonCount) ? show.seasonCount : show.seasons.length;
  prefixShowTree(show);
  return show;
}

function normalizeSeason(season){
  if(!season || typeof season !== 'object') return null;
  const out = { ...season };
  prefixShowThumb(out);
  out.genres = normalizeGenres(out.genres);
  out.episodes = Array.isArray(out.episodes) ? out.episodes.map(normalizeEpisode).filter(Boolean) : [];
  prefixSeasonTree(out);
  return out;
}

function normalizeEpisode(ep){
  if(!ep || typeof ep !== 'object') return null;
  const out = { ...ep };
  prefixShowThumb(out);
  out.genres = normalizeGenres(out.genres);
  return out;
}

function normalizeGenres(list){
  if(!Array.isArray(list)) return [];
  const seen = new Set();
  const result = [];
  list.forEach(entry=>{
    let obj = null;
    if(typeof entry === 'string'){
      const tag = entry.trim();
      if(tag) obj = { tag };
    }else if(entry && typeof entry === 'object'){
      const tag = String(entry.tag || entry.title || entry.name || entry.label || '').trim();
      if(tag){ obj = { ...entry, tag }; }
    }
    if(obj && !seen.has(obj.tag)){
      seen.add(obj.tag);
      result.push(obj);
    }
  });
  return result;
}

function normalizePeople(list){
  if(!Array.isArray(list)) return [];
  return list.map(entry=>{
    if(!entry) return null;
    if(typeof entry === 'string'){
      const tag = entry.trim();
      return tag ? { tag } : null;
    }
    if(typeof entry === 'object'){
      const tag = String(entry.tag || entry.name || entry.role || '').trim();
      if(tag){ return { ...entry, tag }; }
      return { ...entry };
    }
    return null;
  }).filter(Boolean);
}

function cloneDetail(detail){
  if(detail === null || detail === undefined) return detail;
  try{ return structuredClone(detail); }catch{}
  try{ return JSON.parse(JSON.stringify(detail)); }catch{}
  return detail;
}
