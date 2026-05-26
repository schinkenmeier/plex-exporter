import { setState, getState } from './core/state.js';
import { showLoader, setLoader, hideLoader, showSkeleton, clearSkeleton } from './core/loader.js';
import * as Data from './js/data.js';
import * as Filter from './features/filter/index.js';
import { loadMoreItems as filterLoadMore } from './features/filter/index.js';
import { renderGrid } from './features/grid/index.js';
import { openMovieDetailV3, openSeriesDetailV3 } from './features/modal/modalV3/index.js';
import * as Watch from './features/watchlist/index.js';
import * as Newsletter from './features/newsletter/index.js';
import * as Debug from './js/debug.js';
import { initErrorHandler, showError, showRetryableError } from './core/errorHandler.js';
import { debugLog } from './core/debugLogger.js';
import { setHashNavigator, navigateToHash as dispatchHashNavigation, createHashNavigation } from './core/navigation.js';
import { setFooterStatus } from './core/footerStatus.js';
import { initSettingsOverlay, setHeroRefreshHandler, setReduceMotionHandler } from './js/settingsOverlay.js';
import { refreshHero, setHeroNavigation, showHeroFallback } from './features/hero/index.js';
import { initHeroAutoplay } from './features/hero/autoplay.js';
import * as HeroPolicy from './features/hero/policy.js';
import * as HeroPipeline from './features/hero/pipeline.js';
import { loadFrontendConfig, DEFAULT_FRONTEND_CONFIG } from './core/configLoader.js';
import { DEFAULT_PAGE_SIZE } from '@plex-exporter/shared';
import { initSiteNavigation } from './ui/js/siteNavigation.js';
import { initAdvancedToggle } from './ui/js/filterOverlay.js';
import { applyReduceMotionPref, initHeaderInteractions, setReduceMotionClass } from './ui/js/motionHeader.js';
import { initFilterBarAutoHideFallback, initInfiniteScroll, initScrollProgress, initScrollTop } from './ui/js/scrollControls.js';
debugLog('[main] Loading main.js - Modal V3 debugging enabled');
debugLog('[main] Imports loaded, Modal V3 functions:', { openMovieDetailV3, openSeriesDetailV3 });

const heroFallbackNotice = { reason: null };

const HERO_FALLBACK_MESSAGES = {
  error: detail => showError('Highlights vorübergehend nicht verfügbar', detail?.status?.lastError || 'Die Highlights werden bald erneut geladen.'),
  default: () => showError('Highlights vorübergehend nicht verfügbar', 'Die Highlights werden bald erneut geladen.')
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

const hashNavigation = createHashNavigation({ onWarning: console.warn.bind(console) });

setHashNavigator(hashNavigation.navigate);
export const navigateToHash = (hash, options) => dispatchHashNavigation(hash, options);

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
    const kindReady = status && (status.state === 'ready' || status.state === 'stale' || status.state === 'error');
    const busy = status?.regenerating;
    const items = Array.isArray(plan?.items) ? plan.items : [];
    const pipelineError = status?.state === 'error';
    const shouldFallback = (!items.length && pipelineError);
    if(shouldFallback){
      const applied = showHeroFallback('error');
      if(applied){
        announceHeroFallback('error', { status });
      }
      return;
    }
    if(kindReady && !busy && items.length){
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

export async function boot(){
  const isTestEnv = !!globalThis.__PLEX_TEST_MODE__;
  initErrorHandler();
  initSiteNavigation();
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
    setState({
      libraryStatus: {
        ...getState().libraryStatus,
        movies: { items: [], source: 'api', error: null, loading: true, partial: false },
      },
    });
    const moviesResult = await Data.loadMoviesStatus();
    const movies = moviesResult.items;
    setState({
      libraryStatus: {
        ...getState().libraryStatus,
        movies: moviesResult,
      },
    });
    setFooterStatus('Serien laden …', true);
    setLoader('Serien laden …', 45);
    setState({
      libraryStatus: {
        ...getState().libraryStatus,
        shows: { items: [], source: 'api', error: null, loading: true, partial: Boolean(moviesResult.error) },
      },
    });
    const showsResult  = await Data.loadShowsStatus();
    const shows = showsResult.items;
    setState({
      libraryStatus: {
        ...getState().libraryStatus,
        shows: showsResult,
      },
    });

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

    if(!isTestEnv){
      Watch.initUi();
      Newsletter.initUi();
      initSettingsOverlay(cfg);
      initAdvancedToggle();
      initHeaderInteractions();
      initScrollProgress();
      initScrollTop();
      initFilterBarAutoHideFallback();
      initInfiniteScroll();
      refreshHeroWithPipeline();
      initHeroAutoplay({ onRefresh: refreshHeroWithPipeline });
      Debug.initDebugUi();
    }else{
      try{
        refreshHeroWithPipeline();
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
  const [, kind, rawId ] = match;
  const targetId = String(rawId).trim();
  const pool = kind === 'movie' ? getState().movies : getState().shows;
  const item = (pool || []).find(candidate => {
    if(!candidate) return false;
    const ids = candidate.ids && typeof candidate.ids === 'object'
      ? Object.entries(candidate.ids)
      : [];
    const candidates = [];
    ids.forEach(([key, value]) => {
      if(key === 'tmdb' || key === 'themoviedb') return;
      if(value != null) candidates.push(value);
    });
    candidates.push(candidate.ratingKey, candidate.rating_key, candidate.id);
    return candidates.some(value => value != null && String(value).trim() === targetId);
  });
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
    const totalItems = Math.max(0, Number(meta.total) || 0);
    const loadedItems = Math.max(0, Array.isArray(s.filtered) ? s.filtered.length : 0);
    const setField = (name, value) => {
      const field = results.querySelector(`[data-field="${name}"]`);
      if(field) field.textContent = String(value);
    };
    // Show simplified info: "X von Y Titeln" instead of page numbers
    setField('page', loadedItems);
    setField('pages', totalItems);
    setField('pageSize', loadedItems);
    setField('total', totalItems);
    results.hidden = false;
  }
  el.dataset.state = 'ready';
  const grid = document.getElementById('grid');
  if(grid){ grid.setAttribute('aria-busy', 'false'); }
}

Filter.setFiltersUpdatedHandler((items, _view, _meta) => {
  try{
    if(HeroPipeline.isEnabled()){
      refreshHeroWithPipeline();
    }else{
      refreshHeroWithPipeline(items);
    }
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
