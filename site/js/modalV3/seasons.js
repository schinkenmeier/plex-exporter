import metadataService from '../metadataService.js';
import { urlEpisode, makeInitials } from '../imageHelper.js';
import { runtimeText } from './formatting.js';

const LOG_PREFIX = '[modalV3/seasons]';
let seasonInstanceCounter = 0;

function ensureContainer(target){
  if(!target) return null;
  const elementCtor = typeof HTMLElement !== 'undefined' ? HTMLElement : null;
  if(elementCtor && target instanceof elementCtor) return target;
  if(elementCtor && target.root instanceof elementCtor) return target.root;
  if(elementCtor && target.content instanceof elementCtor) return target.content;
  return null;
}

function asArray(value){
  return Array.isArray(value) ? value : [];
}

function sanitizeText(value){
  if(value == null) return '';
  const str = String(value);
  return str.trim();
}

function resolveSeasonNumber(season, fallback){
  const candidates = [
    season?.seasonNumber,
    season?.number,
    season?.index,
    season?.season,
    season?.season_index,
    season?.season_number,
  ];
  for(const candidate of candidates){
    const num = Number(candidate);
    if(Number.isFinite(num)) return num;
  }
  return fallback;
}

function resolveShowIdentifiers(viewModel){
  const item = viewModel?.item || {};
  const tmdb = viewModel?.tmdb || item?.tmdbDetail || item?.tmdb || {};
  const ids = item?.ids || {};
  const tmdbId = (
    tmdb?.id ??
    tmdb?.ids?.tmdb ??
    item?.tmdbId ??
    ids?.tmdb ??
    item?.parent?.ids?.tmdb ??
    null
  );
  const name = sanitizeText(viewModel?.title) || sanitizeText(tmdb?.name) || sanitizeText(item?.title) || '';
  return {
    tmdbId: tmdbId != null ? String(tmdbId).trim() || null : null,
    show: tmdb?.id ? tmdb : { id: tmdbId ?? item?.tmdbId ?? '', name },
  };
}

function buildSeasonMeta(season){
  const parts = [];
  const year = sanitizeText(season?.year) || sanitizeText(season?.airDate);
  if(year) parts.push(year);
  const count = Number(season?.episodeCount);
  if(Number.isFinite(count) && count >= 0){
    const suffix = count === 1 ? 'Episode' : 'Episoden';
    parts.push(`${count} ${suffix}`);
  }
  return parts.join(' • ');
}

function createPoster(season){
  const figure = document.createElement('div');
  figure.className = 'v3-season-card__thumb';
  const posterUrl = sanitizeText(season?.poster?.url || season?.poster);
  const alt = sanitizeText(season?.title) || 'Staffelposter';
  if(posterUrl){
    const img = new Image();
    img.decoding = 'async';
    img.loading = 'lazy';
    img.src = posterUrl;
    img.alt = alt;
    figure.append(img);
  }else{
    figure.dataset.state = 'empty';
    const initials = document.createElement('span');
    initials.textContent = makeInitials(alt, 2) || '∅';
    figure.append(initials);
  }
  return figure;
}

function buildSeasonSummary(season){
  const summary = sanitizeText(season?.overview);
  if(!summary) return null;
  const paragraph = document.createElement('p');
  paragraph.className = 'v3-season-card__summary';
  paragraph.textContent = summary;
  return paragraph;
}

function setExpanded(card, button, panel, expanded){
  const isExpanded = Boolean(expanded);
  card.classList.toggle('is-open', isExpanded);
  button.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
  panel.hidden = !isExpanded;
  panel.setAttribute('aria-hidden', isExpanded ? 'false' : 'true');
}

function combineEpisodeData(ep){
  const tmdb = ep?.tmdb || {};
  const seasonNumber = resolveSeasonNumber(ep, resolveSeasonNumber(tmdb, null));
  const episodeNumber = (()=>{
    const candidates = [
      ep?.episodeNumber,
      ep?.number,
      ep?.index,
      ep?.episode,
      tmdb?.episodeNumber,
    ];
    for(const candidate of candidates){
      const num = Number(candidate);
      if(Number.isFinite(num)) return num;
    }
    return null;
  })();
  const code = (ep?.seasonEpisode && String(ep.seasonEpisode))
    || (Number.isFinite(seasonNumber) && Number.isFinite(episodeNumber)
      ? `S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`
      : '');
  const durationMin = (()=>{
    const candidates = [
      ep?.durationMin,
      ep?.duration,
      tmdb?.runtime,
    ];
    for(const candidate of candidates){
      const num = Number(candidate);
      if(Number.isFinite(num) && num > 0){
        return num > 500 ? Math.round(num / 60000) : Math.round(num);
      }
    }
    return null;
  })();
  const runtimeTextValue = Number.isFinite(durationMin) && durationMin > 0
    ? runtimeText({ runtimeMin: durationMin })
    : '';
  const rating = (()=>{
    const candidates = [
      tmdb?.voteAverage,
      ep?.rating,
      ep?.audienceRating,
      ep?.score,
    ];
    for(const candidate of candidates){
      const num = Number(candidate);
      if(Number.isFinite(num) && num > 0) return num;
    }
    return null;
  })();
  const airDate = sanitizeText(tmdb?.airDate || ep?.airDate || ep?.originallyAvailableAt || ep?.date);
  const overview = sanitizeText(tmdb?.overview || ep?.overview || ep?.summary || ep?.description || ep?.plot);
  const stillPath = tmdb?.stillPath || ep?.tmdbStillPath || ep?.stillPath;
  const stillUrl = tmdb?.still || ep?.tmdbStill || ep?.still || ep?.thumbFile || ep?.thumb;
  const title = sanitizeText(tmdb?.name || ep?.title || ep?.name);
  return {
    title,
    code,
    runtimeText: runtimeTextValue,
    rating,
    overview,
    airDate,
    stillPath,
    stillUrl,
  };
}

export function createEpisodeStill(data, context = {}){
  const wrapper = document.createElement('div');
  wrapper.className = 'v3-episode__still';
  const alt = data.title || context.showTitle || 'Episode';
  if(data.stillPath){
    const small = urlEpisode(data.stillPath, { size: 'w300', title: alt });
    const medium = urlEpisode(data.stillPath, { size: 'w780', title: alt });
    const img = new Image();
    img.decoding = 'async';
    img.loading = 'lazy';
    img.src = small;
    img.srcset = `${small} 300w, ${medium} 780w`;
    img.alt = alt;
    wrapper.append(img);
    return wrapper;
  }
  if(data.stillUrl){
    const img = new Image();
    img.decoding = 'async';
    img.loading = 'lazy';
    img.src = data.stillUrl;
    img.alt = alt;
    wrapper.append(img);
    return wrapper;
  }
  wrapper.dataset.state = 'empty';
  const placeholder = document.createElement('span');
  placeholder.className = 'v3-episode__initials';
  placeholder.textContent = makeInitials(alt, 2) || '∅';
  wrapper.append(placeholder);
  return wrapper;
}

function buildEpisodeTitle(data){
  const parts = [];
  if(data.code) parts.push(data.code);
  if(data.title) parts.push(data.title);
  return parts.join(' • ');
}

function formatRating(value){
  if(!Number.isFinite(value)) return '';
  return value >= 10 ? value.toFixed(0) : value.toFixed(1);
}

function createBadge(text, variant){
  if(!text) return null;
  const badge = document.createElement('span');
  badge.className = 'v3-episode__badge';
  if(variant) badge.dataset.variant = variant;
  badge.textContent = text;
  return badge;
}

function createEpisodeRow(ep, context){
  const data = combineEpisodeData(ep);
  const row = document.createElement('article');
  row.className = 'v3-episode';

  const media = createEpisodeStill(data, context);
  row.append(media);

  const body = document.createElement('div');
  body.className = 'v3-episode__body';

  const header = document.createElement('div');
  header.className = 'v3-episode__header';
  const title = document.createElement('h4');
  title.className = 'v3-episode__title';
  title.textContent = buildEpisodeTitle(data) || 'Episode';
  header.append(title);

  const badges = document.createElement('div');
  badges.className = 'v3-episode__badges';
  const runtimeBadge = createBadge(data.runtimeText, 'runtime');
  const ratingBadge = createBadge(formatRating(data.rating), 'rating');
  if(runtimeBadge) badges.append(runtimeBadge);
  if(ratingBadge) badges.append(ratingBadge);
  if(badges.childElementCount) header.append(badges);

  const meta = document.createElement('p');
  meta.className = 'v3-episode__meta';
  meta.textContent = [data.airDate, data.runtimeText].filter(Boolean).join(' • ');

  const overview = document.createElement('p');
  overview.className = 'v3-episode__overview';
  overview.textContent = data.overview || 'Keine Beschreibung verfügbar.';

  body.append(header, meta, overview);
  row.append(body);
  return row;
}

function renderEpisodeList(container, episodes, context){
  container.replaceChildren();
  const list = asArray(episodes);
  if(!list.length){
    const fallback = document.createElement('p');
    fallback.className = 'v3-episode__empty';
    fallback.textContent = 'Keine Episoden verfügbar.';
    container.append(fallback);
    return;
  }
  list.forEach(ep => container.append(createEpisodeRow(ep, context)));
}

function attachKeyboardNavigation(container){
  if(!container || container.dataset?.accordionReady === '1') return;
  container.dataset.accordionReady = '1';
  const elementCtor = typeof HTMLElement !== 'undefined' ? HTMLElement : null;
  container.addEventListener('keydown', event => {
    if(!elementCtor) return;
    const target = event.target instanceof elementCtor ? event.target : null;
    if(!target || typeof target.matches !== 'function' || !target.matches('[data-season-toggle]')) return;
    const toggles = Array.from(container.querySelectorAll('[data-season-toggle]'));
    if(!toggles.length) return;
    const currentIndex = toggles.indexOf(target);
    if(currentIndex === -1) return;
    if(event.key === 'ArrowDown' || event.key === 'ArrowRight'){
      event.preventDefault();
      const next = toggles[(currentIndex + 1) % toggles.length];
      next?.focus();
    }else if(event.key === 'ArrowUp' || event.key === 'ArrowLeft'){
      event.preventDefault();
      const prev = toggles[(currentIndex - 1 + toggles.length) % toggles.length];
      prev?.focus();
    }else if(event.key === 'Home'){
      event.preventDefault();
      toggles[0]?.focus();
    }else if(event.key === 'End'){
      event.preventDefault();
      toggles[toggles.length - 1]?.focus();
    }
  });
}

function createSeasonCard(season, index, context){
  const card = document.createElement('article');
  card.className = 'v3-season-card';
  const headingId = `v3-season-${seasonInstanceCounter += 1}-header`;
  const panelId = `v3-season-${seasonInstanceCounter}-panel`;

  const heading = document.createElement('h3');
  heading.className = 'v3-season-card__heading';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'v3-season-card__button';
  button.dataset.seasonToggle = '1';
  button.id = headingId;
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', panelId);

  const poster = createPoster(season);
  const label = document.createElement('div');
  label.className = 'v3-season-card__label';
  const title = document.createElement('span');
  title.className = 'v3-season-card__title';
  title.textContent = sanitizeText(season?.title) || `Staffel ${resolveSeasonNumber(season, index + 1)}`;
  const meta = document.createElement('span');
  meta.className = 'v3-season-card__meta';
  meta.textContent = buildSeasonMeta(season);
  label.append(title, meta);

  const chevron = document.createElement('span');
  chevron.className = 'v3-season-card__chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = '›';

  button.append(poster, label, chevron);
  heading.append(button);

  const panel = document.createElement('div');
  panel.id = panelId;
  panel.className = 'v3-season-card__panel';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-labelledby', headingId);
  panel.hidden = true;
  panel.setAttribute('aria-hidden', 'true');

  const summary = buildSeasonSummary(season);
  if(summary) panel.append(summary);
  const episodesRoot = document.createElement('div');
  episodesRoot.className = 'v3-episode-list';
  panel.append(episodesRoot);

  const initialEpisodes = asArray(season?.episodes);
  if(initialEpisodes.length){
    renderEpisodeList(episodesRoot, initialEpisodes, { showTitle: context.showTitle });
  }

  let loaded = Boolean(initialEpisodes.length);
  let loading = false;
  let abortController = null;

  function applyLoadingState(isLoading){
    card.classList.toggle('is-loading', isLoading);
    if(isLoading){
      panel.dataset.loading = 'true';
      episodesRoot.replaceChildren();
      const loadingMessage = document.createElement('p');
      loadingMessage.className = 'v3-episode__loading';
      loadingMessage.textContent = 'Episoden werden geladen …';
      episodesRoot.append(loadingMessage);
    }else{
      delete panel.dataset.loading;
    }
  }

  function cancelRequest(){
    if(abortController && !abortController.signal.aborted){
      abortController.abort();
    }
    abortController = null;
  }

  function fetchEpisodes(){
    if(loaded || loading) return;
    const seasonNumber = resolveSeasonNumber(season, index + 1);
    if(!context.tmdbId || seasonNumber == null){
      loaded = true;
      renderEpisodeList(episodesRoot, initialEpisodes, { showTitle: context.showTitle });
      return;
    }
    if(!metadataService || typeof metadataService.getSeasonEnriched !== 'function'){
      loaded = true;
      renderEpisodeList(episodesRoot, initialEpisodes, { showTitle: context.showTitle });
      return;
    }
    loading = true;
    applyLoadingState(true);
    abortController = typeof AbortController === 'function' ? new AbortController() : null;
    metadataService.getSeasonEnriched(context.tmdbId, seasonNumber, { stillSize: 'w300', show: context.show })
      .then(detail => {
        if(abortController?.signal.aborted) return;
        const episodes = asArray(detail?.episodes);
        if(episodes.length){
          season.episodes = episodes;
          renderEpisodeList(episodesRoot, episodes, { showTitle: context.showTitle });
        }else{
          renderEpisodeList(episodesRoot, [], { showTitle: context.showTitle });
        }
        loaded = true;
      })
      .catch(err => {
        if(abortController?.signal.aborted) return;
        console.warn(LOG_PREFIX, 'Failed to enrich season', context.tmdbId, seasonNumber, err?.message || err);
        renderEpisodeList(episodesRoot, initialEpisodes, { showTitle: context.showTitle });
        loaded = true;
      })
      .finally(() => {
        loading = false;
        applyLoadingState(false);
        abortController = null;
      });
  }

  function toggle(){
    const expanded = button.getAttribute('aria-expanded') === 'true';
    const next = !expanded;
    setExpanded(card, button, panel, next);
    if(next) fetchEpisodes();
  }

  button.addEventListener('click', () => {
    toggle();
  });

  button.addEventListener('keydown', event => {
    if(event.key === ' ' || event.key === 'Spacebar' || event.key === 'Enter'){
      event.preventDefault();
      toggle();
    }
  });

  card._cleanup = () => {
    cancelRequest();
  };

  card.append(heading, panel);
  return card;
}

export function renderSeasons(target, viewModel){
  if(typeof document === 'undefined') return;
  const container = ensureContainer(target);
  if(!container) return;
  seasonInstanceCounter = 0;
  const seasons = asArray(viewModel?.seasons);
  container.classList.add('v3-seasons');
  container.replaceChildren();

  if(!seasons.length){
    const fallback = document.createElement('p');
    fallback.className = 'v3-seasons__empty';
    fallback.textContent = 'Keine Staffelinformationen verfügbar.';
    container.append(fallback);
    return;
  }

  const { tmdbId, show } = resolveShowIdentifiers(viewModel || {});
  const context = {
    tmdbId,
    show,
    showTitle: sanitizeText(viewModel?.title) || sanitizeText(show?.name),
  };

  const cards = seasons.map((season, index) => createSeasonCard(season, index, context));
  cards.forEach(card => container.append(card));
  attachKeyboardNavigation(container);
}

export default renderSeasons;
