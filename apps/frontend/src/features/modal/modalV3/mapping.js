import { prefixShowThumb } from '../../../js/data.js';

const GUID_PATTERNS = {
  imdb: [
    'imdb://',
    'com.plexapp.agents.imdb://'
  ],
  tvdb: [
    'tvdb://',
    'thetvdb://',
    'com.plexapp.agents.thetvdb://'
  ],
  tmdb: [
    'tmdb://',
    'themoviedb://',
    'com.plexapp.agents.themoviedb://'
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

  assign('imdb', target.imdbId);
  assign('tvdb', target.tvdbId);
  assign('tmdb', target.tmdbId);

  const guidSources = [];
  if(Array.isArray(target?.guids)) guidSources.push(...target.guids);
  if(target?.guid) guidSources.push(target.guid);

  guidSources.forEach(source=>{
    const parsed = parseGuidEntry(source);
    Object.entries(parsed).forEach(([key, value])=> assign(key, value));
  });

  if(Object.keys(ids).length){
    target.ids = ids;
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

export function mapTmdbShow(detail){
  if(!detail || typeof detail !== 'object') return null;
  const yearFromDate = (value)=>{
    if(!value || typeof value !== 'string') return '';
    const match = value.match(/(\d{4})/);
    return match ? match[1] : '';
  };
  const seasons = Array.isArray(detail.seasons) ? detail.seasons.map(season => ({
    id: season?.id ?? null,
    seasonNumber: Number.isFinite(season?.seasonNumber) ? Number(season.seasonNumber) : Number.isFinite(season?.season_number) ? Number(season.season_number) : null,
    title: season?.title || season?.name || '',
    summary: season?.overview || '',
    overview: season?.overview || '',
    airDate: season?.airDate || season?.air_date || null,
    episodeCount: season?.episodeCount ?? season?.episode_count ?? null,
    poster: season?.poster ?? season?.posterPath ?? null,
  })) : [];

  return {
    type: 'tv',
    title: detail.title || detail.originalTitle || '',
    originalTitle: detail.originalTitle || '',
    summary: detail.overview || '',
    overview: detail.overview || '',
    tagline: detail.tagline || '',
    releaseDate: detail.firstAirDate || detail.releaseDate || null,
    firstAirDate: detail.firstAirDate || null,
    year: yearFromDate(detail.firstAirDate || detail.releaseDate),
    runtimeMin: detail.runtimeMinutes ?? null,
    tmdbId: detail.id ?? null,
    ids: detail.id ? { tmdb: String(detail.id) } : undefined,
    genres: Array.isArray(detail.genres) ? detail.genres : [],
    contentRating: detail.certification || '',
    rating: detail.voteAverage ?? null,
    tmdbRating: detail.voteAverage ?? null,
    tmdbVoteCount: detail.voteCount ?? null,
    poster: detail.poster || null,
    backdrop: Array.isArray(detail.backdrops) ? (detail.backdrops[0] || null) : null,
    backdrops: Array.isArray(detail.backdrops) ? detail.backdrops : [],
    seasons,
  };
}

export function mapTmdbMovie(detail){
  if(!detail || typeof detail !== 'object') return null;
  const yearFromDate = (value)=>{
    if(!value || typeof value !== 'string') return '';
    const match = value.match(/(\d{4})/);
    return match ? match[1] : '';
  };
  return {
    type: 'movie',
    title: detail.title || detail.originalTitle || '',
    originalTitle: detail.originalTitle || '',
    summary: detail.overview || '',
    overview: detail.overview || '',
    tagline: detail.tagline || '',
    releaseDate: detail.releaseDate || null,
    year: yearFromDate(detail.releaseDate),
    runtimeMin: detail.runtimeMinutes ?? null,
    tmdbId: detail.id ?? null,
    ids: detail.id ? { tmdb: String(detail.id) } : undefined,
    genres: Array.isArray(detail.genres) ? detail.genres : [],
    contentRating: detail.certification || '',
    rating: detail.voteAverage ?? null,
    tmdbRating: detail.voteAverage ?? null,
    tmdbVoteCount: detail.voteCount ?? null,
    poster: detail.poster || null,
    backdrop: Array.isArray(detail.backdrops) ? (detail.backdrops[0] || null) : null,
    backdrops: Array.isArray(detail.backdrops) ? detail.backdrops : [],
  };
}

export function mergeShowSources(tmdbShow, localShow){
  const prefer = (primary, fallback) => {
    if(primary === undefined || primary === null || primary === '') return fallback ?? null;
    return primary;
  };

  const merged = { ...(tmdbShow || {}), ...(tmdbShow ? {} : (localShow || {})) };

  merged.type = 'tv';
  merged.ids = { ...(localShow?.ids || {}), ...(tmdbShow?.ids || {}) };
  merged.tmdbId = prefer(tmdbShow?.tmdbId, localShow?.tmdbId);

  merged.title = prefer(tmdbShow?.title, localShow?.title);
  merged.originalTitle = prefer(tmdbShow?.originalTitle, localShow?.originalTitle);
  merged.tagline = prefer(tmdbShow?.tagline, localShow?.tagline);
  merged.summary = prefer(tmdbShow?.summary, localShow?.summary);
  merged.overview = prefer(tmdbShow?.overview, localShow?.overview);
  merged.releaseDate = prefer(tmdbShow?.releaseDate, localShow?.releaseDate);
  merged.firstAirDate = prefer(tmdbShow?.firstAirDate, localShow?.firstAirDate);
  merged.year = prefer(tmdbShow?.year, localShow?.year);
  merged.contentRating = prefer(tmdbShow?.contentRating, localShow?.contentRating);

  merged.runtimeMin = prefer(tmdbShow?.runtimeMin, localShow?.runtimeMin ?? localShow?.durationMin);
  merged.duration = prefer(localShow?.duration, null);
  merged.rating = prefer(tmdbShow?.rating, localShow?.rating ?? localShow?.audienceRating);
  merged.tmdbRating = prefer(tmdbShow?.tmdbRating, localShow?.tmdbRating);
  merged.tmdbVoteCount = prefer(tmdbShow?.tmdbVoteCount, localShow?.tmdbVoteCount);

  merged.backdrops = tmdbShow?.backdrops || localShow?.backdrops || [];
  merged.backdrop = prefer(tmdbShow?.backdrop, localShow?.backdrop ?? localShow?.art);
  merged.poster = prefer(tmdbShow?.poster, localShow?.poster ?? localShow?.thumbFile ?? localShow?.thumb);

  merged.genres = (tmdbShow?.genres && tmdbShow.genres.length) ? tmdbShow.genres : (localShow?.genres || []);
  merged.studio = prefer(localShow?.studio, localShow?.network);

  merged.cast = Array.isArray(localShow?.cast) ? localShow.cast : Array.isArray(localShow?.roles) ? localShow.roles : [];

  merged.seasons = mergeSeasons(tmdbShow?.seasons || [], localShow?.seasons || []);

  normalizeShow(merged);
  return merged;
}

export function mergeMovieSources(tmdbMovie, localMovie){
  const prefer = (primary, fallback) => {
    if(primary === undefined || primary === null || primary === '') return fallback ?? null;
    return primary;
  };

  const merged = { ...(tmdbMovie || {}), ...(tmdbMovie ? {} : (localMovie || {})) };
  merged.type = 'movie';
  merged.ids = { ...(localMovie?.ids || {}), ...(tmdbMovie?.ids || {}) };
  merged.tmdbId = prefer(tmdbMovie?.tmdbId, localMovie?.tmdbId);

  merged.title = prefer(tmdbMovie?.title, localMovie?.title);
  merged.originalTitle = prefer(tmdbMovie?.originalTitle, localMovie?.originalTitle);
  merged.tagline = prefer(tmdbMovie?.tagline, localMovie?.tagline);
  merged.summary = prefer(tmdbMovie?.summary, localMovie?.summary);
  merged.overview = prefer(tmdbMovie?.overview, localMovie?.overview);
  merged.releaseDate = prefer(tmdbMovie?.releaseDate, localMovie?.releaseDate);
  merged.year = prefer(tmdbMovie?.year, localMovie?.year);
  merged.contentRating = prefer(tmdbMovie?.contentRating, localMovie?.contentRating);

  merged.runtimeMin = prefer(tmdbMovie?.runtimeMin, localMovie?.runtimeMin ?? localMovie?.durationMin);
  merged.duration = prefer(localMovie?.duration, null);
  merged.rating = prefer(tmdbMovie?.rating, localMovie?.rating ?? localMovie?.audienceRating);
  merged.tmdbRating = prefer(tmdbMovie?.tmdbRating, localMovie?.tmdbRating);
  merged.tmdbVoteCount = prefer(tmdbMovie?.tmdbVoteCount, localMovie?.tmdbVoteCount);

  merged.backdrops = tmdbMovie?.backdrops || localMovie?.backdrops || [];
  merged.backdrop = prefer(tmdbMovie?.backdrop, localMovie?.backdrop ?? localMovie?.art);
  merged.poster = prefer(tmdbMovie?.poster, localMovie?.poster ?? localMovie?.thumbFile ?? localMovie?.thumb);

  merged.genres = normalizeGenresList((tmdbMovie?.genres && tmdbMovie.genres.length) ? tmdbMovie.genres : (localMovie?.genres || []));
  merged.studio = prefer(localMovie?.studio, localMovie?.network);

  return merged;
}

function mergeSeasons(tmdbSeasons, localSeasons){
  const byNumber = new Map();

  localSeasons.forEach(season => {
    const key = season?.seasonNumber ?? season?.number ?? season?.index ?? null;
    if(key == null) return;
    byNumber.set(Number(key), { ...season });
  });

  const result = [];

  tmdbSeasons.forEach(season => {
    const num = season?.seasonNumber ?? season?.number ?? null;
    const existing = num != null ? byNumber.get(Number(num)) : null;
    const merged = existing ? { ...existing } : {};
    merged.seasonNumber = num != null ? Number(num) : merged.seasonNumber ?? null;
    merged.title = season?.title || merged.title || '';
    merged.summary = season?.summary || merged.summary || '';
    merged.overview = merged.summary;
    merged.airDate = season?.airDate || merged.airDate || null;
    merged.episodeCount = season?.episodeCount ?? merged.episodeCount ?? null;
    merged.poster = season?.poster || merged.poster || null;
    if(existing && Array.isArray(existing.episodes)){
      merged.episodes = existing.episodes;
    }
    result.push(merged);
    if(num != null) byNumber.delete(Number(num));
  });

  for(const [,season] of byNumber.entries()){
    result.push({ ...season });
  }

  return result.sort((a,b)=>{
    const an = Number(a?.seasonNumber ?? 0);
    const bn = Number(b?.seasonNumber ?? 0);
    return an - bn;
  });
}

export { normalizePeopleList };
