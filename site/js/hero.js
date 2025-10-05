import { getState } from './state.js';
import { openMovieModalV2, openSeriesModalV2 } from './modalV2.js';
import { humanYear, formatRating, useTmdbOn } from './utils.js';

let currentHeroItem = null;
let heroDefaults = null;
let navigateToHashHandler = null;

export function setCurrentHeroItem(item){
  currentHeroItem = item || null;
  return currentHeroItem;
}

export function getCurrentHeroItem(){
  return currentHeroItem;
}

export function setHeroDefaults(defaults){
  heroDefaults = defaults ? { ...defaults } : null;
  return heroDefaults;
}

export function getHeroDefaults(){
  return heroDefaults;
}

export function ensureHeroDefaults(){
  if(heroDefaults) return heroDefaults;
  const defaults = {
    title: document.getElementById('heroTitle')?.textContent || '',
    subtitle: document.getElementById('heroSubtitle')?.textContent || '',
    cta: document.getElementById('heroCta')?.textContent || '',
  };
  heroDefaults = defaults;
  return defaults;
}

export function setHeroNavigation(handler){
  navigateToHashHandler = typeof handler === 'function' ? handler : null;
}

export function refreshHero(listOverride){
  const hero = document.getElementById('hero');
  const title = document.getElementById('heroTitle');
  const subtitle = document.getElementById('heroSubtitle');
  const cta = document.getElementById('heroCta');
  if(!hero || !title || !subtitle || !cta) return;

  const defaults = ensureHeroDefaults();
  const candidate = selectHeroItem(listOverride);

  if(!candidate){
    setCurrentHeroItem(null);
    title.textContent = defaults.title;
    subtitle.textContent = defaults.subtitle;
    subtitle.dataset.taglinePaused = '0';
    delete subtitle.dataset.heroBound;
    subtitle.classList.remove('is-fading');
    cta.textContent = defaults.cta;
    cta.disabled = true;
    cta.setAttribute('aria-disabled', 'true');
    cta.removeAttribute('aria-label');
    cta.onclick = null;
    hero.style.backgroundImage = '';
    hero.classList.remove('has-poster');
    hero.dataset.heroKind = '';
    hero.dataset.heroId = '';
    return;
  }

  setCurrentHeroItem(candidate);
  const kind = candidate.type === 'tv' ? 'show' : 'movie';
  const heroId = resolveHeroId(candidate);

  title.textContent = candidate.title || defaults.title;
  subtitle.textContent = heroSubtitleText(candidate);
  subtitle.dataset.taglinePaused = '1';
  subtitle.dataset.heroBound = '1';
  subtitle.classList.remove('is-fading');

  const ctaLabel = kind === 'show' ? 'Serien-Details öffnen' : 'Film-Details öffnen';
  cta.textContent = ctaLabel;
  cta.disabled = false;
  cta.setAttribute('aria-disabled', 'false');
  cta.setAttribute('aria-label', candidate.title ? `${ctaLabel}: ${candidate.title}` : ctaLabel);
  cta.onclick = ()=> openHeroModal(candidate, kind, heroId);

  hero.dataset.heroKind = kind;
  hero.dataset.heroId = heroId || '';

  const background = resolveHeroBackdrop(candidate);
  if(background){
    hero.style.backgroundImage = `url(${background})`;
    hero.classList.add('has-poster');
  }else{
    hero.style.backgroundImage = '';
    hero.classList.remove('has-poster');
  }
}

function selectHeroItem(listOverride){
  if(Array.isArray(listOverride)){
    const playableOverride = listOverride.filter(isPlayableHeroItem);
    if(!playableOverride.length) return null;
    return chooseHeroCandidate(playableOverride);
  }
  const source = heroCandidatesFromState();
  const playable = source.filter(isPlayableHeroItem);
  if(!playable.length) return null;
  return chooseHeroCandidate(playable);
}

function chooseHeroCandidate(list){
  if(list.length === 1) return list[0];
  const index = Math.floor(Math.random() * list.length);
  const candidate = list[index];
  if(currentHeroItem && list.length > 1 && candidate === currentHeroItem){
    const alt = list.find(item=> item !== currentHeroItem);
    return alt || candidate;
  }
  return candidate;
}

function heroCandidatesFromState(){
  const state = getState();
  const view = state.view === 'shows' ? 'shows' : 'movies';
  const filtered = Array.isArray(state.filtered) && state.filtered.length ? state.filtered : null;
  const list = filtered || (view === 'shows' ? state.shows : state.movies) || [];
  return Array.isArray(list) ? list : [];
}

function isPlayableHeroItem(item){
  return Boolean(item) && typeof item === 'object' && !item.isCollectionGroup && item.type !== 'collection';
}

function heroSubtitleText(item){
  const meta = [];
  const year = humanYear(item);
  if(year) meta.push(String(year));
  const runtime = heroRuntimeText(item);
  if(runtime) meta.push(runtime);
  const rating = Number(item?.rating ?? item?.audienceRating);
  if(Number.isFinite(rating)) meta.push(`★ ${formatRating(rating)}`);
  const genres = heroGenres(item, 2);
  if(genres.length) meta.push(genres.join(', '));
  const summary = heroSummaryText(item);
  if(summary) return meta.length ? `${meta.join(' • ')} — ${summary}` : summary;
  const defaults = getHeroDefaults();
  return meta.length ? meta.join(' • ') : defaults?.subtitle || '';
}

function heroRuntimeText(item){
  const raw = item?.runtimeMin ?? item?.durationMin ?? (item?.duration ? Math.round(Number(item.duration) / 60000) : null);
  const minutes = Number(raw);
  if(!Number.isFinite(minutes) || minutes <= 0) return '';
  if(item?.type === 'tv') return `~${minutes} min/Ep`;
  return `${minutes} min`;
}

function heroGenres(item, limit=3){
  const list = Array.isArray(item?.genres) ? item.genres : [];
  const names = [];
  list.forEach(entry=>{
    if(!entry) return;
    if(typeof entry === 'string'){ names.push(entry); return; }
    const name = entry.tag || entry.title || entry.name || entry.label || '';
    if(name) names.push(name);
  });
  const unique = Array.from(new Set(names));
  return unique.slice(0, Math.max(0, limit));
}

function heroSummaryText(item){
  const sources = [item?.tagline, item?.summary, item?.plot, item?.overview];
  for(const raw of sources){
    if(typeof raw !== 'string') continue;
    const text = raw.trim();
    if(text) return truncateText(text, 220);
  }
  return '';
}

function truncateText(text, maxLength){
  const str = String(text || '').trim();
  if(!str) return '';
  if(str.length <= maxLength) return str;
  return `${str.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function resolveHeroId(item){
  if(!item) return '';
  if(item?.ids?.imdb) return String(item.ids.imdb);
  if(item?.ids?.tmdb) return String(item.ids.tmdb);
  if(item?.ratingKey != null) return String(item.ratingKey);
  return '';
}

function openHeroModal(item, kind, heroId){
  if(heroId) navigateToItemHash(kind, heroId);
  if(kind === 'show') openSeriesModalV2(item);
  else openMovieModalV2(item);
}

function navigateToItemHash(kind, id){
  if(!kind || !id) return;
  const hash = `#/${kind}/${id}`;
  const replace = (window.location.hash || '') === hash;
  if(typeof navigateToHashHandler === 'function'){
    try{
      navigateToHashHandler(hash, { silent: true, replace });
      return;
    }catch(err){
      console.warn('[hero] Failed to navigate via handler:', err?.message);
    }
  }
  try{
    window.location.hash = hash;
  }catch(err){
    console.warn('[hero] Failed to update hash directly:', err?.message);
  }
}

function resolveHeroBackdrop(item){
  if(!item) return '';
  const tmdbEnabled = useTmdbOn();
  const tmdbCandidates = [
    item?.tmdb?.backdrop,
    item?.tmdb?.backdrop_path,
    item?.tmdb?.backdropPath,
    item?.tmdb?.background,
    item?.tmdb?.art,
  ];
  const localCandidates = [
    item?.art,
    item?.background,
    item?.thumbBackground,
    item?.coverArt,
    item?.thumb,
    item?.thumbFile,
  ];
  if(tmdbEnabled){
    const tmdb = tmdbCandidates.find(isValidMediaPath);
    if(tmdb) return tmdb;
  }
  const local = localCandidates.find(isValidMediaPath);
  return local || '';
}

function isValidMediaPath(value){
  return typeof value === 'string' && value.trim().length > 0;
}
