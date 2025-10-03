import { prefixShowThumb } from '../data.js';

function deepClone(value){
  if(value == null || typeof value !== 'object') return value;
  if(typeof structuredClone === 'function'){
    try{ return structuredClone(value); }
    catch{}
  }
  try{ return JSON.parse(JSON.stringify(value)); }
  catch{}
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
  return clone;
}

export function mapShow(item){
  if(!item || typeof item !== 'object') return null;
  const clone = deepClone(item);
  if(clone.type !== 'tv') clone.type = 'tv';
  normalizeShow(clone);
  return clone;
}

export function mapDetail(detail){
  if(!detail || typeof detail !== 'object') return null;
  const clone = deepClone(detail);
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

export function normalizePeopleList(list){
  if(!Array.isArray(list)) return [];
  return list.map(entry => {
    if(!entry) return null;
    if(typeof entry === 'string'){
      const tag = entry.trim();
      return tag ? { tag } : null;
    }
    if(typeof entry === 'object'){
      const tag = String(entry.tag || entry.name || entry.role || '').trim();
      return tag ? { ...entry, tag } : { ...entry };
    }
    return null;
  }).filter(Boolean);
}
