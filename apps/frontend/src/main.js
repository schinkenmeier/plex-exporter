console.log('[main] Loading main.js - Modal V3 debugging enabled');
import { setState, getState } from './core/state.js';
import { showLoader, setLoader, hideLoader, showSkeleton, clearSkeleton } from './core/loader.js';
import * as Data from './js/data.js';
import * as Filter from './features/filter/index.js';
import { renderGrid } from './features/grid/index.js';
import { openMovieDetailV3, openSeriesDetailV3 } from './features/modal/modalV3/index.js';
import { hydrateOptional } from './services/tmdb.js';
import * as Watch from './features/watchlist/index.js';
import * as Debug from './js/debug.js';
import { initErrorHandler, showError, showRetryableError } from './core/errorHandler.js';
import { initSettingsOverlay, setHeroRefreshHandler, setReduceMotionHandler } from './js/settingsOverlay.js';
import { refreshHero, setHeroNavigation, showHeroFallback } from './features/hero/index.js';
import { initHeroAutoplay } from './features/hero/autoplay.js';
import * as HeroPolicy from './features/hero/policy.js';
import * as HeroPipeline from './features/hero/pipeline.js';
import { syncDefaultMetadataService } from './core/metadataService.js';
import { loadFrontendConfig, DEFAULT_FRONTEND_CONFIG } from './core/configLoader.js';
import { DEFAULT_PAGE_SIZE } from '@plex-exporter/shared';
console.log('[main] Imports loaded, Modal V3 functions:', { openMovieDetailV3, openSeriesDetailV3 });

const DEFAULT_FEATURE_FLAGS = { tmdbEnrichment: false };
const globalFeatures = (()=>{
  const existing = typeof window !== 'undefined' && window.FEATURES ? window.FEATURES : {};
  const merged = { ...DEFAULT_FEATURE_FLAGS, ...existing };
  if(typeof window !== 'undefined'){
    window.FEATURES = merged;
  }
  return merged;
})();

function applyFeatureFlags(cfg){
  try{
    if(globalFeatures){
      globalFeatures.tmdbEnrichment = !!(cfg && cfg.tmdbEnabled);
    }
    if(typeof window !== 'undefined' && window.FEATURES && window.FEATURES !== globalFeatures){
      window.FEATURES = { ...window.FEATURES, ...globalFeatures };
    }
  }catch(err){
    console.warn('[main] Failed to apply feature flags:', err?.message || err);
  }
}

let taglineTicker = null;
const heroFallbackNotice = { reason: null };

const HERO_FALLBACK_MESSAGES = {
  'rate-limit': () => showError('TMDb drosselt Anfragen', 'Highlights werden kurzzeitig langsamer aktualisiert.'),
  error: detail => showError('Highlights vorübergehend nicht verfügbar', detail?.status?.lastError || 'TMDb-Daten konnten nicht geladen werden.'),
  default: () => showError('Highlights vorübergehend nicht verfügbar', 'TMDb-Daten konnten nicht geladen werden.')
};

function announceHeroFallback(reason, detail){
  if(heroFallbackNotice.reason === reason) return;
  heroFallbackNotice.reason = reason;
  const handler = HERO_FALLBACK_MESSAGES[reason] || HERO_FALLBACK_MESSAGES.default;
  try {
    handler(detail);
  } catch (err) {
    console.warn('[main] Failed to show hero fallback notification:', err?.message || err);
  }
}

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

setHeroNavigation(navigateToHash);

function refreshHeroWithPipeline(listOverride){
  if(Array.isArray(listOverride) && listOverride.length){
    heroFallbackNotice.reason = null;
    refreshHero(listOverride);
    return;
  }
  if(HeroPipeline.isEnabled()){
    const currentView = getState().view === 'shows' ? 'series' : 'movies';
    const plan = HeroPipeline.getRotationPlan(currentView);
    const status = plan?.snapshot?.status?.[currentView];
    const ready = HeroPipeline.isReady();
    const busy = status?.regenerating;
    const items = Array.isArray(plan?.items) ? plan.items : [];
    const tmdbRateLimit = plan?.snapshot?.tmdb?.rateLimit;
    const rateLimited = !!tmdbRateLimit?.active;
    const pipelineError = status?.state === 'error';
    const shouldFallback = (!items.length && (pipelineError || (rateLimited && ready && !busy)));
    if(shouldFallback){
      const reason = pipelineError ? 'error' : 'rate-limit';
      const applied = showHeroFallback(reason);
      if(applied){
        announceHeroFallback(reason, { status, rateLimit: tmdbRateLimit });
      }
      return;
    }
    if(ready && !busy && items.length){
      const index = plan.startIndex % items.length;
      const entry = items[index];
      if(entry){
        heroFallbackNotice.reason = null;
        refreshHero([entry]);
        return;
      }
    }
  }
  heroFallbackNotice.reason = null;
  refreshHero(listOverride);
}

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
  const results = document.getElementById('footerResults');
  if(results){
    results.hidden = busy;
  }
}

export async function boot(){
  const isTestEnv = !!globalThis.__PLEX_TEST_MODE__;
  initErrorHandler();
  applyReduceMotionPref();
  showLoader();
  setFooterStatus('Initialisiere …', true);
  setLoader('Initialisiere …', 8);
  showSkeleton(18);

  const configPromise = loadFrontendConfig().catch((err)=>{
    console.warn('[main] Failed to load frontend config, using defaults:', err?.message || err);
    showError('Konfiguration konnte nicht geladen werden', 'Verwende Standardeinstellungen');
    return { ...DEFAULT_FRONTEND_CONFIG };
  });
  const policyPromise = HeroPolicy.initHeroPolicy().catch((err)=>{
    console.warn('[main] Failed to initialise hero policy:', err?.message || err);
    return HeroPolicy.getHeroPolicy();
  });

  const [cfg, heroPolicy] = await Promise.all([configPromise, policyPromise]);
  applyFeatureFlags(cfg);
  syncDefaultMetadataService(cfg);
  const heroPipelineInfo = HeroPipeline.configure({ cfg, policy: heroPolicy });
  setState({
    cfg,
    view: cfg.startView || 'movies',
    heroPolicy,
    heroPolicyIssues: HeroPolicy.getValidationIssues(),
    heroPipelineEnabled: heroPipelineInfo.enabled,
    heroPipelineSource: heroPipelineInfo.source
  });

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
    const facets = await Filter.computeFacets(movies, shows);
    setState({ movies, shows, facets });
    HeroPipeline.setSources({ movies, shows });
    HeroPipeline.setActiveView(getState().view);

    if(HeroPipeline.isEnabled()){
      setFooterStatus('Highlights vorbereiten …', true);
      setLoader('Highlights vorbereiten …', 70);
      try {
        await HeroPipeline.primeAll();
      } catch (err) {
        console.warn('[main] Hero pipeline initial prime failed:', err?.message || err);
      }
      // Subscribe to pipeline updates to refresh hero when data changes
      HeroPipeline.subscribe((snapshot) => {
        const currentView = getState().view === 'shows' ? 'series' : 'movies';
        const status = snapshot?.status?.[currentView];
        if (status?.state === 'ready' && !status?.regenerating) {
          refreshHeroWithPipeline();
        }
      });
    }

    setFooterStatus('Ansicht aufbauen …', true);
    setLoader('Ansicht aufbauen …', 85);
    clearSkeleton();
    renderSwitch();
    Filter.renderFacets(facets);
    Filter.initFilters();
    const filtered = Filter.applyFilters();
    renderStats(true);
    renderGrid(getState().view);
    renderFooterMeta();

    hideLoader();

    if(cfg.tmdbEnabled){
      if(window.requestIdleCallback){
        window.requestIdleCallback(()=> hydrateOptional?.(movies, shows, cfg), { timeout: 600 });
      }else{
        setTimeout(()=> hydrateOptional?.(movies, shows, cfg), 400);
      }
    }

    if(!isTestEnv){
      Watch.initUi();
      initSettingsOverlay(cfg);
      initAdvancedToggle();
      initHeaderInteractions();
      initScrollProgress();
      initScrollTop();
      initFilterBarAutoHideFallback();
      refreshHeroWithPipeline(filtered);
      initHeroAutoplay({ onRefresh: refreshHeroWithPipeline });
      Debug.initDebugUi();
    }else{
      try{
        refreshHeroWithPipeline(filtered);
      }catch(err){
        console.warn('[main] Test env hero refresh skipped:', err?.message || err);
      }
    }
    handleHashChange(true);
  } catch (error) {
    console.error('[main] Boot failed:', error);
    hideLoader();
    clearSkeleton();
    showRetryableError('Fehler beim Laden der Daten', () => window.location.reload());
    throw error;
  }
  // Re-render grid on TMDB hydration progress to reveal new posters/data
  // Note: Grid cards only re-render if user has enabled TMDB images
  // Hero banner always uses TMDB data when credentials are available
  let tmdbRaf;
  window.addEventListener('tmdb:chunk', ()=>{
    if(tmdbRaf) return; // throttle to animation frame
    tmdbRaf = requestAnimationFrame(()=>{
      tmdbRaf = null;
      try{
        const useTmdbCards = localStorage.getItem('useTmdb')==='1';
        if(useTmdbCards){
          renderGrid(getState().view);
        }
        // Always refresh hero when new TMDB data arrives (hero uses TMDB automatically)
        refreshHeroWithPipeline();
      }catch(err){
        console.warn('[main] TMDB chunk render failed:', err.message);
      }
    });
  });
  window.addEventListener('tmdb:done', ()=>{
    try{
      const useTmdbCards = localStorage.getItem('useTmdb')==='1';
      if(useTmdbCards){
        renderGrid(getState().view);
      }
      // Always refresh hero when TMDB hydration is complete
      refreshHeroWithPipeline();
    }catch(err){
      console.warn('[main] TMDB done render failed:', err.message);
    }
  });
}

// Debounced hashchange handler to prevent race conditions
let hashchangeTimeout = null;

async function applyHashNavigation(hash){
  if(/^#\/(movies|shows)$/.test(hash)){
    const view = hash.includes('shows') ? 'shows' : 'movies';
    setState({ view });
    HeroPipeline.setActiveView(view);
    HeroPipeline.ensureKind(view === 'shows' ? 'series' : 'movies').catch(err => {
      console.warn('[main] Failed to ensure hero pool on hash navigation:', err?.message || err);
    });
    renderSwitch();
    const result = Filter.applyFilters();
    renderGrid(view);
    refreshHeroWithPipeline(result);
    renderFooterMeta();
    return true;
  }
  const match = hash.match(/^#\/(movie|show)\/(.+)/);
  if(!match) return false;
  const [, kind, id ] = match;
  const pool = kind === 'movie' ? getState().movies : getState().shows;
  const item = (pool||[]).find(x => (x?.ids?.imdb===id || x?.ids?.tmdb===id || String(x?.ratingKey)===id));
  if(!item) return false;
  if(kind === 'show') openSeriesDetailV3(item);
  else openMovieDetailV3(item);
  return true;
}

function handleHashChange(force=false){
  const currentHash = window.location.hash || '';
  if(!force && !hashNavigation.shouldHandle(currentHash)) return;
  if(force) hashNavigation.markProcessed(currentHash);
  applyHashNavigation(currentHash).catch(err => {
    console.warn('[main] Failed to apply hash navigation:', err?.message || err);
  });
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
      HeroPipeline.setActiveView(view);
      if(HeroPipeline.isEnabled()){
        const ensure = HeroPipeline.ensureKind(view === 'shows' ? 'series' : 'movies');
        if(ensure && typeof ensure.catch === 'function'){
          ensure.catch(err => {
            console.warn('[main] Failed to ensure hero pool on view switch:', err?.message || err);
          });
        }
      }
      const target = view === 'movies' ? '#/movies' : '#/shows';
      navigateToHash(target, { silent: true });
      renderSwitch();
      const result = Filter.applyFilters();
      renderGrid(view);
      refreshHeroWithPipeline(result);
      renderFooterMeta();
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
  const results = document.getElementById('footerResults');
  if(results){
    const fallbackTotal = Array.isArray(s.filtered) ? s.filtered.length : 0;
    const meta = s.filteredMeta || { page: 1, pageSize: DEFAULT_PAGE_SIZE, total: fallbackTotal };
    const safePageSize = Math.max(1, Number(meta.pageSize) || DEFAULT_PAGE_SIZE);
    const totalItems = Math.max(0, Number(meta.total) || 0);
    const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
    const currentPage = Math.min(Math.max(1, Number(meta.page) || 1), totalPages);
    const setField = (name, value) => {
      const field = results.querySelector(`[data-field="${name}"]`);
      if(field) field.textContent = String(value);
    };
    setField('page', currentPage);
    setField('pages', totalPages);
    setField('pageSize', safePageSize);
    setField('total', totalItems);
    results.hidden = false;
  }
  el.dataset.state = 'ready';
  const grid = document.getElementById('grid');
  if(grid){ grid.setAttribute('aria-busy', 'false'); }
}

Filter.setFiltersUpdatedHandler((items, _view, _meta) => {
  try{
    refreshHeroWithPipeline(items);
    renderFooterMeta();
  }catch(err){
    console.warn('[main] Failed to refresh hero from filters handler:', err?.message);
  }
});

setHeroRefreshHandler(items => {
  try{
    refreshHeroWithPipeline(items);
    renderFooterMeta();
  }catch(err){
    console.warn('[main] Failed to refresh hero from settings handler:', err?.message);
  }
});

setReduceMotionHandler(enabled => {
  try{
    setReduceMotionClass(!!enabled);
  }catch(err){
    console.warn('[main] Failed to apply reduce motion setting from handler:', err?.message);
  }
});

if(!globalThis.__PLEX_TEST_MODE__){
  boot();
}

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
  const subtitle = document.getElementById('heroTagline');
  const TAGLINES = [
    'Curated spotlights and smart filters for every mood.',
    'Bring Plex highlights anywhere with server-powered browsing.',
    'Plan your next movie night with shareable watchlists.'
  ];
  let idx = 0;
  if(subtitle && !subtitle.textContent){
    subtitle.textContent = TAGLINES[idx];
  }
  function rotate(){
    if(!subtitle || subtitle.dataset.taglinePaused === '1') return;
    subtitle.classList.add('is-fading');
    setTimeout(()=>{
      if(!subtitle || subtitle.dataset.taglinePaused === '1'){ subtitle && subtitle.classList.remove('is-fading'); return; }
      idx = (idx + 1) % TAGLINES.length;
      subtitle.textContent = TAGLINES[idx];
      subtitle.classList.remove('is-fading');
    }, 280);
  }
  if(subtitle){
    subtitle.dataset.taglinePaused = subtitle.dataset.taglinePaused === '1' ? '1' : '0';
    if(taglineTicker){
      clearInterval(taglineTicker);
    }
    taglineTicker = setInterval(rotate, 6000);
    setTimeout(rotate, 3000);
  }else if(taglineTicker){
    clearInterval(taglineTicker);
    taglineTicker = null;
  }
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
