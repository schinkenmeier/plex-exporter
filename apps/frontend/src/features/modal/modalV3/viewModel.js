import { runtimeText, ratingText, studioText } from './formatting.js';
import { mapMovie, mapShow, mergeShowDetail, normalizeGenresList, mapTmdbShow, mergeShowSources, mapTmdbMovie, mergeMovieSources } from './mapping.js';
import { buildCastList } from './castData.js';
import {
  buildFallbackPoster,
  buildFallbackBackdrop,
  buildFallbackProfile,
  makeInitials,
} from '../../../js/imageHelper.js';
import { prefixThumbValue, loadTmdbDetail } from '../../../js/data.js';

const DEFAULT_TABS = {
  overview: 'Überblick',
  details: 'Details',
  cast: 'Besetzung',
  seasons: 'Staffeln',
};

function getPreferredLanguage(){
  try{
    if(typeof navigator !== 'undefined' && navigator.language){
      return navigator.language;
    }
  }catch(err){ /* ignore */ }
  return 'de-DE';
}

function firstString(...values){
  for(const value of values){
    if(value == null) continue;
    if(typeof value === 'string'){
      const trimmed = value.trim();
      if(trimmed) return trimmed;
    }else if(typeof value === 'object'){
      const candidate = value.title || value.name || value.label || value.tag;
      if(typeof candidate === 'string' && candidate.trim()){
        return candidate.trim();
      }
    }
  }
  return '';
}

function parseYear(value){
  const str = firstString(value);
  if(!str) return '';
  const match = str.match(/(\d{4})/);
  if(match) return match[1];
  const date = new Date(str);
  const year = date.getFullYear();
  return Number.isFinite(year) ? String(year) : '';
}

function normalizeAbsoluteThumbnailUrl(str, type){
  try{
    const currentOrigin = typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'http://localhost';
    const url = new URL(str, currentOrigin);
    if(!url.pathname.startsWith('/api/thumbnails/')) return null;
    const rest = url.pathname.replace(/^\/api\/thumbnails\/?/, '');
    const normalized = prefixThumbValue(rest, type);
    if(normalized){
      // If we got an absolute URL back, normalize it onto the current origin to avoid stale localhost/ports
      if(/^https?:\/\//i.test(normalized)){
        const absolute = new URL(normalized, currentOrigin);
        if(absolute.pathname.startsWith('/api/thumbnails/')){
          return new URL(absolute.pathname + absolute.search, currentOrigin).toString();
        }
        return normalized;
      }
      return new URL(normalized, currentOrigin).toString();
    }
  }catch(err){
    console.warn('[modal] Failed to normalize absolute thumbnail URL:', err?.message || err);
  }
  return null;
}

function normalizeImageUrl(value, mediaType){
  const str = firstString(value);
  if(!str) return '';

  const type = mediaType === 'show' ? 'series' : 'movies';
  const absoluteNormalized = normalizeAbsoluteThumbnailUrl(str, type);
  if(absoluteNormalized) return absoluteNormalized;

  if(!/^data:/i.test(str)){
    const prefixed = prefixThumbValue(str, type);
    if(prefixed) {
      return prefixed;
    }
  }

  if(/^https?:\/\//i.test(str) || str.startsWith('data:')) return str;
  if(str.startsWith('//')) return `https:${str}`;
  if(str.startsWith('/')) return str;
  return '';
}

function selectImage(kind, candidates, fallbackBuilder, title){
  const type = kind === 'show' ? 'series' : 'movies';
  for(const candidate of candidates){
    if(!candidate) continue;
    if(typeof candidate === 'object' && candidate.url){
      const url = normalizeImageUrl(candidate.url, type);
      if(url){
        return {
          ...candidate,
          url,
          source: candidate.source ?? 'local',
        };
      }
    } else {
      const url = normalizeImageUrl(candidate, type);
      if(url){
        return { url, source: 'local' };
      }
    }
  }
  return { url: fallbackBuilder(title), source: 'fallback' };
}

function pickTitle(item){
  return firstString(
    item.title,
    item.name,
    item.grandparentTitle,
    item.tag,
    'Unbekannter Titel'
  );
}

function pickOriginalTitle(item){
  return firstString(
    item.originalTitle,
    item.originalName,
    ''
  );
}

function pickTagline(item){
  return firstString(item.tagline, '');
}

function pickOverview(item){
  return firstString(
    item.summary,
    item.longSummary,
    item.overview,
    item.plot,
    ''
  );
}

function pickSummary(item){
  return firstString(
    item.summary,
    item.shortSummary,
    item.plot,
    ''
  );
}

function pickReleaseDate(item, kind){
  if(kind === 'show'){
    return firstString(
      item.originallyAvailableAt,
      item.firstAired,
      item.premiereDate,
      item.availableSince
    );
  }
  return firstString(
    item.originallyAvailableAt,
    item.releaseDate,
    item.availableSince
  );
}

function buildPoster(kind, item){
  const title = pickTitle(item);
  return selectImage(
    kind,
    [
      item.poster,
      item.thumbFile,
      item.thumb,
      item.art,
    ],
    buildFallbackPoster,
    title
  );
}

function buildBackdrop(kind, item){
  const title = pickTitle(item);
  return selectImage(
    kind,
    [
      item.backdrop,
      item.background,
      item.art,
      item.thumb,
    ],
    buildFallbackBackdrop,
    title
  );
}

function buildBadges(kind, item){
  const badges = [];
  const runtime = runtimeText(item);
  if(runtime){
    badges.push({ id: 'runtime', label: 'Laufzeit', text: runtime, source: 'derived' });
  }
  if(kind === 'show'){
    const seasonCount = Number(item.seasonCount || (Array.isArray(item.seasons) ? item.seasons.length : 0));
    if(Number.isFinite(seasonCount) && seasonCount > 0){
      const label = seasonCount === 1 ? 'Staffel' : 'Staffeln';
      badges.push({ id: 'seasonCount', label: 'Staffeln', text: `${seasonCount} ${label}`, source: 'derived' });
    }
  }
  const rating = ratingText(item);
  if(rating){
    badges.push({ id: 'rating', label: 'Bewertung', text: rating, source: 'local' });
  }
  const contentRating = firstString(
    item.contentRating,
    item.ratingTag,
    item.parentRating
  );
  if(contentRating){
    badges.push({ id: 'contentRating', label: 'FSK', text: contentRating, source: 'local' });
  }
  const studio = studioText(item);
  if(studio){
    badges.push({ id: 'studio', label: kind === 'show' ? 'Netzwerk' : 'Studio', text: studio, source: 'local' });
  }
  return badges;
}

function buildMeta(kind, item){
  const runtime = runtimeText(item) || '';
  const rating = ratingText(item) || '';
  const studio = studioText(item) || '';
  const contentRating = firstString(
    item.contentRating,
    item.ratingTag,
    item.parentRating
  );
  const seasonCount = kind === 'show'
    ? Number(item.seasonCount || (Array.isArray(item.seasons) ? item.seasons.length : 0)) || null
    : null;
  return {
    runtime,
    rating,
    studio,
    contentRating: contentRating || '',
    seasonCount,
  };
}

function buildCastEntries(item){
  const combined = buildCastList(item);
  return combined.slice(0, 20).map((entry, index) => {
    const imageUrl = normalizeImageUrl(entry.thumb || entry.photo, 'movies');
    const image = imageUrl
      ? { url: imageUrl, source: 'local' }
      : { url: buildFallbackProfile(entry.name), source: 'fallback' };
    const subtitle = firstString(entry.role, entry.character);
    const id = entry.raw?.id || entry.raw?.ratingKey || `${entry.name}-${index}`;
    return {
      id: id || `${entry.name}-${index}`,
      name: entry.name,
      subtitle,
      role: entry.role || entry.character || '',
      character: entry.character || '',
      image,
      initials: makeInitials(entry.name),
      source: entry.source || 'local',
      order: entry.order ?? index,
    };
  });
}

function resolveEpisodeCount(season){
  const explicit = Number(season.episodeCount ?? season.childCount);
  if(Number.isFinite(explicit) && explicit >= 0) return explicit;
  if(Array.isArray(season.episodes)) return season.episodes.length;
  return null;
}

function buildSeasonSummaries(show){
  const seasons = Array.isArray(show.seasons) ? show.seasons : [];
  return seasons.map((season, index) => {
    const title = firstString(
      season.title,
      season.name,
      Number.isFinite(Number(season.seasonNumber))
        ? `Staffel ${Number(season.seasonNumber)}`
        : `Staffel ${index + 1}`
    );
    const poster = selectImage(
      'show',
      [
        season.poster,
        season.thumbFile,
        season.thumb,
        season.art,
      ],
      buildFallbackPoster,
      title
    );
    const airDate = firstString(
      season.airDate,
      season.originallyAvailableAt,
      season.premiereDate,
      season.year
    );
    return {
      id: season.id || `season-${index}`,
      seasonNumber: Number.isFinite(Number(season.seasonNumber)) ? Number(season.seasonNumber) : null,
      title,
      overview: firstString(season.overview, season.summary, season.description),
      airDate,
      year: parseYear(airDate),
      episodeCount: resolveEpisodeCount(season),
      poster,
      source: 'local',
      episodes: Array.isArray(season.episodes) ? season.episodes : [],
    };
  });
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

function buildGenres(item){
  const result = [];
  const seen = new Set();
  const source = normalizeGenresList(item?.genres || []);
  source.forEach(entry => {
    const name = firstString(entry?.tag, entry?.name, entry?.title, entry);
    if(!name) return;
    const key = name.toLowerCase();
    if(seen.has(key)) return;
    seen.add(key);
    result.push(name);
  });
  return result;
}

function buildBaseViewModel(kind, item){
  const title = pickTitle(item);
  const originalTitle = pickOriginalTitle(item);
  const overview = pickOverview(item);
  const summary = pickSummary(item);
  const tagline = pickTagline(item);
  const releaseDate = pickReleaseDate(item, kind) || '';
  const year = parseYear(item.year) || parseYear(releaseDate);
  const poster = buildPoster(kind, item);
  const backdrop = buildBackdrop(kind, item);
  const cast = buildCastEntries(item);
  const seasons = kind === 'show' ? buildSeasonSummaries(item) : [];
  const { tabs, defaultTab } = buildTabs(kind, { hasCast: cast.length, seasons });
  const badges = buildBadges(kind, item);
  const meta = buildMeta(kind, item);
  const genres = buildGenres(item);

  return {
    kind,
    item,
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
    watchProviders: null,
  };
}

export async function buildMovieViewModel(payload = {}, options = {}){
  const source = payload.item || payload.movie || payload.media || payload;
  const mapped = mapMovie(source);
  if(!mapped) return null;
  mapped.genres = normalizeGenresList(mapped.genres);

  let merged = mapped;
  const tmdbId = mapped?.ids?.tmdb || mapped?.tmdbId;
  if(tmdbId){
    try{
      const tmdbDetail = await loadTmdbDetail('movie', tmdbId, getPreferredLanguage());
      const tmdbMovie = mapTmdbMovie(tmdbDetail);
      if(tmdbMovie){
        merged = mergeMovieSources(tmdbMovie, mapped);
      }
    }catch(err){
      console.warn('[modalV3] Failed to enrich movie from TMDB:', err?.message || err);
    }
  }

  return buildBaseViewModel('movie', merged, options);
}

export async function buildSeriesViewModel(payload = {}, options = {}){
  const base = payload.item || payload.show || payload.media || payload;
  const detail = payload.detail || null;
  const mapped = mapShow(base);
  if(!mapped) return null;
  if(detail){
    mergeShowDetail(mapped, detail);
  }
  mapped.genres = normalizeGenresList(mapped.genres);

  let merged = mapped;
  const tmdbId = mapped?.ids?.tmdb || mapped?.tmdbId;
  if(tmdbId){
    try{
      const tmdbDetail = await loadTmdbDetail('tv', tmdbId, getPreferredLanguage());
      const tmdbShow = mapTmdbShow(tmdbDetail);
      if(tmdbShow){
        merged = mergeShowSources(tmdbShow, mapped);
      }
    }catch(err){
      console.warn('[modalV3] Failed to enrich show from TMDB:', err?.message || err);
    }
  }

  return buildBaseViewModel('show', merged, options);
}

export default {
  buildMovieViewModel,
  buildSeriesViewModel,
};
