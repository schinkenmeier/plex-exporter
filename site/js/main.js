import { setState, getState } from './state.js';
import { showLoader, setLoader, hideLoader, showSkeleton, clearSkeleton } from './loader.js';
import * as Data from './data.js';
import * as Filter from './filter.js';
import { renderGrid } from './grid.js';
import { openMovieModalV2, openSeriesModalV2 } from './modalV2.js';
import { hydrateOptional } from './services/tmdb.js';
import * as Watch from './watchlist.js';
import * as Debug from './debug.js';
import { humanYear, formatRating, useTmdbOn } from './utils.js';
import { initErrorHandler, showError, showRetryableError } from './errorHandler.js';
import { initSettingsOverlay } from './settingsOverlay.js';

let currentHeroItem = null;
let heroDefaults = null;

const hashNavigation = (() => {
  let lastHash = window.location.hash || '';
  let suppressedHash = null;

  function normalizeHash(raw){
    if(typeof raw !== 'string') return '';
    const trimmed = raw.trim();
    if(!trimmed) return '';
    return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  }

  function updateHash(targetHash, options={}){
    const { replace=false, silent=false } = options;
    const hash = normalizeHash(targetHash);
    if(!hash) return;

    const current = window.location.hash || '';
    if(hash === current){
      if(replace && history && typeof history.replaceState === 'function'){
        try{
          history.replaceState(null, '', hash);
        }catch(err){
          console.warn('[main] Failed to replace hash via history:', err.message);
        }
      }
      if(silent){
        suppressedHash = hash;
        lastHash = hash;
      }
      return;
    }

    const method = replace ? 'replaceState' : 'pushState';
    let usedHistory = false;
    try{
      if(history && typeof history[method] === 'function'){
        history[method](null, '', hash);
        usedHistory = true;
      }
    }catch(err){
      console.warn(`[main] Failed to ${replace ? 'replace' : 'push'} hash via history:`, err.message);
    }

    if(!usedHistory){
      window.location.hash = hash;
      if(silent){
        suppressedHash = hash;
        lastHash = hash;
      }
      return;
    }

    if(silent){
      suppressedHash = hash;
      lastHash = hash;
      return;
    }

    try{
      const event = typeof HashChangeEvent === 'function' ? new HashChangeEvent('hashchange') : new Event('hashchange');
      window.dispatchEvent(event);
    }catch(err){
      console.warn('[main] Failed to dispatch hashchange event:', err.message);
    }
  }

  function shouldHandle(hash){
    const current = typeof hash === 'string' ? hash : '';
    if(suppressedHash && current === suppressedHash){
      suppressedHash = null;
      return false;
    }
    suppressedHash = null;
    if(current === lastHash) return false;
    lastHash = current;
    return true;
  }

  function markProcessed(hash){
    lastHash = typeof hash === 'string' ? hash : '';
    suppressedHash = null;
  }

  return { navigate: updateHash, shouldHandle, markProcessed };
})();

export const navigateToHash = (hash, options) => hashNavigation.navigate(hash, options);

function setFooterStatus(message, busy=true){
  const footer = document.getElementById('footerMeta');
  if(footer){
    const status = footer.querySelector('#footerStatus');
    if(status) status.textContent = message;
    else footer.textContent = message;
    footer.dataset.state = busy ? 'loading' : 'ready';
  }
  const grid = document.getElementById('grid');
  if(grid){
    grid.setAttribute('aria-busy', busy ? 'true' : 'false');
  }
}

async function boot(){
  initErrorHandler();
  applyReduceMotionPref();
  showLoader();
  setFooterStatus('Initialisiere …', true);
  setLoader('Initialisiere …', 8);
  showSkeleton(18);

  const cfg = await fetch('config.json').then(r=>r.json()).catch((err)=>{
    console.warn('[main] Failed to load config.json, using defaults:', err.message);
    showError('Konfiguration konnte nicht geladen werden', 'Verwende Standardeinstellungen');
    return { startView:'movies', tmdbEnabled:false };
  });
  setState({ cfg, view: cfg.startView || 'movies' });

  try {
    setFooterStatus('Filme laden …', true);
    setLoader('Filme laden …', 25);
    const movies = await Data.loadMovies();
    setFooterStatus('Serien laden …', true);
    setLoader('Serien laden …', 45);
    const shows  = await Data.loadShows();

    setFooterStatus('Filter vorbereiten …', true);
    setLoader('Filter vorbereiten …', 60);
    // build facets (richer set via Filter)
    const facets = Filter.computeFacets(movies, shows);
    setState({ movies, shows, facets });

    setFooterStatus('Ansicht aufbauen …', true);
    setLoader('Ansicht aufbauen …', 85);
    clearSkeleton();
    renderSwitch();
    Filter.renderFacets(facets);
    Filter.initFilters();
    Filter.applyFilters();
    renderStats(true);
    renderGrid(getState().view);
    renderFooterMeta();

    hideLoader();

    if(cfg.tmdbEnabled) (window.requestIdleCallback || setTimeout)(()=> hydrateOptional?.(movies, shows, cfg), 400);

    Watch.initUi();
    initSettingsOverlay(cfg);
    initAdvancedToggle();
    initHeaderInteractions();
    initScrollProgress();
    initScrollTop();
    initFilterBarAutoHideFallback();
    renderHeroHighlight();
    Debug.initDebugUi();
    handleHashChange(true);
  } catch (error) {
    console.error('[main] Boot failed:', error);
    hideLoader();
    clearSkeleton();
    showRetryableError('Fehler beim Laden der Daten', () => window.location.reload());
    throw error;
  }
  // Re-render grid on TMDB hydration progress to reveal new posters
  let tmdbRaf;
  window.addEventListener('tmdb:chunk', ()=>{
    if(tmdbRaf) return; // throttle to animation frame
    tmdbRaf = requestAnimationFrame(()=>{
      tmdbRaf = null;
      try{
        if(localStorage.getItem('useTmdb')==='1'){
          renderGrid(getState().view);
          renderHeroHighlight();
        }
      }catch(err){
        console.warn('[main] TMDB chunk render failed:', err.message);
      }
    });
  });
  window.addEventListener('tmdb:done', ()=>{
    try{
      if(localStorage.getItem('useTmdb')==='1'){
        renderGrid(getState().view);
        renderHeroHighlight();
      }
    }catch(err){
      console.warn('[main] TMDB done render failed:', err.message);
    }
  });
}

// Debounced hashchange handler to prevent race conditions
let hashchangeTimeout = null;

function applyHashNavigation(hash){
  if(/^#\/(movies|shows)$/.test(hash)){
    const view = hash.includes('shows') ? 'shows' : 'movies';
    setState({ view });
    const result = Filter.applyFilters();
    renderSwitch();
    renderGrid(view);
    renderHeroHighlight(result);
    return true;
  }
  const match = hash.match(/^#\/(movie|show)\/(.+)/);
  if(!match) return false;
  const [, kind, id ] = match;
  const pool = kind === 'movie' ? getState().movies : getState().shows;
  const item = (pool||[]).find(x => (x?.ids?.imdb===id || x?.ids?.tmdb===id || String(x?.ratingKey)===id));
  if(!item) return false;
  if(kind === 'show') openSeriesModalV2(item);
  else openMovieModalV2(item);
  return true;
}

function handleHashChange(force=false){
  const currentHash = window.location.hash || '';
  if(!force && !hashNavigation.shouldHandle(currentHash)) return;
  if(force) hashNavigation.markProcessed(currentHash);
  applyHashNavigation(currentHash);
}

window.addEventListener('hashchange', ()=>{
  if(hashchangeTimeout){
    clearTimeout(hashchangeTimeout);
  }
  hashchangeTimeout = setTimeout(()=>{
    handleHashChange(false);
  }, 50);
});

function renderSwitch(){
  const root = document.getElementById('libraryTabs');
  if(!root) return;
  const buttons = Array.from(root.querySelectorAll('[data-lib]'));
  const current = getState().view === 'shows' ? 'shows' : 'movies';
  buttons.forEach(btn => {
    const target = btn.dataset.lib === 'series' ? 'shows' : 'movies';
    const isActive = current === target;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    if(btn.dataset.bound === 'true') return;
    btn.addEventListener('click', () => {
      const view = btn.dataset.lib === 'series' ? 'shows' : 'movies';
      if(getState().view === view) return;
      setState({ view });
      const target = view === 'movies' ? '#/movies' : '#/shows';
      navigateToHash(target, { silent: true });
      renderSwitch();
      const result = Filter.applyFilters();
      renderGrid(view);
      renderHeroHighlight(result);
    });
    btn.dataset.bound = 'true';
  });
}

function renderStats(animate=false){
  const root = document.getElementById('heroStats');
  if(!root) return;
  const s = getState();
  const movies = (s.movies||[]).length;
  const shows = (s.shows||[]).length;
  const elM = root.querySelector('[data-stat="movies"]');
  const elS = root.querySelector('[data-stat="shows"]');
  if(!elM || !elS) return;
  if(animate){ countTo(elM, movies); countTo(elS, shows); }
  else { elM.textContent=String(movies); elS.textContent=String(shows); }
}

function countTo(el, target){
  if(!el) return;
  const start = Number(el.textContent)||0;
  const end = Number(target)||0;
  if(start===end){ el.textContent = String(end); return; }
  const dur = 480; // ms
  const t0 = performance.now();
  function step(t){
    const p = Math.min(1, (t - t0) / dur);
    const val = Math.round(start + (end - start) * (p<0.5 ? 2*p*p : -1 + (4 - 2*p) * p));
    el.textContent = String(val);
    if(p < 1) requestAnimationFrame(step); else el.textContent = String(end);
  }
  requestAnimationFrame(step);
}

function renderFooterMeta(){
  const el = document.getElementById('footerMeta');
  if(!el) return;
  const status = document.getElementById('footerStatus');
  const s = getState();
  const movies = (s.movies||[]); const shows=(s.shows||[]);
  const times = movies.concat(shows).map(x=> new Date(x.addedAt||0).getTime()).filter(Number.isFinite);
  const latest = times.length ? new Date(Math.max(...times)) : new Date();
  const date = latest.toISOString().slice(0,10);
  if(status){
    status.textContent = `Stand: ${date}`;
  }
  el.dataset.state = 'ready';
  const grid = document.getElementById('grid');
  if(grid){ grid.setAttribute('aria-busy', 'false'); }
}

function renderHeroHighlight(listOverride){
  const hero = document.getElementById('hero');
  const title = document.getElementById('heroTitle');
  const subtitle = document.getElementById('heroSubtitle');
  const cta = document.getElementById('heroCta');
  if(!hero || !title || !subtitle || !cta) return;

  ensureHeroDefaults();
  const candidate = selectHeroItem(listOverride);

  if(!candidate){
    currentHeroItem = null;
    title.textContent = heroDefaults.title;
    subtitle.textContent = heroDefaults.subtitle;
    subtitle.dataset.taglinePaused = '0';
    delete subtitle.dataset.heroBound;
    subtitle.classList.remove('is-fading');
    cta.textContent = heroDefaults.cta;
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

  currentHeroItem = candidate;
  const kind = candidate.type === 'tv' ? 'show' : 'movie';
  const heroId = resolveHeroId(candidate);

  title.textContent = candidate.title || heroDefaults.title;
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

// Expose for hero autoplay timer
window.__heroRefresh = renderHeroHighlight;

function ensureHeroDefaults(){
  if(heroDefaults) return;
  heroDefaults = {
    title: document.getElementById('heroTitle')?.textContent || '',
    subtitle: document.getElementById('heroSubtitle')?.textContent || '',
    cta: document.getElementById('heroCta')?.textContent || '',
  };
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
  return meta.length ? meta.join(' • ') : heroDefaults?.subtitle || '';
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
  navigateToHash(hash, { silent: true, replace });
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

window.addEventListener('filters:updated', ev=>{
  const detail = ev?.detail;
  const items = Array.isArray(detail?.items) ? detail.items : null;
  renderHeroHighlight(items);
});

window.addEventListener('settings:refresh-hero', ev=>{
  try{
    const items = ev?.detail?.items;
    renderHeroHighlight(items);
  }catch(err){
    console.warn('[main] Failed to refresh hero from settings event:', err?.message);
  }
});

window.addEventListener('settings:reduce-motion', ev=>{
  try{
    setReduceMotionClass(!!ev?.detail?.enabled);
  }catch(err){
    console.warn('[main] Failed to apply reduce motion setting from event:', err?.message);
  }
});

boot();

// Fallback: ensure the loading overlay is not left visible
// in case an error interrupts the boot sequence.
window.addEventListener('load', ()=>{
  try{
    hideLoader();
  }catch(err){
    console.warn('[main] Failed to hide loader on load event:', err.message);
  }
});

function setReduceMotionClass(pref){
  try{
    const body = document.body;
    if(body){
      document.documentElement?.classList.remove('reduce-motion', 'reduced-motion');
      body.classList.remove('reduced-motion');
      body.classList.toggle('reduce-motion', pref);
    } else {
      document.documentElement?.classList.toggle('reduce-motion', pref);
      window.addEventListener('DOMContentLoaded', ()=> setReduceMotionClass(pref), { once: true });
    }
  }catch(err){
    console.warn('[main] Failed to update reduce motion class:', err.message);
  }
}

function applyReduceMotionPref(){
  try{
    const pref = localStorage.getItem('prefReduceMotion')==='1';
    setReduceMotionClass(pref);
  }catch(err){
    console.warn('[main] Failed to apply reduce motion preference:', err.message);
  }
}

function initAdvancedToggle(){
  const btn = document.getElementById('toggleAdvanced');
  const panel = document.getElementById('advancedFilters');
  if(!btn || !panel) return;
  let animating = false;
  let fallbackTimer = 0;

  const finishAnimation = ()=>{
    animating = false;
    if(fallbackTimer){
      clearTimeout(fallbackTimer);
      fallbackTimer = 0;
    }
    if(panel.dataset.state === 'closing'){
      panel.dataset.state = 'closed';
      panel.hidden = true;
      panel.style.removeProperty('--advanced-max');
    }else if(panel.dataset.state === 'open'){
      panel.style.removeProperty('--advanced-max');
    }else if(panel.dataset.state === 'expanding'){
      panel.dataset.state = 'open';
      panel.style.removeProperty('--advanced-max');
    }
  };

  const queueFinish = ()=>{
    if(fallbackTimer){
      clearTimeout(fallbackTimer);
    }
    fallbackTimer = window.setTimeout(finishAnimation, 320);
  };

  panel.addEventListener('transitionend', event=>{
    if(event.target !== panel || event.propertyName !== 'max-height') return;
    finishAnimation();
  });

  const openPanel = ()=>{
    if(animating) return;
    animating = true;
    panel.hidden = false;
    panel.dataset.state = 'expanding';
    panel.setAttribute('aria-hidden', 'false');
    panel.style.setProperty('--advanced-max', '0px');
    requestAnimationFrame(()=>{
      const height = panel.scrollHeight;
      panel.style.setProperty('--advanced-max', height + 'px');
      panel.dataset.state = 'open';
      queueFinish();
    });
  };

  const closePanel = ()=>{
    if(animating) return;
    animating = true;
    const height = panel.scrollHeight;
    panel.style.setProperty('--advanced-max', height + 'px');
    panel.dataset.state = 'closing';
    panel.setAttribute('aria-hidden', 'true');
    requestAnimationFrame(()=>{
      panel.style.setProperty('--advanced-max', '0px');
      queueFinish();
    });
  };

  btn.addEventListener('click', ()=>{
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    if(expanded){
      btn.setAttribute('aria-expanded', 'false');
      closePanel();
    }else{
      btn.setAttribute('aria-expanded', 'true');
      openPanel();
    }
  });
}

function initHeaderInteractions(){
  const siteLogo = document.getElementById('siteLogo');
  if(siteLogo){
    siteLogo.addEventListener('error', ()=>{
      siteLogo.classList.add('logo-missing');
      const titleEl = document.querySelector('.site-header__brand-text .site-header__label');
      if(titleEl) titleEl.classList.remove('sr-only');
    });
  }
  const subtitle = document.getElementById('heroSubtitle');
  const TAGLINES = [
    'Offline stöbern & Wunschlisten teilen',
    'Filter. Finden. Freuen.',
    'Filme & Serien – stressfrei sichtbar',
    'Schneller als jeder SMB-Share',
    'Merkliste zuerst, Streit später'
  ];
  let idx = 0; if(subtitle) subtitle.textContent = TAGLINES[idx];
  function rotate(){
    if(!subtitle || subtitle.dataset.taglinePaused==='1') return;
    subtitle.classList.add('is-fading');
    setTimeout(()=>{
      if(!subtitle || subtitle.dataset.taglinePaused==='1'){ subtitle && subtitle.classList.remove('is-fading'); return; }
      idx = (idx+1)%TAGLINES.length; subtitle.textContent = TAGLINES[idx]; subtitle.classList.remove('is-fading');
    }, 280);
  }
  if(subtitle){ subtitle.dataset.taglinePaused='0'; if(!window.__taglineTicker){ window.__taglineTicker = setInterval(rotate, 6000); setTimeout(rotate, 3000); } }
}

function initScrollProgress(){
  const bar = document.getElementById('scrollProgress');
  if(!bar) return;
  const update = ()=>{
    const scrollTop = document.documentElement.scrollTop || document.body.scrollTop || 0;
    const height = (document.documentElement.scrollHeight - document.documentElement.clientHeight) || 1;
    const pct = Math.max(0, Math.min(100, (scrollTop/height)*100));
    bar.style.width = pct + '%';
  };
  addEventListener('scroll', update, { passive:true });
  update();
}

function initScrollTop(){
  const btn = document.getElementById('scrollTop');
  if(!btn) return;
  const toggle = ()=>{ const y = window.scrollY||0; btn.style.display = y>300 ? 'block' : 'none'; };
  addEventListener('scroll', toggle, { passive:true });
  toggle();
  btn.addEventListener('click', ()=> window.scrollTo({ top:0, behavior:'smooth' }));
}

function initFilterBarAutoHideFallback(){
  const filters = document.querySelector('.filters');
  if(!filters) return;

  const supportsScrollTimeline = typeof CSS !== 'undefined'
    && typeof CSS.supports === 'function'
    && CSS.supports('animation-timeline: scroll()');

  if(supportsScrollTimeline) return;

  let lastY = window.scrollY || window.pageYOffset || 0;
  let isHidden = false;
  let ticking = false;
  const MIN_SCROLL = 120;
  const DELTA_HIDE = 8;

  const setHidden = (nextHidden)=>{
    if(isHidden === nextHidden) return;
    isHidden = nextHidden;
    filters.classList.toggle('is-hidden', isHidden);
  };

  const update = ()=>{
    ticking = false;
    const currentY = window.scrollY || window.pageYOffset || 0;

    if(currentY <= MIN_SCROLL){
      setHidden(false);
      lastY = currentY;
      return;
    }

    const delta = currentY - lastY;
    lastY = currentY;

    if(delta > DELTA_HIDE){
      setHidden(true);
    }else if(delta < -DELTA_HIDE){
      setHidden(false);
    }
  };

  const onScroll = ()=>{
    if(ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  window.addEventListener('scroll', onScroll, { passive:true });
  window.addEventListener('resize', update);

  const reveal = ()=> setHidden(false);
  filters.addEventListener('focusin', reveal);
  filters.addEventListener('pointerenter', reveal, { passive:true });
  filters.addEventListener('pointerdown', reveal, { passive:true });

  update();
}
