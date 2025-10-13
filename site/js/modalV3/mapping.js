import { prefixShowThumb } from '../data.js';

const GUID_PATTERNS = {
  tmdb: [
    'tmdb://',
    'themoviedb://',
    'com.plexapp.agents.themoviedb://'
  ],
  imdb: [
    'imdb://',
    'com.plexapp.agents.imdb://'
  ],
  tvdb: [
    'tvdb://',
    'thetvdb://',
    'com.plexapp.agents.thetvdb://'
  ]
};

function isObject(value){
  return value !== null && typeof value === 'object';
}

function parseGuidEntry(entry){
  const raw = isObject(entry) ? (entry.id ?? entry.guid ?? '') : entry;
  const str = typeof raw === 'string' ? raw.trim() : '';
  if(!str) return {};
  const lower = str.toLowerCase();
  const result = {};
  for(const [key, patterns] of Object.entries(GUID_PATTERNS)){
    if(result[key]) continue;
    for(const pattern of patterns){
      const marker = pattern.toLowerCase();
      const idx = lower.indexOf(marker);
      if(idx === -1) continue;
      const start = idx + marker.length;
      let value = str.slice(start);
      value = value.replace(/^\/+/, '');
      value = value.split(/[?#]/)[0];
      if(!value) continue;
      if(value.includes('/')){
        const parts = value.split('/');
        value = parts.find(Boolean) || '';
      }
      value = value.trim();
      if(value){
        result[key] = value;
        break;
      }
    }
  }
  return result;
}

function ensureIds(target){
  if(!target || typeof target !== 'object') return target;
  const ids = { ...(target.ids || {}) };
  const assign = (key, value)=>{
    if(ids[key]) return;
    const str = value == null ? '' : String(value).trim();
    if(str) ids[key] = str;
  };

  assign('tmdb', target.tmdbId);
  assign('tmdb', target?.tmdb?.id);
  assign('imdb', target.imdbId);
  assign('imdb', target?.tmdb?.imdbId);
  assign('tvdb', target.tvdbId);
  assign('tvdb', target?.tmdb?.tvdbId);

  const guidSources = [];
  if(Array.isArray(target?.guids)) guidSources.push(...target.guids);
  if(target?.guid) guidSources.push(target.guid);

  guidSources.forEach(source=>{
    const parsed = parseGuidEntry(source);
    Object.entries(parsed).forEach(([key, value])=> assign(key, value));
  });

  if(Object.keys(ids).length){
    target.ids = ids;
    if(ids.tmdb && !target.tmdbId){
      target.tmdbId = ids.tmdb;
    }
  }
  return target;
}

function deepClone(value){
  if(value == null || typeof value !== 'object') return value;
  if(typeof structuredClone === 'function'){
    try{ return structuredClone(value); }
    catch(err){ console.warn('[modalV3/mapping] structuredClone failed, falling back to JSON clone:', err?.message || err); }
  }
  try{ return JSON.parse(JSON.stringify(value)); }
  catch(err){ console.warn('[modalV3/mapping] JSON clone failed, falling back to manual clone:', err?.message || err); }
  if(Array.isArray(value)) return value.map(entry => deepClone(entry));
  const out = {};
  for(const key of Object.keys(value)){
    out[key] = deepClone(value[key]);
  }
  return out;
}

export function mapMovie(item){
  if(!item || typeof item !== 'object') return null;
  const clone = deepClone(item);
  if(clone.type === 'show') clone.type = 'tv';
  if(!clone.type) clone.type = 'movie';
  ensureIds(clone);
  return clone;
}

export function mapShow(item){
  if(!item || typeof item !== 'object') return null;
  const clone = deepClone(item);
  if(clone.type !== 'tv') clone.type = 'tv';
  ensureIds(clone);
  normalizeShow(clone);
  return clone;
}

export function mapDetail(detail){
  if(!detail || typeof detail !== 'object') return null;
  const clone = deepClone(detail);
  ensureIds(clone);
  normalizeShow(clone);
  return clone;
}

export function needsShowDetail(item){
  const seasons = Array.isArray(item?.seasons) ? item.seasons : [];
  const hasEpisodes = seasons.some(season => Array.isArray(season?.episodes) && season.episodes.length);
  const cast = Array.isArray(item?.cast) ? item.cast : Array.isArray(item?.roles) ? item.roles : [];
  return !seasons.length || !hasEpisodes || !cast.length;
}

export function mergeShowDetail(target, detail){
  if(!target) return target;
  if(detail && typeof detail === 'object'){
    const mapped = mapDetail(detail);
    Object.assign(target, mapped);
    ensureIds(target);
  }
  normalizeShow(target);
  return target;
}

export function normalizeShow(show){
  if(!show || typeof show !== 'object') return;
  normalizeThumbField(show);
  show.genres = normalizeGenresList(show.genres);
  const cast = normalizePeopleList(show.cast || show.roles || []);
  show.cast = cast;
  show.roles = cast;
  show.seasons = Array.isArray(show.seasons) ? show.seasons.map(normalizeSeasonEntry).filter(Boolean) : [];
  const sc = Number(show.seasonCount);
  show.seasonCount = Number.isFinite(sc) && sc > 0 ? sc : show.seasons.length;
}

function normalizeSeasonEntry(season){
  if(!season || typeof season !== 'object') return null;
  const out = { ...season };
  normalizeThumbField(out);
  out.genres = normalizeGenresList(out.genres);
  out.episodes = Array.isArray(out.episodes) ? out.episodes.map(normalizeEpisodeEntry).filter(Boolean) : [];
  return out;
}

function normalizeEpisodeEntry(ep){
  if(!ep || typeof ep !== 'object') return null;
  const out = { ...ep };
  normalizeThumbField(out);
  out.genres = normalizeGenresList(out.genres);
  return out;
}

function normalizeThumbField(obj){
  prefixShowThumb(obj);
}

function normalizePeopleList(list){
  if(!Array.isArray(list)) return [];
  return list.map(entry => {
    if(typeof entry === 'string'){
      const tag = entry.trim();
      if(!tag) return null;
      const normalized = { tag, name: tag };
      prefixShowThumb(normalized);
      return normalized;
    }
    if(!entry || typeof entry !== 'object') return null;
    const rawName = entry?.tag || entry?.name || entry?.title || '';
    const name = String(rawName).trim();
    if(!name) return null;
    const normalized = {
      ...entry,
      tag: name,
      name,
    };
    prefixShowThumb(normalized);
    return normalized;
  }).filter(Boolean);
}

export function normalizeGenresList(list){
  if(!Array.isArray(list)) return [];
  const seen = new Set();
  const result = [];
  list.forEach(entry => {
    let item = null;
    if(typeof entry === 'string'){
      const tag = entry.trim();
      if(tag) item = { tag };
    }else if(entry && typeof entry === 'object'){
      const tag = String(entry.tag || entry.title || entry.name || entry.label || '').trim();
      if(tag){ item = { ...entry, tag }; }
    }
    if(item && !seen.has(item.tag)){
      seen.add(item.tag);
      result.push(item);
    }
  });
  return result;
}

export { normalizePeopleList };
