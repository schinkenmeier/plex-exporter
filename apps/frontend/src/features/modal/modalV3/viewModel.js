import metadataService from '../../../core/metadataService.js';
import { runtimeText, ratingText, studioText } from './formatting.js';
import { mapMovie, mapShow, mergeShowDetail, normalizeGenresList } from './mapping.js';
import { buildFallbackPoster, buildFallbackBackdrop, buildFallbackProfile, makeInitials } from '../../../js/imageHelper.js';

const LOG_PREFIX = '[modalV3/viewModel]';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';
const IMAGE_SIZES = {
  poster: 'w500',
  backdrop: 'w780',
  profile: 'w185',
};
const DEFAULT_TABS = {
  overview: 'Überblick',
  details: 'Details',
  cast: 'Besetzung',
  seasons: 'Staffeln',
};

/**
 * @typedef {Object} ImageEntry
 * @property {string} url
 * @property {'tmdb'|'local'|'fallback'} source
 * @property {string} [alt]
 */

/**
 * @typedef {Object} BadgeEntry
 * @property {string} id
 * @property {string} label
 * @property {string} text
 * @property {'tmdb'|'local'|'derived'} source
 */

/**
 * @typedef {Object} CastEntry
 * @property {string} id
 * @property {string} name
 * @property {string} subtitle
 * @property {string} role
 * @property {string} character
 * @property {{ url: string, source: 'tmdb'|'local'|'fallback' }} image
 * @property {string} initials
 * @property {'tmdb'|'local'} source
 * @property {number} order
 */

/**
 * @typedef {Object} SeasonSummary
 * @property {string} id
 * @property {number|null} seasonNumber
 * @property {string} title
 * @property {string} overview
 * @property {string} airDate
 * @property {string} year
 * @property {number|null} episodeCount
 * @property {{ url: string, source: 'tmdb'|'local'|'fallback' }} poster
 * @property {'tmdb'|'local'} source
 */

/**
 * @typedef {Object} MediaDetailViewModel
 * @property {'movie'|'show'} kind
 * @property {object} item
 * @property {object|null} tmdb
 * @property {string} title
 * @property {string} originalTitle
 * @property {string} overview
 * @property {string} summary
 * @property {string} tagline
 * @property {string} releaseDate
 * @property {string} year
 * @property {string[]} genres
 * @property {BadgeEntry[]} badges
 * @property {{ id: string, label: string, count?: number }[]} tabs
 * @property {string} defaultTab
 * @property {ImageEntry} poster
 * @property {ImageEntry} backdrop
 * @property {CastEntry[]} cast
 * @property {SeasonSummary[]} seasons
 * @property {{ runtime?: string, rating?: string, tmdbRating?: string, studio?: string, contentRating?: string, seasonCount?: number|null }} meta
 * @property {object|null} watchProviders
 * @property {string} tmdbUrl
 */

/** @type {MediaDetailViewModel} */
const __MediaDetailViewModelType = /** @type {MediaDetailViewModel} */ ({});
/** @type {SeasonSummary} */
const __SeasonSummaryType = /** @type {SeasonSummary} */ ({});
/** @type {CastEntry} */
const __CastEntryType = /** @type {CastEntry} */ ({});

function isObject(value){
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value){
  return Array.isArray(value) ? value : [];
}

function trimString(value){
  if(typeof value !== 'string') return '';
  return value.trim();
}

function extractImageCandidate(candidate){
  if(!candidate) return '';
  if(typeof candidate === 'string') return candidate;
  if(Array.isArray(candidate)){
    for(const entry of candidate){
      const found = extractImageCandidate(entry);
      if(found) return found;
    }
    return '';
  }
  if(isObject(candidate)){
    return (
      candidate.url ||
      candidate.path ||
      candidate.file_path ||
      candidate.filePath ||
      candidate.location ||
      candidate.poster ||
      candidate.backdrop ||
      candidate.profile ||
      candidate.thumbFile ||
      candidate.thumb ||
      candidate.image ||
      ''
    );
  }
  return '';
}

function normaliseImageUrl(candidate, size){
  const raw = trimString(extractImageCandidate(candidate));
  if(!raw) return '';
  if(/^https?:\/\//i.test(raw) || raw.startsWith('data:')) return raw;
  if(raw.startsWith('//')) return `https:${raw}`;
  if(raw.startsWith('data/') || raw.startsWith('./') || raw.startsWith('../')) return raw;
  if(raw.startsWith('assets/')) return raw;
  if(raw.includes('://')) return raw;
  if(raw.startsWith('/')){
    const fullUrl = `${TMDB_IMAGE_BASE}/${size}${raw}`;
    console.log(`${LOG_PREFIX} normaliseImageUrl: "${raw}" -> "${fullUrl}"`);
    return fullUrl;
  }
  if(raw.startsWith('t/p/')){
    return `${TMDB_IMAGE_BASE}/${size}/${raw.slice(4)}`;
  }
  if(/^w\d+\//.test(raw)){
    const parts = raw.split('/');
    const suffix = parts.slice(1).join('/');
    return suffix ? `${TMDB_IMAGE_BASE}/${size}/${suffix}` : `${TMDB_IMAGE_BASE}/${size}`;
  }
  console.log(`${LOG_PREFIX} normaliseImageUrl: unhandled format "${raw}"`);
  return raw;
}

function selectImage(candidates, fallbackBuilder, size, title){
  for(const candidate of candidates){
    if(candidate == null) continue;
    const value = candidate.value !== undefined ? candidate.value : candidate;
    const url = normaliseImageUrl(value, size);
    if(url){
      const source = candidate.source || 'local';
      return { url, source };
    }
  }
  return { url: fallbackBuilder(title), source: 'fallback' };
}

function firstString(...values){
  for(const value of values){
    if(!value) continue;
    if(typeof value === 'string'){
      const trimmed = value.trim();
      if(trimmed) return trimmed;
    }
    if(isObject(value)){
      const str = trimString(value.tag || value.name || value.title || value.label || value.value);
      if(str) return str;
    }
  }
  return '';
}

function parseYear(value){
  const str = trimString(value);
  if(!str) return '';
  const match = str.match(/(\d{4})/);
  if(match) return match[1];
  const date = new Date(str);
  const year = date.getFullYear();
  return Number.isFinite(year) ? String(year) : '';
}

function pickTitle(item, tmdb){
  return firstString(
    item?.title,
    item?.name,
    item?.grandparentTitle,
    tmdb?.title,
    tmdb?.name,
    tmdb?.originalTitle,
    tmdb?.originalName,
    item?.tag,
    'Unbekannter Titel'
  );
}

function pickOriginalTitle(item, tmdb){
  return firstString(
    item?.originalTitle,
    item?.originalName,
    tmdb?.originalTitle,
    tmdb?.originalName,
    ''
  );
}

function pickTagline(item, tmdb){
  return firstString(
    tmdb?.tagline,
    item?.tagline,
    ''
  );
}

function pickOverview(item, tmdb){
  return firstString(
    tmdb?.overview,
    item?.summary,
    item?.overview,
    item?.plot,
    ''
  );
}

function pickSummary(item, tmdb){
  return firstString(
    item?.summary,
    item?.shortSummary,
    item?.plot,
    tmdb?.overview,
    ''
  );
}

function pickReleaseDate(item, tmdb, kind){
  if(kind === 'show'){
    return firstString(
      item?.originallyAvailableAt,
      item?.firstAired,
      item?.premiereDate,
      tmdb?.firstAirDate,
      tmdb?.lastAirDate,
      ''
    );
  }
  return firstString(
    item?.originallyAvailableAt,
    item?.releaseDate,
    item?.availableSince,
    tmdb?.releaseDate,
    ''
  );
}

function pickYear(item, tmdb, kind){
  const candidates = [
    item?.year,
    item?.releaseYear,
    tmdb?.year,
    kind === 'show' ? tmdb?.firstAirDate : tmdb?.releaseDate,
    pickReleaseDate(item, tmdb, kind),
  ];
  for(const candidate of candidates){
    const year = parseYear(candidate);
    if(year) return year;
  }
  return '';
}

function buildPosterEntry(item, tmdb){
  const title = pickTitle(item, tmdb);
  const candidates = [
    { value: tmdb?.poster, source: 'tmdb' },
    { value: tmdb?.posterPath, source: 'tmdb' },
    { value: tmdb?.poster_path, source: 'tmdb' },
    { value: tmdb?.collection?.poster, source: 'tmdb' },
    { value: item?.tmdbPoster, source: 'tmdb' },
    { value: item?.poster, source: 'local' },
    { value: item?.thumbFile, source: 'local' },
    { value: item?.thumb, source: 'local' },
    { value: item?.art, source: 'local' },
  ];
  const image = selectImage(candidates, buildFallbackPoster, IMAGE_SIZES.poster, title);
  return { ...image, alt: title };
}

function buildBackdropEntry(item, tmdb){
  const title = pickTitle(item, tmdb);
  console.log(`${LOG_PREFIX} buildBackdropEntry for "${title}":`, {
    tmdbBackdrop: tmdb?.backdrop,
    tmdbBackdropPath: tmdb?.backdropPath,
    tmdbBackdrop_path: tmdb?.backdrop_path,
    collectionBackdrop: tmdb?.collection?.backdrop,
    itemArt: item?.art,
    itemBackground: item?.background
  });
  const candidates = [
    { value: tmdb?.backdrop, source: 'tmdb' },
    { value: tmdb?.backdropPath, source: 'tmdb' },
    { value: tmdb?.backdrop_path, source: 'tmdb' },
    { value: tmdb?.collection?.backdrop, source: 'tmdb' },
    { value: item?.art, source: 'local' },
    { value: item?.background, source: 'local' },
    { value: item?.thumb, source: 'local' },
  ];
  const image = selectImage(candidates, buildFallbackBackdrop, IMAGE_SIZES.backdrop, title);
  console.log(`${LOG_PREFIX} Selected backdrop:`, image);
  return { ...image, alt: title };
}

function buildProfileImage(name, candidates){
  const resolved = selectImage(candidates, buildFallbackProfile, IMAGE_SIZES.profile, name || '');
  return { url: resolved.url, source: resolved.source };
}

function createBadge(id, label, text, source = 'derived'){
  const cleaned = trimString(text);
  if(!cleaned) return null;
  return { id, label, text: cleaned, source };
}

function resolveContentRating(item, tmdb){
  return firstString(
    tmdb?.contentRating,
    item?.contentRating,
    item?.contentRating?.tag,
    item?.ratingTag,
    item?.ratingName,
    item?.ratingLabel,
    item?.parentRating,
    ''
  );
}

function resolveSeasonCount(item, tmdb){
  const candidates = [
    item?.seasonCount,
    item?.childCount,
    asArray(item?.seasons).length,
    tmdb?.numberOfSeasons,
    asArray(tmdb?.seasons).length,
  ];
  for(const candidate of candidates){
    const num = Number(candidate);
    if(Number.isFinite(num) && num > 0){
      return Math.round(num);
    }
  }
  return null;
}

function buildRuntimeBadge(item, tmdb, kind){
  const runtime = runtimeText({ ...item, tmdbDetail: tmdb || item?.tmdbDetail || null, type: kind === 'show' ? 'tv' : 'movie' });
  return createBadge('runtime', 'Laufzeit', runtime, 'derived');
}

function buildSeasonBadge(item, tmdb){
  const count = resolveSeasonCount(item, tmdb);
  if(!count) return null;
  const label = count === 1 ? 'Staffel' : 'Staffeln';
  return createBadge('seasonCount', 'Staffeln', `${count} ${label}`, tmdb?.numberOfSeasons ? 'tmdb' : 'derived');
}

function buildRatingBadge(item, tmdb){
  const text = ratingText({ ...item, tmdbDetail: tmdb || item?.tmdbDetail || null });
  const source = item?.rating || item?.audienceRating ? 'local' : 'derived';
  return createBadge('rating', 'Bewertung', text, source);
}

function formatTmdbRating(tmdb){
  const rating = Number(tmdb?.voteAverage);
  if(!Number.isFinite(rating) || rating <= 0) return '';
  return `${rating.toFixed(1)} / 10`;
}

function buildContentRatingBadge(item, tmdb){
  const rating = resolveContentRating(item, tmdb);
  const source = tmdb?.contentRating ? 'tmdb' : item?.contentRating ? 'local' : 'derived';
  return createBadge('contentRating', 'FSK', rating, source);
}

function buildStudioBadge(item, tmdb, kind){
  const studio = studioText({ ...item, tmdbDetail: tmdb || item?.tmdbDetail || null, type: kind === 'show' ? 'tv' : 'movie' });
  if(!trimString(studio)) return null;
  const source = item?.studio || item?.network ? 'local' : tmdb?.productionCompanies || tmdb?.networks ? 'tmdb' : 'derived';
  return createBadge('studio', kind === 'show' ? 'Netzwerk' : 'Studio', studio, source);
}

function buildBadges(kind, item, tmdb){
  const badges = [];
  const runtimeBadge = buildRuntimeBadge(item, tmdb, kind);
  if(runtimeBadge) badges.push(runtimeBadge);
  if(kind === 'show'){
    const seasonBadge = buildSeasonBadge(item, tmdb);
    if(seasonBadge) badges.push(seasonBadge);
  }
  const ratingBadge = buildRatingBadge(item, tmdb);
  if(ratingBadge) badges.push(ratingBadge);
  const contentBadge = buildContentRatingBadge(item, tmdb);
  if(contentBadge) badges.push(contentBadge);
  const studioBadge = buildStudioBadge(item, tmdb, kind);
  if(studioBadge) badges.push(studioBadge);
  const tmdbBadgeText = formatTmdbRating(tmdb);
  const tmdbBadge = createBadge('tmdbRating', 'TMDB', tmdbBadgeText, 'tmdb');
  if(tmdbBadge) badges.push(tmdbBadge);
  return badges;
}

function buildTabs(kind, { hasCast, seasons }){
  const tabs = [];
  tabs.push({ id: 'overview', label: DEFAULT_TABS.overview });
  tabs.push({ id: 'details', label: DEFAULT_TABS.details });
  if(kind === 'show'){
    const count = seasons.length;
    const label = count ? `${DEFAULT_TABS.seasons} (${count})` : DEFAULT_TABS.seasons;
    tabs.push({ id: 'seasons', label, count });
  }
  if(hasCast){
    tabs.push({ id: 'cast', label: DEFAULT_TABS.cast, count: hasCast });
  }
  return { tabs, defaultTab: tabs[0]?.id || 'overview' };
}

function normalizeCastName(person){
  return firstString(person?.name, person?.tag, person?.title, person?.role);
}

function normalizeCastRole(person){
  return firstString(person?.role, person?.character, person?.job, person?.subtitle);
}

function buildCastEntries(item, tmdb){
  const entries = [];
  const seen = new Set();
  const localCast = asArray(item?.cast).length ? asArray(item?.cast) : asArray(item?.roles);
  const tmdbCredits = asArray(tmdb?.credits?.cast || item?.tmdbDetail?.credits?.cast);
  console.log(`${LOG_PREFIX} buildCastEntries:`, {
    localCastCount: localCast.length,
    tmdbCreditsCount: tmdbCredits.length,
    sampleTmdbCredit: tmdbCredits[0],
    hasTmdbCredits: Boolean(tmdb?.credits?.cast),
    hasItemTmdbCredits: Boolean(item?.tmdbDetail?.credits?.cast)
  });

  const pushEntry = (entry)=>{
    if(!entry || !entry.name) return;
    const key = `${entry.name.toLowerCase()}::${entry.character || entry.role || ''}`;
    if(seen.has(key)) return;
    seen.add(key);
    entries.push(entry);
  };

  localCast.forEach((person, index) => {
    if(!person) return;
    const name = normalizeCastName(person);
    const subtitle = normalizeCastRole(person);
    if(!name) return;
    const image = buildProfileImage(name, [
      { value: person?.tmdbProfile, source: 'tmdb' },
      { value: person?.profile, source: 'tmdb' },
      { value: person?.profile_path, source: 'tmdb' },
      { value: person?.profilePath, source: 'tmdb' },
      { value: person?.thumb, source: 'local' },
      { value: person?.photo, source: 'local' },
      { value: person?.image, source: 'local' },
    ]);
    const id = trimString(firstString(person?.id, person?.guid, person?.personId, name));
    pushEntry({
      id: id || name,
      name,
      subtitle: subtitle || '',
      role: subtitle || '',
      character: subtitle || '',
      image,
      initials: makeInitials(name || subtitle || ''),
      source: 'local',
      order: Number.isFinite(Number(person?.order)) ? Number(person.order) : index,
    });
  });

  tmdbCredits.forEach((person, index) => {
    if(!person) return;
    const name = firstString(person?.name, person?.original_name);
    if(!name) return;
    const character = firstString(person?.character, person?.role);
    if(index === 0){
      console.log(`${LOG_PREFIX} First TMDB cast member:`, {
        name,
        profile: person?.profile,
        profile_path: person?.profile_path,
        profilePath: person?.profilePath
      });
    }
    const image = buildProfileImage(name, [
      { value: person?.profile, source: 'tmdb' },
      { value: person?.profile_path, source: 'tmdb' },
      { value: person?.profilePath, source: 'tmdb' },
    ]);
    if(index === 0){
      console.log(`${LOG_PREFIX} First cast image result:`, image);
    }
    const id = trimString(person?.id != null ? String(person.id) : name);
    pushEntry({
      id: id || name,
      name,
      subtitle: character || trimString(person?.known_for_department),
      role: character || '',
      character: character || '',
      image,
      initials: makeInitials(name || character || ''),
      source: 'tmdb',
      order: Number.isFinite(Number(person?.order)) ? Number(person.order) : 1000 + index,
    });
  });

  return entries
    .sort((a, b) => a.order - b.order)
    .slice(0, 20)
    .map(entry => ({
      ...entry,
      image: entry.image?.url ? entry.image : { url: buildFallbackProfile(entry.name), source: 'fallback' },
      initials: entry.initials || makeInitials(entry.name),
    }));
}

function normalizeSeasonTitle(season, fallbackNumber){
  return firstString(
    season?.title,
    season?.name,
    season?.label,
    typeof fallbackNumber === 'number' ? `Staffel ${fallbackNumber}` : ''
  );
}

function resolveSeasonKey(season){
  const number = Number(season?.seasonNumber ?? season?.index ?? season?.season ?? season?.season_index ?? season?.season_number);
  if(Number.isFinite(number)) return `season-${number}`;
  const id = trimString(firstString(season?.id, season?.guid));
  if(id) return `id-${id}`;
  const title = trimString(firstString(season?.title, season?.name));
  if(title) return `title-${title.toLowerCase()}`;
  return `season-${Math.random().toString(36).slice(2)}`;
}

function resolveEpisodeCount(season){
  const fromField = Number(season?.episodeCount ?? season?.childCount ?? season?.episode_count);
  if(Number.isFinite(fromField) && fromField >= 0) return fromField;
  const episodes = asArray(season?.episodes);
  if(episodes.length) return episodes.length;
  return null;
}

function resolveSeasonPoster(title, season, source){
  const candidates = [
    { value: season?.poster, source },
    { value: season?.posterPath, source },
    { value: season?.poster_path, source },
    { value: season?.thumbFile, source: 'local' },
    { value: season?.thumb, source: 'local' },
    { value: season?.art, source: 'local' },
  ];
  return selectImage(candidates, buildFallbackPoster, IMAGE_SIZES.poster, title);
}

function mergeSeasonEntry(base, update){
  if(!update) return base;
  const merged = { ...base };
  if(!trimString(merged.title)) merged.title = update.title;
  if(!trimString(merged.overview)) merged.overview = update.overview;
  if(!trimString(merged.airDate)) merged.airDate = update.airDate;
  if(!trimString(merged.year)) merged.year = update.year;
  if(merged.episodeCount == null && update.episodeCount != null) merged.episodeCount = update.episodeCount;
  if(merged.poster?.source === 'fallback' && update.poster?.url){
    merged.poster = update.poster;
  }
  return merged;
}

function buildSeasonSummaries(show, tmdb){
  const results = [];
  const lookup = new Map();
  const pushSeason = (season, source)=>{
    if(!season) return;
    const key = resolveSeasonKey(season);
    const numberRaw = season?.seasonNumber ?? season?.index ?? season?.season ?? season?.season_index ?? season?.season_number;
    const seasonNumber = Number.isFinite(Number(numberRaw)) ? Number(numberRaw) : null;
    const title = normalizeSeasonTitle(season, seasonNumber ?? (results.length + 1)) || (seasonNumber != null ? `Staffel ${seasonNumber}` : 'Staffel');
    const airDate = firstString(season?.airDate, season?.premiereDate, season?.originallyAvailableAt, season?.air_date);
    const year = parseYear(season?.year) || parseYear(airDate);
    const overview = firstString(season?.overview, season?.summary, season?.description);
    const poster = resolveSeasonPoster(title, season, source);
    const entry = {
      id: trimString(firstString(season?.id, season?.guid, `${key}`)) || key,
      seasonNumber,
      title,
      overview,
      airDate: airDate || '',
      year: year || '',
      episodeCount: resolveEpisodeCount(season),
      poster,
      source,
    };
    if(lookup.has(key)){
      const existingIndex = lookup.get(key);
      const existing = results[existingIndex];
      results[existingIndex] = mergeSeasonEntry(existing, entry);
    }else{
      lookup.set(key, results.length);
      results.push(entry);
    }
  };

  asArray(show?.seasons).forEach(season => pushSeason(season, 'local'));
  asArray(tmdb?.seasons).forEach(season => pushSeason(season, 'tmdb'));

  return results
    .map(entry => ({
      ...entry,
      poster: entry.poster?.url ? entry.poster : { url: buildFallbackPoster(entry.title), source: 'fallback' },
    }))
    .sort((a, b) => {
      if(a.seasonNumber != null && b.seasonNumber != null) return a.seasonNumber - b.seasonNumber;
      if(a.seasonNumber != null) return -1;
      if(b.seasonNumber != null) return 1;
      return a.title.localeCompare(b.title);
    });
}

function buildGenreList(item, tmdb){
  const result = [];
  const seen = new Set();
  const add = (value)=>{
    const str = trimString(value);
    if(!str) return;
    const key = str.toLowerCase();
    if(seen.has(key)) return;
    seen.add(key);
    result.push(str);
  };
  normalizeGenresList(item?.genres).forEach(entry => add(entry?.tag || entry?.name || entry?.title));
  asArray(item?.genre).forEach(add);
  asArray(tmdb?.genres).forEach(entry => add(typeof entry === 'string' ? entry : entry?.name || entry?.title));
  return result;
}

function buildMeta(kind, item, tmdb){
  const runtime = runtimeText({ ...item, tmdbDetail: tmdb || item?.tmdbDetail || null, type: kind === 'show' ? 'tv' : 'movie' }) || '';
  const rating = ratingText({ ...item, tmdbDetail: tmdb || item?.tmdbDetail || null }) || '';
  const tmdbRating = formatTmdbRating(tmdb) || '';
  const studio = studioText({ ...item, tmdbDetail: tmdb || item?.tmdbDetail || null, type: kind === 'show' ? 'tv' : 'movie' }) || '';
  const contentRating = resolveContentRating(item, tmdb) || '';
  const seasonCount = kind === 'show' ? resolveSeasonCount(item, tmdb) : null;
  return {
    runtime,
    rating,
    tmdbRating,
    studio,
    contentRating,
    seasonCount,
  };
}

function ensureTmdbLogos(detail){
  if(!detail || typeof detail !== 'object') return;
  const images = detail.images;
  const hasImagesObject = images && typeof images === 'object' && !Array.isArray(images);
  if(hasImagesObject){
    const normalized = Array.isArray(images.logos) ? images.logos.filter(Boolean) : [];
    if(normalized.length){
      images.logos = normalized;
      return;
    }
  }
  const legacy = Array.isArray(detail.logos) ? detail.logos.filter(Boolean) : [];
  if(!legacy.length) return;
  if(hasImagesObject){
    images.logos = legacy;
  }else{
    detail.images = { logos: legacy };
  }
}

function resolveMovieInput(payload){
  if(!payload || typeof payload !== 'object') return payload;
  return payload.item || payload.movie || payload.media || payload;
}

function resolveShowInput(payload){
  if(!payload || typeof payload !== 'object') return payload;
  return payload.item || payload.show || payload.media || payload;
}

async function fetchTmdbMovie(item, options = {}){
  const explicit = options.tmdb || options.tmdbDetail;
  if(explicit) return explicit;
  if(item?.tmdbDetail) return item.tmdbDetail;
  const tmdbId = firstString(
    options.tmdbId,
    item?.ids?.tmdb,
    item?.tmdbId,
    item?.tmdb?.id
  );
  if(!tmdbId) return null;
  if(!metadataService || typeof metadataService.getMovieEnriched !== 'function') return null;
  try{
    const detail = await metadataService.getMovieEnriched(tmdbId, {
      posterSize: IMAGE_SIZES.poster,
      backdropSize: IMAGE_SIZES.backdrop,
      profileSize: IMAGE_SIZES.profile,
    });
    return detail || null;
  }catch(err){
    console.warn(`${LOG_PREFIX} Failed to load TMDB movie detail for`, tmdbId, err?.message || err);
    return null;
  }
}

async function fetchTmdbShow(item, options = {}){
  const explicit = options.tmdb || options.tmdbDetail;
  if(explicit) return explicit;
  if(item?.tmdbDetail) return item.tmdbDetail;
  const tmdbId = firstString(
    options.tmdbId,
    item?.ids?.tmdb,
    item?.tmdbId,
    item?.tmdb?.id
  );
  if(!tmdbId) return null;
  if(!metadataService || typeof metadataService.getTvEnriched !== 'function') return null;
  try{
    const detail = await metadataService.getTvEnriched(tmdbId, {
      posterSize: IMAGE_SIZES.poster,
      backdropSize: IMAGE_SIZES.backdrop,
      profileSize: IMAGE_SIZES.profile,
    });
    return detail || null;
  }catch(err){
    console.warn(`${LOG_PREFIX} Failed to load TMDB show detail for`, tmdbId, err?.message || err);
    return null;
  }
}

function normalizeMovieItem(item){
  if(!item) return null;
  const mapped = mapMovie(item);
  if(!mapped) return null;
  mapped.genres = normalizeGenresList(mapped.genres);
  return mapped;
}

function normalizeShowItem(item, detail){
  if(!item) return null;
  const mapped = mapShow(item);
  if(detail) mergeShowDetail(mapped, detail);
  return mapped;
}

function assignTmdbDetail(target, tmdb){
  if(!target || !tmdb) return;
  target.tmdbDetail = tmdb;
}

function buildBaseViewModel(kind, item, tmdb){
  const poster = buildPosterEntry(item, tmdb);
  const backdrop = buildBackdropEntry(item, tmdb);
  const cast = buildCastEntries(item, tmdb);
  const seasons = kind === 'show' ? buildSeasonSummaries(item, tmdb) : [];
  const { tabs, defaultTab } = buildTabs(kind, { hasCast: cast.length, seasons });
  const badges = buildBadges(kind, item, tmdb);
  const meta = buildMeta(kind, item, tmdb);
  const releaseDate = pickReleaseDate(item, tmdb, kind) || '';
  const year = pickYear(item, tmdb, kind) || '';
  const title = pickTitle(item, tmdb);
  const originalTitle = pickOriginalTitle(item, tmdb);
  const tagline = pickTagline(item, tmdb);
  const overview = pickOverview(item, tmdb);
  const summary = pickSummary(item, tmdb);
  const genres = buildGenreList(item, tmdb);

  return {
    kind,
    item,
    tmdb,
    title,
    originalTitle,
    overview,
    summary,
    tagline,
    releaseDate,
    year,
    genres,
    badges,
    tabs,
    defaultTab,
    poster,
    backdrop,
    cast,
    seasons,
    meta,
    watchProviders: tmdb?.watchProviders?.default || tmdb?.watchProviders || null,
    tmdbUrl: tmdb?.url || '',
  };
}

/**
 * @param {object} payload
 * @param {object} [options]
 * @returns {Promise<MediaDetailViewModel|null>}
 */
export async function buildMovieViewModel(payload, options = {}){
  const rawItem = resolveMovieInput(payload);
  const item = normalizeMovieItem(rawItem);
  if(!item) return null;
  if(item.tmdbDetail) ensureTmdbLogos(item.tmdbDetail);
  const tmdb = await fetchTmdbMovie(item, { ...options, tmdb: options.tmdb || payload?.tmdb || payload?.tmdbDetail });
  if(tmdb){
    ensureTmdbLogos(tmdb);
    assignTmdbDetail(item, tmdb);
  }
  return buildBaseViewModel('movie', item, tmdb);
}

/**
 * @param {object} payload
 * @param {object} [options]
 * @returns {Promise<MediaDetailViewModel|null>}
 */
export async function buildSeriesViewModel(payload, options = {}){
  const rawItem = resolveShowInput(payload);
  const detail = options.detail || payload?.detail || payload?.showDetail || null;
  const item = normalizeShowItem(rawItem, detail);
  if(!item) return null;
  const tmdb = await fetchTmdbShow(item, { ...options, tmdb: options.tmdb || payload?.tmdb || payload?.tmdbDetail });
  if(tmdb) assignTmdbDetail(item, tmdb);
  if(detail) mergeShowDetail(item, detail);
  return buildBaseViewModel('show', item, tmdb);
}

export {
  __MediaDetailViewModelType as MediaDetailViewModel,
  __SeasonSummaryType as SeasonSummary,
  __CastEntryType as CastEntry,
};

