import { prefixShowThumb } from '../data.js';
import metadataService from '../metadataService.js';
import { urlEpisode, makeInitials } from '../imageHelper.js';

const LOG_PREFIX = '[seasonsAccordion]';

export function renderSeasonsAccordion(targetOrSeasons, maybeSeasons, maybeOptions){
  const { root, seasons, options } = resolveContext(targetOrSeasons, maybeSeasons, maybeOptions);
  if(!root) return;
  root.replaceChildren();
  (seasons || []).forEach((s, idx) => root.append(seasonCardEl(s, idx, options)));
}

function isTarget(value){
  return value instanceof Element || typeof value === 'string';
}

function resolveTarget(value){
  if(value instanceof Element) return value;
  if(typeof value === 'string') return document.querySelector(value);
  return null;
}

function resolveContext(targetOrSeasons, maybeSeasons, maybeOptions){
  let target = null;
  let seasons = [];
  let options = {};

  if(isTarget(targetOrSeasons)){
    target = resolveTarget(targetOrSeasons);
    if(Array.isArray(maybeSeasons)){
      seasons = maybeSeasons;
      options = isPlainObject(maybeOptions) ? maybeOptions : {};
    }else{
      seasons = Array.isArray(targetOrSeasons) ? targetOrSeasons : [];
      options = isPlainObject(maybeSeasons) ? maybeSeasons : {};
    }
  }else if(Array.isArray(targetOrSeasons)){
    seasons = targetOrSeasons;
    if(isTarget(maybeSeasons)){
      target = resolveTarget(maybeSeasons);
      options = isPlainObject(maybeOptions) ? maybeOptions : {};
    }else{
      options = isPlainObject(maybeSeasons) ? maybeSeasons : {};
    }
  }else{
    target = resolveTarget(targetOrSeasons);
    seasons = Array.isArray(maybeSeasons) ? maybeSeasons : [];
    options = isPlainObject(maybeOptions) ? maybeOptions : {};
  }

  if(!target) target = document.getElementById('seasonsAccordion');
  return { root: target, seasons, options };
}

function isPlainObject(value){
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function seasonCardEl(season, idx, options = {}){
  prefixShowThumb(season);
  const card = document.createElement('article'); card.className='season-card';
  const head = document.createElement('div'); head.className='season-head';
  const th = document.createElement('div'); th.className='season-thumb';
  const img = new Image(); img.loading='lazy'; img.decoding='async';
  img.src = season.thumbFile || '';
  img.alt = season.title || `Staffel ${season.seasonNumber||idx+1}`;
  th.append(img);
  const txt = document.createElement('div');
  const title = document.createElement('div'); title.className='season-title'; title.textContent = season.title || `Staffel ${season.seasonNumber||idx+1}`;
  const sub = document.createElement('div'); sub.className='season-sub';
  const year = season.year || season.releaseYear || '';
  const epCount = Array.isArray(season.episodes) ? season.episodes.length : (season.episodeCount || 0);
  sub.textContent = [year, epCount ? `${epCount} Episoden` : ''].filter(Boolean).join(' • ');
  txt.append(title, sub);
  const chev = document.createElement('div'); chev.className='chev'; chev.textContent = '›';
  head.append(th, txt, chev);
  const body = document.createElement('div'); body.className='season-body';
  renderEpisodeRows(body, season.episodes || [], { show: options.show });

  const seasonNumber = resolveSeasonNumber(season, idx);
  const tvId = resolveShowTmdbId(season, options.show);
  let loaded = false;
  let loading = false;

  head.addEventListener('click', ()=>{
    const isOpen = card.classList.toggle('open');
    if(!isOpen || loaded || loading) return;
    if(!shouldEnrichSeason(tvId, seasonNumber)){
      loaded = true;
      return;
    }
    loading = true;
    metadataService.getSeasonEnriched(tvId, seasonNumber, { stillSize: 'w300', show: options.show || null })
      .then(detail => {
        if(!detail || !Array.isArray(detail.episodes)) return;
        mergeSeasonEpisodes(season, detail.episodes);
        renderEpisodeRows(body, season.episodes || [], { show: options.show });
        loaded = true;
      })
      .catch(err => {
        logWarn('Failed to enrich season', tvId, seasonNumber, err?.message || err);
      })
      .finally(()=>{ loading = false; });
  });

  card.append(head, body);
  return card;
}

function renderEpisodeRows(body, episodes, options = {}){
  body.replaceChildren();
  const list = Array.isArray(episodes) ? episodes : [];
  if(!list.length){
    const empty = document.createElement('p');
    empty.className = 'episode-empty';
    empty.textContent = 'Keine Episoden verfügbar.';
    body.append(empty);
    return;
  }
  list.forEach(ep => {
    prefixShowThumb(ep);
    body.append(episodeRowEl(ep, options));
  });
}

function episodeRowEl(ep, options = {}){
  const data = combineEpisodeData(ep);
  const row = document.createElement('div'); row.className='episode';

  const media = document.createElement('div'); media.className='ep-media';
  media.append(createEpisodeStill(data, options));

  const content = document.createElement('div'); content.className='ep-content';

  const header = document.createElement('div'); header.className='ep-header';
  const title = document.createElement('div'); title.className='ep-title';
  title.textContent = buildEpisodeTitle(data);
  header.append(title);

  const right = document.createElement('div'); right.className='badges';
  const rating = Number(data.rating);
  if(Number.isFinite(rating)){
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = rating.toFixed(1);
    right.append(badge);
  }
  if(right.childElementCount){
    header.append(right);
  }

  const meta = document.createElement('div'); meta.className='ep-meta';
  const metaParts = [];
  if(data.runtimeText) metaParts.push(data.runtimeText);
  if(data.airDate) metaParts.push(data.airDate);
  meta.textContent = metaParts.join(' • ');

  const overview = document.createElement('p'); overview.className='ep-overview';
  overview.textContent = data.overview || 'Keine Beschreibung verfügbar.';

  content.append(header, meta, overview);
  row.append(media, content);
  return row;
}

function buildEpisodeTitle(data){
  const parts = [];
  if(data.code) parts.push(data.code);
  if(data.title) parts.push(data.title);
  return parts.join(' • ');
}

function createEpisodeStill(data, options = {}){
  const wrapper = document.createElement('div');
  wrapper.className = 'ep-still';
  const stillPath = data.tmdbStillPath;
  const stillUrl = data.tmdbStill || data.localStill;
  const alt = data.title || options?.show?.title || 'Episode';
  if(stillPath || stillUrl){
    const img = new Image();
    img.loading = 'lazy';
    img.decoding = 'async';
    if(stillPath){
      const small = urlEpisode(stillPath, { size: 'w300', title: alt });
      const medium = urlEpisode(stillPath, { size: 'w780', title: alt });
      img.src = small;
      img.srcset = `${small} 300w, ${medium} 780w`;
    }else{
      img.src = stillUrl;
    }
    img.alt = alt;
    wrapper.append(img);
    return wrapper;
  }
  wrapper.dataset.state = 'empty';
  const placeholder = document.createElement('div');
  placeholder.className = 'ep-still-initials';
  placeholder.textContent = makeInitials(data.title || options?.show?.title || '', 2) || '∅';
  wrapper.append(placeholder);
  return wrapper;
}

function combineEpisodeData(ep){
  const tmdb = ep?.tmdb || {};
  const seasonNumber = resolveNumeric(ep?.seasonNumber, tmdb?.seasonNumber);
  const episodeNumber = resolveNumeric(ep?.episodeNumber, tmdb?.episodeNumber, ep?.index);
  const code = (ep?.seasonEpisode && String(ep.seasonEpisode).toUpperCase())
    || (Number.isFinite(seasonNumber) && Number.isFinite(episodeNumber)
      ? `S${String(seasonNumber).padStart(2,'0')}E${String(episodeNumber).padStart(2,'0')}`
      : '');
  const durationMin = ep?.durationMin
    || (Number.isFinite(ep?.duration) ? Math.round(Number(ep.duration)/60000) : null)
    || (Number.isFinite(tmdb?.runtime) ? Number(tmdb.runtime) : null);
  const runtimeText = ep?.durationHuman
    || (Number.isFinite(durationMin) && durationMin > 0 ? `${durationMin} min` : '');
  const rating = Number.isFinite(tmdb?.voteAverage)
    ? Number(tmdb.voteAverage)
    : Number(ep?.audienceRating ?? ep?.rating ?? ep?.score ?? NaN);
  const overview = tmdb?.overview
    || ep?.summary || ep?.overview || ep?.description || ep?.plot || '';
  const airDate = tmdb?.airDate || ep?.originallyAvailableAt || ep?.date || ep?.airDate || '';
  const stillPath = tmdb?.stillPath || ep?.stillPath || '';
  const still = tmdb?.still || ep?.still || ep?.thumbFile || ep?.thumb || '';
  return {
    title: tmdb?.name || ep?.title || ep?.name || '',
    code,
    runtimeText,
    rating,
    overview,
    airDate,
    tmdbStillPath: stillPath,
    tmdbStill: tmdb?.still || '',
    localStill: still,
  };
}

function mergeSeasonEpisodes(season, enrichedEpisodes){
  if(!season || typeof season !== 'object') return;
  const localEpisodes = Array.isArray(season.episodes) ? season.episodes : [];
  const lookup = new Map();
  localEpisodes.forEach(ep => {
    const key = buildEpisodeKey(ep);
    if(key) lookup.set(key, ep);
  });
  enrichedEpisodes.forEach(entry => {
    const key = buildEpisodeKey(entry);
    if(!key || !lookup.has(key)) return;
    const target = lookup.get(key);
    target.tmdb = {
      id: entry.id || '',
      seasonNumber: resolveNumeric(entry.seasonNumber),
      episodeNumber: resolveNumeric(entry.episodeNumber),
      name: entry.name || '',
      overview: entry.overview || '',
      airDate: entry.airDate || '',
      runtime: resolveNumeric(entry.runtime),
      voteAverage: Number(entry.voteAverage ?? entry.vote_average ?? NaN),
      voteCount: resolveNumeric(entry.voteCount ?? entry.vote_count),
      still: entry.still || '',
      stillPath: entry.stillPath || '',
    };
  });
}

function buildEpisodeKey(ep){
  if(!ep) return '';
  const seasonNumber = resolveNumeric(ep.seasonNumber, ep.parentIndex, ep.parentSeason, ep.season);
  const episodeNumber = resolveNumeric(ep.episodeNumber, ep.index, ep.episode, ep.indexNumber);
  if(!Number.isFinite(seasonNumber) || !Number.isFinite(episodeNumber)) return '';
  return `${seasonNumber}:${episodeNumber}`;
}

function resolveNumeric(...values){
  for(const value of values){
    const num = Number(value);
    if(Number.isFinite(num)) return num;
  }
  return null;
}

function resolveSeasonNumber(season, idx){
  const num = resolveNumeric(season?.seasonNumber, season?.index, season?.indexNumber);
  if(Number.isFinite(num)) return num;
  return (idx ?? 0) + 1;
}

function resolveShowTmdbId(season, show){
  const showIds = show?.ids || {};
  const direct = showIds?.tmdb || show?.tmdbId || show?.tmdb?.id || show?.id;
  const seasonId = season?.tmdbShowId
    || season?.parent?.ids?.tmdb
    || season?.parent?.tmdbId
    || season?.ids?.tmdbShow;
  const value = direct || seasonId;
  if(value == null) return null;
  const str = String(value).trim();
  return str ? str : null;
}

function shouldEnrichSeason(tvId, seasonNumber){
  if(!window?.FEATURES?.tmdbEnrichment) return false;
  if(!tvId || seasonNumber == null) return false;
  return true;
}

function logWarn(...args){
  try {
    console.warn(LOG_PREFIX, ...args);
  } catch (_err) {
    // ignore
  }
}

