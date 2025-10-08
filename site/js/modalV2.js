import { applyTabs } from './modal/tabs.js';
import { renderHeader, fillPosterAndQuickfacts } from './modal/headerSection.js';
import { renderOverview } from './modal/overviewSection.js';
import { renderDetails } from './modal/detailsSection.js';
import { updateSeasons } from './modal/seasonsSection.js';
import { setExternalLinks } from './modal/externalLinks.js';
import { renderCast, buildCastList, setCastLoading, setCastStatus } from './modal/castSection.js';
import { getState } from './state.js';
import { loadShowDetail } from './data.js';
import { mapMovie, mapShow, mergeShowDetail, needsShowDetail } from './modal/shared.js';
import { getMovieEnriched, getTvEnriched } from './metadataService.js';

let overlayContainer = null;
let dialogEl = null;
let scrollContainer = null;
let rootEl = null;
let lastActiveElement = null;
let focusTrapHandler = null;
let escapeHandler = null;
let renderToken = 0;
let currentKind = null;
let currentItem = null;
let currentDomNodes = null;

let demoDataModulePromise = null;
function loadDemoDataModule(){
  if(!demoDataModulePromise){
    demoDataModulePromise = import('./modal/demoData.js').catch(err=>{
      console.warn('[modalV2] Demo-Daten konnten nicht geladen werden.', err);
      return { DEMO_MOVIE: null, DEMO_SERIES: null };
    });
  }
  return demoDataModulePromise;
}

function resolveRoot(){
  if(rootEl) return rootEl;
  const container = document.getElementById('modal-root-v2');
  if(!container) return null;
  overlayContainer = container;
  container.classList.add('modalv2-overlay');
  if(!container.hasAttribute('hidden')) container.setAttribute('hidden', '');
  if(!container.dataset.modalv2Ready){
    container.innerHTML = `
      <div class="modalv2-backdrop" data-modalv2-backdrop="1"></div>
      <div class="modalv2-dialog" role="dialog" aria-modal="true">
        <div class="modalv2-scroll" data-modalv2-scroll></div>
      </div>
    `;
    container.dataset.modalv2Ready = '1';
    container.addEventListener('click', onOverlayClick);
  }
  dialogEl = container.querySelector('.modalv2-dialog');
  if(dialogEl && !dialogEl.hasAttribute('tabindex')) dialogEl.setAttribute('tabindex', '-1');
  scrollContainer = container.querySelector('[data-modalv2-scroll]');
  if(scrollContainer && !rootEl){
    const existing = scrollContainer.querySelector('.modalv2');
    if(existing) rootEl = existing;
    else {
      rootEl = document.createElement('div');
      rootEl.className = 'modalv2';
      rootEl.setAttribute('hidden', '');
      scrollContainer.appendChild(rootEl);
    }
  }
  return rootEl;
}

function onOverlayClick(ev){
  if(!overlayContainer) return;
  const target = ev.target;
  if(target === overlayContainer || (target && target.dataset && target.dataset.modalv2Backdrop)){ closeModalV2(); }
}

function getFocusableElements(){
  if(!dialogEl) return [];
  const selectors = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
  return Array.from(dialogEl.querySelectorAll(selectors)).filter(el=>{
    if(el.hasAttribute('disabled')) return false;
    if(el.getAttribute('aria-hidden') === 'true') return false;
    if(el.hasAttribute('hidden')) return false;
    return el.offsetParent !== null;
  });
}

function bindFocusTrap(){
  if(!dialogEl) return;
  if(focusTrapHandler){ dialogEl.removeEventListener('keydown', focusTrapHandler); }
  focusTrapHandler = (ev)=>{
    if(ev.key !== 'Tab') return;
    const focusables = getFocusableElements();
    if(!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if(ev.shiftKey){
      if(document.activeElement === first){ ev.preventDefault(); last.focus(); }
    }else if(document.activeElement === last){
      ev.preventDefault(); first.focus();
    }
  };
  dialogEl.addEventListener('keydown', focusTrapHandler);
}

function unbindFocusTrap(){
  if(!dialogEl || !focusTrapHandler) return;
  dialogEl.removeEventListener('keydown', focusTrapHandler);
  focusTrapHandler = null;
}

function bindEscape(){
  if(escapeHandler) return;
  escapeHandler = (ev)=>{
    if(ev.key === 'Escape'){ ev.preventDefault(); closeModalV2(); }
  };
  window.addEventListener('keydown', escapeHandler);
}

function unbindEscape(){
  if(!escapeHandler) return;
  window.removeEventListener('keydown', escapeHandler);
  escapeHandler = null;
}

function showOverlay(){
  const root = resolveRoot();
  if(!root || !overlayContainer) return null;
  overlayContainer.hidden = false;
  overlayContainer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modalv2-open');
  if(scrollContainer) scrollContainer.scrollTop = 0;
  bindFocusTrap();
  bindEscape();

  return root;
}

function focusInitial(){
  if(!dialogEl) return;
  const closeBtn = dialogEl.querySelector('#action-close, #v2Close');
  const focusables = getFocusableElements();
  let target = (closeBtn && !closeBtn.hasAttribute('hidden')) ? closeBtn : focusables[0];
  if(!target) target = dialogEl;
  if(target){
    const focus = ()=>{
      try{ target.focus(); }
      catch(err){ console.warn('[modalV2] Failed to focus target element:', err?.message || err); }
    };
    (window.requestAnimationFrame || setTimeout)(focus, 0);
  }
}

function setTmdbStatus(rootOrPayload, maybePayload){
  let root = rootOrPayload;
  let payload = maybePayload;
  if(!(root instanceof HTMLElement)){
    payload = rootOrPayload;
    root = null;
  }
  const targetRoot = root instanceof HTMLElement ? root : rootEl;
  if(!targetRoot) return;
  const statusEl = targetRoot.querySelector('[data-head-status]');
  if(!statusEl) return;
  if(!payload){
    statusEl.hidden = true;
    statusEl.textContent = '';
    statusEl.dataset.state = '';
    return;
  }
  const { state='', message='' } = payload;
  statusEl.dataset.state = state || '';
  statusEl.textContent = message || '';
  statusEl.hidden = !message;
}

export function showModalV2Loading(message='Details werden geladen …'){
  const root = showOverlay();
  if(!root) return;
  root.hidden = false;
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'modalv2-loading';
  loadingDiv.textContent = String(message || 'Details werden geladen …');
  root.replaceChildren(loadingDiv);
}

export function renderModalV2(item){
  const root = showOverlay();
  if(!root) return;
  root.hidden = false;
  const hasSeasons = item?.type === 'tv';
  root.innerHTML = `
    <article class="v2-shell">
      <header class="v2-head" id="modal-head" data-tmdb-section>
        <div class="v2-head-visual" data-head-visual>
          <div class="v2-head-hero" data-head-hero>
            <div class="v2-head-backdrop" data-head-backdrop></div>
            <div class="v2-head-overlay-logo" data-head-overlay-logo hidden></div>
            <div class="v2-head-overlay-meta" data-head-overlay-meta hidden></div>
          </div>
          <div class="v2-head-logo" data-head-logo hidden></div>
        </div>
        <p class="v2-head-status" data-head-status hidden aria-live="polite" aria-atomic="true"></p>
        <div class="v2-titlebar">
          <div class="v2-title-wrap">
            <h2 class="v2-title" id="modal-title"></h2>
            <div class="v2-subline" id="modal-subline"></div>
            <div class="v2-meta" id="modal-meta"></div>
          </div>
          <div class="v2-actions" aria-label="Externe Aktionen">
            <button class="v2-icon-btn" id="action-close" type="button" aria-label="Schließen">
              <svg class="v2-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M6 6l12 12M6 18L18 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
              </svg>
            </button>
            <a class="v2-icon-btn" id="action-tmdb" target="_blank" rel="noopener noreferrer" aria-label="Auf TMDB öffnen" hidden>
              <svg class="v2-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M4 9h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"></path>
                <path d="M4 9V7a2 2 0 0 1 2-2h1l2 4 2-4 2 4 2-4h1a2 2 0 0 1 2 2v2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
            </a>
            <a class="v2-icon-btn" id="action-imdb" target="_blank" rel="noopener noreferrer" aria-label="Auf IMDb öffnen" hidden>
              <svg class="v2-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M12 4l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"></path>
              </svg>
            </a>
            <button class="v2-icon-btn" id="action-trailer" type="button" aria-label="Trailer abspielen" hidden>
              <svg class="v2-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M9 6l8 6-8 6V6z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="v2-chips" id="modal-chips" aria-label="Attribute"></div>
      </header>
      <div class="v2-body">
        <section class="v2-layout">
          <aside class="v2-side" id="modal-aside">
            <div class="v2-poster" id="modal-poster"><img id="modal-poster-img" alt=""></div>
            <div class="v2-facts" id="modal-quickfacts" aria-label="Schnellinfos" hidden>
              <h3 class="v2-facts-title">Schnellinfos</h3>
              <dl class="v2-facts-list" id="modal-quickfacts-list"></dl>
            </div>
          </aside>
          <main class="v2-info" id="modal-main">
            <nav class="v2-tabs" aria-label="Details Navigation" role="tablist">
              <button type="button" data-t="overview" class="active" id="tab-overview" role="tab" aria-controls="pane-overview" aria-selected="true">Überblick</button>
              <button type="button" data-t="details" id="tab-details" role="tab" aria-controls="pane-details" aria-selected="false">Details</button>
              ${hasSeasons ? '<button type="button" data-t="seasons" id="tab-seasons" role="tab" aria-controls="pane-seasons" aria-selected="false">Staffeln</button>' : ''}
              <button type="button" data-t="cast" id="tab-cast" role="tab" aria-controls="pane-cast" aria-selected="false">Cast</button>
            </nav>
            <section class="v2-body" id="modal-panes">
              <div class="v2-pane v2-overview" data-pane="overview" id="pane-overview" role="tabpanel" aria-labelledby="tab-overview"></div>
              <div class="v2-pane v2-details" data-pane="details" id="pane-details" role="tabpanel" aria-labelledby="tab-details" hidden></div>
              ${hasSeasons ? '<div class="v2-pane v2-seasons" data-pane="seasons" id="pane-seasons" role="tabpanel" aria-labelledby="tab-seasons" hidden></div>' : ''}
              <div class="v2-pane v2-cast" data-pane="cast" id="pane-cast" role="tabpanel" aria-labelledby="tab-cast" hidden></div>
            </section>
            <footer class="v2-footer" id="modal-footer" aria-label="Produktionslogos & Attribution" hidden>
              <div class="v2-footer-logos" id="modal-footer-logos" aria-label="Produktionsfirmen und Netzwerke"></div>
              <p class="v2-footer-note" id="modal-footer-note"></p>
            </footer>
          </main>
        </section>
      </div>
    </article>
  `;

  const dom = {
    head: {
      root: root.querySelector('#modal-head'),
      title: root.querySelector('#modal-title'),
      subline: root.querySelector('#modal-subline'),
      meta: root.querySelector('#modal-meta'),
      chips: root.querySelector('#modal-chips'),
      footer: root.querySelector('#modal-footer'),
      footerLogos: root.querySelector('#modal-footer-logos'),
      footerNote: root.querySelector('#modal-footer-note'),
    },
    poster: {
      posterImage: root.querySelector('#modal-poster-img'),
      quickFacts: root.querySelector('#modal-quickfacts'),
      quickFactsList: root.querySelector('#modal-quickfacts-list'),
    },
    panes: {
      overview: root.querySelector('#pane-overview'),
      details: root.querySelector('#pane-details'),
      seasons: root.querySelector('#pane-seasons'),
      cast: root.querySelector('#pane-cast'),
    },
    actions: {
      close: root.querySelector('#action-close'),
      tmdb: root.querySelector('#action-tmdb'),
      imdb: root.querySelector('#action-imdb'),
      trailer: root.querySelector('#action-trailer'),
    },
  };

  currentDomNodes = dom;

  renderHeader(dom.head, item);
  fillPosterAndQuickfacts(dom.poster, item);
  setExternalLinks(root, item);
  renderOverview(dom.panes.overview, item);
  renderDetails(dom.panes.details, item);
  if(hasSeasons){ updateSeasons(root, item); }
  renderCast(dom.panes.cast, buildCastList(item));
  setCastLoading(dom.panes.cast, false);
  setCastStatus(dom.panes.cast, null);
  setTmdbStatus(root, null);
  applyTabs(root);
  const closeBtn = dom.actions.close;
  if(closeBtn){
    closeBtn.addEventListener('click', closeModalV2);
  }
  if(dialogEl){
    const titleId = dom.head?.title?.id || 'modal-title';
    dialogEl.setAttribute('aria-labelledby', titleId);
  }
  focusInitial();
}

function refreshModalSections(item){
  if(!rootEl || !currentDomNodes) return;
  renderHeader(currentDomNodes.head, item);
  fillPosterAndQuickfacts(currentDomNodes.poster, item);
  setExternalLinks(rootEl, item);
  renderOverview(currentDomNodes.panes.overview, item);
  renderDetails(currentDomNodes.panes.details, item);
  if(item?.type === 'tv' && currentDomNodes.panes.seasons){ updateSeasons(rootEl, item); }
  renderCast(currentDomNodes.panes.cast, buildCastList(item));
}

function maybeStartTmdbEnrichment(kind, item, tokenSnapshot){
  if(!shouldUseTmdbEnrichment(item)) return;
  if(item?.tmdbDetail){
    refreshModalSections(item);
    return;
  }
  const tmdbId = resolveTmdbId(item);
  if(!tmdbId) return;
  const activeToken = tokenSnapshot ?? renderToken;
  setTmdbStatus({ state: 'loading', message: 'TMDB-Daten werden geladen …' });
  const castTarget = currentDomNodes?.panes?.cast || rootEl;
  setCastLoading(castTarget, true);
  setCastStatus(castTarget, { state: 'loading', message: 'Cast wird angereichert …' });
  const fetcher = kind === 'tv' ? getTvEnriched : getMovieEnriched;
  fetcher(tmdbId).then(detail => {
    if(activeToken !== renderToken) return;
    if(!detail){
      setTmdbStatus({ state: 'error', message: 'Keine zusätzlichen TMDB-Daten gefunden.' });
      const target = currentDomNodes?.panes?.cast || rootEl;
      setCastLoading(target, false);
      setCastStatus(target, null);
      return;
    }
    const enriched = attachTmdbDetail(item, detail);
    if(enriched){
      currentItem = enriched;
      refreshModalSections(enriched);
    }
    setTmdbStatus(null);
    const target = currentDomNodes?.panes?.cast || rootEl;
    setCastLoading(target, false);
    setCastStatus(target, null);
  }).catch(err => {
    if(activeToken !== renderToken) return;
    console.warn('[modalV2] Failed to enrich modal with TMDB data:', err?.message || err);
    // Provide more specific error messages based on error type
    let errorMessage = 'TMDB-Daten konnten nicht geladen werden.';
    if(err?.status === 429){
      errorMessage = 'TMDB-Rate-Limit erreicht. Bitte versuchen Sie es später erneut.';
    }else if(err?.status === 404){
      errorMessage = 'Inhalt nicht in TMDB gefunden.';
    }else if(err?.message?.includes('network') || err?.message?.includes('fetch')){
      errorMessage = 'Netzwerkfehler. Bitte überprüfen Sie Ihre Verbindung.';
    }
    setTmdbStatus({ state: 'error', message: errorMessage });
    const target = currentDomNodes?.panes?.cast || rootEl;
    setCastLoading(target, false);
    setCastStatus(target, { state: 'error', message: 'Zusätzliche Besetzung konnte nicht geladen werden.' });
  });
}

function shouldUseTmdbEnrichment(item){
  if(!item) return false;
  if(!window?.FEATURES?.tmdbEnrichment) return false;
  if(!hasTmdbCredentials()) return false;
  if(!resolveTmdbId(item)) return false;
  return true;
}

function hasTmdbCredentials(){
  try{
    const stored = localStorage.getItem('tmdbToken');
    if(stored && stored.trim()) return true;
  }catch(err){
    console.warn('[modalV2] Unable to read TMDB credentials from storage:', err?.message || err);
  }
  const cfg = getState().cfg || {};
  return !!(cfg.tmdbToken || cfg.tmdbApiKey);
}

function resolveTmdbId(item){
  if(!item) return '';
  const ids = item.ids || {};
  return ids.tmdb || item.tmdbId || item?.tmdb?.id || '';
}

function attachTmdbDetail(item, detail){
  if(!item || !detail) return item;
  // Create a shallow clone to avoid mutating the original
  const enriched = { ...item };
  enriched.tmdbDetail = detail;
  enriched.tmdb = { ...(item.tmdb || {}) };
  if(detail.poster && !enriched.tmdb.poster) enriched.tmdb.poster = detail.poster;
  if(detail.backdrop && !enriched.tmdb.backdrop) enriched.tmdb.backdrop = detail.backdrop;
  if(detail.url) enriched.tmdb.url = detail.url;
  enriched.ids = { ...(item.ids || {}) };
  if(detail.id) enriched.ids.tmdb = String(detail.id);
  if(detail.imdbId && !enriched.ids.imdb) enriched.ids.imdb = String(detail.imdbId);
  return enriched;
}

export async function openMovieModalV2(idOrData){
  const token = ++renderToken;
  lastActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const root = showOverlay();
  if(!root) return;
  const data = await resolveMovieData(idOrData);
  if(token !== renderToken) return;
  if(!data){
    root.hidden = false;
    const errorDiv = document.createElement('div');
    errorDiv.className = 'modalv2-loading';
    errorDiv.textContent = 'Film konnte nicht geladen werden.';
    root.replaceChildren(errorDiv);
    currentItem = null;
    currentKind = null;
    focusInitial();
    return;
  }
  currentItem = data;
  currentKind = 'movie';
  renderModalV2(data);
  maybeStartTmdbEnrichment('movie', data, token);
}

export async function openSeriesModalV2(idOrData){
  const token = ++renderToken;
  lastActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const base = await resolveSeriesData(idOrData);
  const root = showOverlay();
  if(!root) return;
  if(token !== renderToken) return;
  if(!base){
    root.hidden = false;
    const errorDiv = document.createElement('div');
    errorDiv.className = 'modalv2-loading';
    errorDiv.textContent = 'Seriendetails konnten nicht geladen werden.';
    root.replaceChildren(errorDiv);
    currentItem = null;
    currentKind = null;
    focusInitial();
    return;
  }
  currentItem = base;
  currentKind = 'show';
  let working = base;
  if(needsShowDetail(working)){
    showModalV2Loading();
    if(token !== renderToken) return;
    let detail = null;
    try{ detail = await loadShowDetail(working); }
    catch(err){
      detail = null;
      console.warn('[modalV2] Failed to load show detail in modal:', err?.message || err);
    }
    if(token !== renderToken) return;
    if(detail){ mergeShowDetail(working, detail); currentItem = working; }
  }
  if(token !== renderToken) return;
  renderModalV2(working);
  maybeStartTmdbEnrichment('tv', working, token);
}

export function closeModalV2(){
  renderToken++;
  if(!overlayContainer) return;
  overlayContainer.hidden = true;
  overlayContainer.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modalv2-open');
  unbindFocusTrap();
  unbindEscape();
  if(rootEl){
    rootEl.innerHTML = '';
    rootEl.setAttribute('hidden', '');
  }
  if(scrollContainer) scrollContainer.scrollTop = 0;
  if(lastActiveElement && typeof lastActiveElement.focus === 'function'){
    try{ lastActiveElement.focus(); }
    catch(err){ console.warn('[modalV2] Failed to restore focus to last active element:', err?.message || err); }
  }
  lastActiveElement = null;
  currentItem = null;
  currentKind = null;
  currentDomNodes = null;
}

export function isModalV2Open(){
  return Boolean(overlayContainer && !overlayContainer.hidden);
}

export function getModalV2Context(){
  return currentItem ? { item: currentItem, kind: currentKind } : { item: null, kind: null };
}

async function resolveMovieData(idOrData){
  if(idOrData === 'demo'){
    const { DEMO_MOVIE } = await loadDemoDataModule();
    return mapMovie(DEMO_MOVIE);
  }
  if(idOrData && typeof idOrData === 'object') return mapMovie(idOrData);
  const str = idOrData == null ? '' : String(idOrData).trim();
  if(!str) return null;
  const state = getState();
  const movies = Array.isArray(state?.movies) ? state.movies : [];
  const match = movies.find(movie => matchesIdentifier(movie, str));
  return match ? mapMovie(match) : null;
}

async function resolveSeriesData(idOrData){
  if(idOrData === 'demo'){
    const { DEMO_SERIES } = await loadDemoDataModule();
    return mapShow(DEMO_SERIES);
  }
  if(idOrData && typeof idOrData === 'object') return mapShow(idOrData);
  const str = idOrData == null ? '' : String(idOrData).trim();
  if(!str) return null;
  const state = getState();
  const shows = Array.isArray(state?.shows) ? state.shows : [];
  const match = shows.find(show => matchesIdentifier(show, str));
  return match ? mapShow(match) : null;
}

function matchesIdentifier(item, id){
  if(!item) return false;
  const str = String(id || '').trim();
  if(!str) return false;
  if(item?.ids?.imdb && String(item.ids.imdb) === str) return true;
  if(item?.ids?.tmdb && String(item.ids.tmdb) === str) return true;
  if(item?.ratingKey != null && String(item.ratingKey) === str) return true;
  return false;
}
