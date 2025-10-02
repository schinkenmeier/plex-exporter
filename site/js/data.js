let lastSources = { movies: null, shows: null };

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

export async function loadMovies(){
  return loadWithCompat('data/movies/movies.json', {
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
}
export async function loadShows(){
  return loadWithCompat('data/series/series_index.json', {
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
