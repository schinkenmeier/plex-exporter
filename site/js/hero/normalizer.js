import { fetchDetailsForItem, tmdbImageUrl } from './tmdbClient.js';

const LOG_PREFIX = '[hero:normalizer]';
const BACKDROP_MIN_WIDTH = 1920;
const TMDB_BACKDROP_SIZE = 'original';

function logWarn(...args){
  try {
    console.warn(LOG_PREFIX, ...args);
  } catch (_err) {
    // ignore
  }
}

function cleanString(value){
  if(typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed;
}

function nonEmptyString(value){
  const str = cleanString(value);
  return str ? str : '';
}

function parseYear(value){
  if(value == null) return null;
  if(typeof value === 'number' && Number.isFinite(value)){
    if(value > 1800 && value < 9999) return Math.trunc(value);
  }
  if(typeof value === 'string'){
    const match = value.match(/(19|20|21)\d{2}/);
    if(match) return Number(match[0]);
  }
  return null;
}

function parseDateYear(value){
  if(!value) return null;
  try {
    const date = new Date(value);
    if(Number.isNaN(date.getTime())) return null;
    const y = date.getUTCFullYear();
    return y > 1800 && y < 9999 ? y : null;
  } catch (_err) {
    return null;
  }
}

function clampRating(value){
  const num = Number(value);
  if(!Number.isFinite(num) || num <= 0) return null;
  return Math.round(num * 10) / 10;
}

function minutesFromDuration(raw){
  if(raw == null) return null;
  const num = Number(raw);
  if(Number.isFinite(num) && num > 0){
    if(num > 1000){
      return Math.max(1, Math.round(num / 60_000));
    }
    return Math.round(num);
  }
  return null;
}

function collectGenres(raw, tmdb){
  const names = [];
  if(tmdb && Array.isArray(tmdb.genres)){
    for(const entry of tmdb.genres){
      if(entry && typeof entry === 'object' && entry.name){
        const str = cleanString(entry.name);
        if(str) names.push(str);
      }
    }
  }
  const rawGenres = raw?.genres;
  if(Array.isArray(rawGenres)){
    rawGenres.forEach(entry => {
      if(!entry) return;
      if(typeof entry === 'string'){
        const str = cleanString(entry);
        if(str) names.push(str);
        return;
      }
      const str = cleanString(entry.tag || entry.title || entry.label || entry.name);
      if(str) names.push(str);
    });
  }
  const seen = new Set();
  const result = [];
  for(const name of names){
    const key = name.toLowerCase();
    if(seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result.slice(0, 2);
}

function extractIds(raw){
  const ids = {};
  const set = (key, value)=>{
    const str = nonEmptyString(value);
    if(str) ids[key] = str;
  };
  if(raw && typeof raw === 'object'){
    if(raw.ratingKey != null) set('ratingKey', raw.ratingKey);
    if(raw.ids && typeof raw.ids === 'object'){
      set('tmdb', raw.ids.tmdb);
      set('imdb', raw.ids.imdb);
    }
    const mergeGuid = (guid)=>{
      const rawGuid = typeof guid === 'string' ? guid : guid?.id;
      const str = nonEmptyString(rawGuid);
      if(!str) return;
      const [schemePart, restPart] = str.split('://');
      if(restPart){
        const scheme = schemePart.toLowerCase();
        const rest = restPart.split('?')[0].replace(/^\//, '');
        const tail = rest.split('/').pop();
        if(scheme === 'imdb' || scheme.includes('imdb')){ set('imdb', tail); return; }
        if(scheme === 'tmdb' || scheme.includes('themoviedb')){ set('tmdb', tail); return; }
        if(scheme === 'tvdb' || scheme.includes('thetvdb')){ set('tvdb', tail); return; }
      } else if(str.startsWith('tt')){
        set('imdb', str);
      }
    };
    mergeGuid(raw.guid);
    if(Array.isArray(raw.guids)) raw.guids.forEach(mergeGuid);
  }
  return ids;
}

function chooseTitle(raw, tmdb, type){
  if(tmdb){
    if(type === 'tv'){
      const candidates = [tmdb.name, tmdb.original_name];
      for(const c of candidates){ const str = nonEmptyString(c); if(str) return str; }
    } else {
      const candidates = [tmdb.title, tmdb.original_title];
      for(const c of candidates){ const str = nonEmptyString(c); if(str) return str; }
    }
  }
  if(raw){
    const candidates = [raw.title, raw.name, raw.originalTitle];
    for(const c of candidates){ const str = nonEmptyString(c); if(str) return str; }
  }
  return '';
}

function chooseTagline(raw, tmdb){
  const candidates = [tmdb?.tagline, raw?.tagline];
  for(const c of candidates){ const str = nonEmptyString(c); if(str) return str; }
  return '';
}

function chooseOverview(raw, tmdb){
  const candidates = [tmdb?.overview, raw?.summary, raw?.plot, raw?.description];
  for(const c of candidates){ const str = nonEmptyString(c); if(str) return str; }
  return '';
}

function chooseYear(raw, tmdb, type){
  if(tmdb){
    const primary = type === 'tv' ? tmdb.first_air_date : tmdb.release_date;
    const y = parseYear(primary) ?? parseDateYear(primary);
    if(y) return y;
    const secondary = type === 'tv' ? tmdb.last_air_date : tmdb.release_date;
    const y2 = parseYear(secondary) ?? parseDateYear(secondary);
    if(y2) return y2;
  }
  const fromRaw = parseYear(raw?.year) ?? parseDateYear(raw?.originallyAvailableAt);
  if(fromRaw) return fromRaw;
  return null;
}

function chooseRuntime(raw, tmdb, type){
  if(tmdb){
    if(type === 'tv' && Array.isArray(tmdb.episode_run_time) && tmdb.episode_run_time.length){
      const first = minutesFromDuration(tmdb.episode_run_time.find(v => minutesFromDuration(v)));
      if(first) return first;
    }
    if(type === 'movie'){
      const minutes = minutesFromDuration(tmdb.runtime);
      if(minutes) return minutes;
    }
  }
  if(type === 'movie'){
    const fromRaw = minutesFromDuration(raw?.durationMin ?? raw?.duration);
    if(fromRaw) return fromRaw;
  } else if(type === 'tv'){
    if(Array.isArray(raw?.seasons)){
      for(const season of raw.seasons){
        if(!Array.isArray(season?.episodes)) continue;
        for(const ep of season.episodes){
          const minutes = minutesFromDuration(ep?.durationMin ?? ep?.duration);
          if(minutes) return minutes;
        }
      }
    }
    const fallback = minutesFromDuration(raw?.durationMin ?? raw?.duration);
    if(fallback) return fallback;
  }
  return null;
}

function chooseRating(raw, tmdb){
  const fromTmdb = clampRating(tmdb?.vote_average);
  if(fromTmdb) return fromTmdb;
  const fromRaw = clampRating(raw?.rating ?? raw?.audienceRating);
  if(fromRaw) return fromRaw;
  return null;
}

function chooseVoteCount(tmdb){
  const num = Number(tmdb?.vote_count);
  if(Number.isFinite(num) && num > 0) return Math.round(num);
  return null;
}

function chooseCertification(raw, tmdb, type){
  if(type === 'movie' && tmdb?.release_dates?.results){
    const releases = Array.isArray(tmdb.release_dates.results) ? tmdb.release_dates.results : [];
    const us = releases.find(entry => entry && entry.iso_3166_1 === 'US');
    const dates = Array.isArray(us?.release_dates) ? us.release_dates : [];
    const sorted = dates.filter(entry => nonEmptyString(entry?.certification)).sort((a, b)=>{
      const at = Number(a?.type ?? 0);
      const bt = Number(b?.type ?? 0);
      return at - bt;
    });
    if(sorted.length){
      const cert = nonEmptyString(sorted.find(entry => entry.type === 3)?.certification || sorted[0].certification);
      if(cert) return cert;
    }
  }
  if(type === 'tv' && Array.isArray(tmdb?.content_ratings?.results)){
    const us = tmdb.content_ratings.results.find(entry => entry && entry.iso_3166_1 === 'US');
    const rating = nonEmptyString(us?.rating);
    if(rating) return rating;
  }
  const rawRating = nonEmptyString(raw?.contentRating);
  if(rawRating){
    const match = rawRating.split('/').pop();
    const cleaned = nonEmptyString(match);
    if(cleaned) return cleaned;
  }
  return '';
}

function extractBackdrops(tmdb){
  const list = Array.isArray(tmdb?.images?.backdrops) ? tmdb.images.backdrops : [];
  const urls = [];
  for(const backdrop of list){
    if(!backdrop || !backdrop.file_path) continue;
    if(backdrop.width && backdrop.width < BACKDROP_MIN_WIDTH) continue;
    const url = tmdbImageUrl(backdrop.file_path, TMDB_BACKDROP_SIZE);
    if(!url) continue;
    if(!urls.includes(url)) urls.push(url);
  }
  return urls;
}

function computeTvCounts(raw, tmdb){
  const result = { seasons: null, episodes: null };
  if(Number.isFinite(tmdb?.number_of_seasons)) result.seasons = Math.max(0, Math.round(tmdb.number_of_seasons));
  if(Number.isFinite(tmdb?.number_of_episodes)) result.episodes = Math.max(0, Math.round(tmdb.number_of_episodes));
  if(result.seasons == null && Array.isArray(raw?.seasons)) result.seasons = raw.seasons.length;
  if(result.episodes == null && Array.isArray(raw?.seasons)){
    let count = 0;
    raw.seasons.forEach(season => { if(Array.isArray(season?.episodes)) count += season.episodes.length; });
    if(count > 0) result.episodes = count;
  }
  return result;
}

function buildCta(type, ids){
  if(!ids || typeof ids !== 'object') return null;
  const preferred = ids.tmdb || ids.imdb || ids.ratingKey;
  const targetId = nonEmptyString(preferred);
  if(!targetId) return null;
  const kind = type === 'tv' ? 'show' : 'movie';
  const label = kind === 'show' ? 'Show details' : 'Movie details';
  return {
    id: targetId,
    kind,
    label,
    target: `#/${kind}/${targetId}`
  };
}

function finalizeIds(ids){
  const out = {};
  Object.entries(ids || {}).forEach(([key, value]) => {
    const str = nonEmptyString(value);
    if(str) out[key] = str;
  });
  return out;
}

function ensureId(ids, type){
  if(ids.ratingKey) return ids.ratingKey;
  if(ids.tmdb) return `${type}-${ids.tmdb}`;
  if(ids.imdb) return `${type}-${ids.imdb}`;
  return '';
}

export async function normalizeItem(raw, options = {}){
  if(!raw || typeof raw !== 'object') return null;
  const type = raw.type === 'tv' ? 'tv' : 'movie';
  const language = nonEmptyString(options.language) || 'en-US';
  let ids = extractIds(raw);

  let tmdbBundle = null;
  if(options.disableTmdb !== true){
    try {
      tmdbBundle = await fetchDetailsForItem(raw, {
        language,
        settings: options.settings,
        auth: options.auth,
        authOptions: options.authOptions,
        signal: options.signal,
        searchTitle: options.searchTitle,
        searchYear: options.searchYear
      });
    } catch (err) {
      logWarn('TMDB lookup failed:', err?.message || err);
    }
  }
  const tmdbData = tmdbBundle?.data;
  if(tmdbBundle?.resolvedId){
    if(!ids.tmdb) ids.tmdb = String(tmdbBundle.resolvedId);
  }
  if(tmdbData?.id && !ids.tmdb){
    ids.tmdb = String(tmdbData.id);
  }
  if(tmdbData?.imdb_id && !ids.imdb){
    ids.imdb = String(tmdbData.imdb_id).trim();
  }
  ids = finalizeIds(ids);

  const title = chooseTitle(raw, tmdbData, type);
  if(!title){
    logWarn('Skipping item without title', raw?.ratingKey || raw?.title || raw?.guid || 'unknown');
    return null;
  }

  const normalized = {
    id: ensureId(ids, type) || String(raw.ratingKey ?? raw.guid ?? title),
    type,
    title
  };

  const tagline = chooseTagline(raw, tmdbData);
  if(tagline) normalized.tagline = tagline;

  const overview = chooseOverview(raw, tmdbData);
  if(overview) normalized.overview = overview;

  const year = chooseYear(raw, tmdbData, type);
  if(year) normalized.year = year;

  const runtime = chooseRuntime(raw, tmdbData, type);
  if(runtime) normalized.runtime = runtime;

  const rating = chooseRating(raw, tmdbData);
  if(rating != null) normalized.rating = rating;

  const voteCount = chooseVoteCount(tmdbData);
  if(voteCount != null) normalized.voteCount = voteCount;

  const genres = collectGenres(raw, tmdbData);
  if(genres.length) normalized.genres = genres;

  const certification = chooseCertification(raw, tmdbData, type);
  if(certification) normalized.certification = certification;

  const backdrops = extractBackdrops(tmdbData);
  if(backdrops.length) normalized.backdrops = backdrops;

  if(type === 'tv'){
    const counts = computeTvCounts(raw, tmdbData);
    if(counts.seasons != null) normalized.seasons = counts.seasons;
    if(counts.episodes != null) normalized.episodes = counts.episodes;
  }

  const cta = buildCta(type, ids);
  if(cta) normalized.cta = cta;

  if(Object.keys(ids).length) normalized.ids = ids;
  normalized.language = language;

  if(tmdbBundle){
    const tmdbMeta = {
      id: ids.tmdb || (tmdbBundle.id ? String(tmdbBundle.id) : ''),
      fetchedAt: tmdbBundle.fetchedAt || Date.now(),
      source: tmdbBundle.source
    };
    if(!tmdbMeta.id) delete tmdbMeta.id;
    if(!tmdbMeta.source) delete tmdbMeta.source;
    if(options.includeTmdbRaw && tmdbData) tmdbMeta.raw = tmdbData;
    if(Object.keys(tmdbMeta).length) normalized.tmdb = tmdbMeta;
  }

  if(options.includeSource) normalized.source = raw;

  return normalized;
}

export async function normalizeItems(items, options = {}){
  if(!Array.isArray(items)) return [];
  const out = [];
  for(const item of items){
    const normalized = await normalizeItem(item, options);
    if(normalized) out.push(normalized);
  }
  return out;
}

export default {
  normalizeItem,
  normalizeItems
};
