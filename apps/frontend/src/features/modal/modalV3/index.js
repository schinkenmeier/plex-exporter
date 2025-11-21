import { openShell, closeShell, getShell, focusInitial } from './shell.js';
import { startRender, isCurrentRender, cancelRender, clearActiveItem, captureLastFocused, restoreLastFocused, setActiveItem, getActiveItem } from './state.js';
import { createHead, createPosterCard } from './header.js';
import { renderOverview } from './overview.js';
import { renderDetails } from './details.js';
import { renderCast } from './cast.js';
import { renderSeasons } from './seasons.js';
import { applyTabs } from './tabs.js';
import { getState as getAppState } from '../../../core/state.js';
import { loadMovies, loadShows, loadShowDetail } from '../../../js/data.js';
import { buildMovieViewModel, buildSeriesViewModel } from './viewModel.js';

function normalizeTabId(rawId, index){
  const fallback = `tab-${index + 1}`;
  if(rawId == null) return fallback;
  const str = String(rawId).trim();
  if(!str) return fallback;
  return str;
}

function normalizeTabLabel(rawLabel, fallback){
  if(rawLabel == null) return fallback;
  const str = String(rawLabel).trim();
  return str || fallback;
}

const LOG_PREFIX = '[modalV3]';
let moviesCache = null;
let showsCache = null;

function isViewModelCandidate(content){
  if(!content || typeof content !== 'object' || Array.isArray(content)) return false;
  if(!Array.isArray(content.tabs)) return false;
  return typeof content.kind === 'string' || typeof content.title === 'string';
}

function matchesIdentifier(item, rawId){
  if(!item) return false;
  const str = rawId == null ? '' : String(rawId).trim();
  if(!str) return false;
  const ids = item?.ids && typeof item.ids === 'object'
    ? Object.entries(item.ids)
    : [];
  for(const [key, value] of ids){
    if(key === 'tmdb' || key === 'themoviedb') continue;
    if(value != null && String(value).trim() === str) return true;
  }
  if(item?.ratingKey != null && String(item.ratingKey) === str) return true;
  if(item?.rating_key != null && String(item.rating_key) === str) return true;
  if(item?.id != null && String(item.id) === str) return true;
  return false;
}

async function ensureMovies(){
  if(Array.isArray(moviesCache)) return moviesCache;
  try{
    moviesCache = await loadMovies();
  }catch(err){
    moviesCache = [];
    console.warn(LOG_PREFIX, 'Failed to load movie library for detail view:', err?.message || err);
  }
  return moviesCache;
}

async function ensureShows(){
  if(Array.isArray(showsCache)) return showsCache;
  try{
    showsCache = await loadShows();
  }catch(err){
    showsCache = [];
    console.warn(LOG_PREFIX, 'Failed to load show library for detail view:', err?.message || err);
  }
  return showsCache;
}

function findInList(list, id){
  if(!Array.isArray(list) || !list.length) return null;
  return list.find(entry => matchesIdentifier(entry, id)) || null;
}

async function resolveMoviePayload(input){
  if(input && typeof input === 'object'){
    if(input.item || input.movie) return { item: input.item || input.movie };
    return { item: input };
  }
  const id = input == null ? '' : String(input).trim();
  if(!id) return null;
  const state = getAppState();
  let match = findInList(state?.movies, id);
  if(!match){
    const library = await ensureMovies();
    match = findInList(library, id);
  }
  return match ? { item: match } : null;
}

async function resolveSeriesPayload(input){
  if(input && typeof input === 'object'){
    const base = input.item || input.show || input.media || input;
    let detail = input.detail || input.showDetail || null;
    if(base && !detail){
      try{
        detail = await loadShowDetail(base);
      }catch(err){
        console.warn(LOG_PREFIX, 'Failed to load series payload detail:', err?.message || err);
      }
    }
    return { item: base, detail: detail || null };
  }
  const id = input == null ? '' : String(input).trim();
  if(!id) return null;
  const state = getAppState();
  let match = findInList(state?.shows, id);
  if(!match){
    const library = await ensureShows();
    match = findInList(library, id);
  }
  if(!match) return null;
  let detail = null;
  try{
    detail = await loadShowDetail(match);
  }catch(err){
    console.warn(LOG_PREFIX, 'Failed to load show detail payload for', id, err?.message || err);
  }
  return { item: match, detail: detail || null };
}

async function loadMovieDetailViewModel(payload, options = {}){
  const resolved = await resolveMoviePayload(payload);
  if(!resolved || !resolved.item) return null;
  try{
    return await buildMovieViewModel(resolved, options);
  }catch(err){
    console.warn(LOG_PREFIX, 'Failed to build movie view model:', err?.message || err);
    return null;
  }
}

async function loadSeriesDetailViewModel(payload, options = {}){
  const resolved = await resolveSeriesPayload(payload);
  if(!resolved || !resolved.item) return null;
  try{
    return await buildSeriesViewModel({ ...resolved, detail: resolved.detail }, options);
  }catch(err){
    console.warn(LOG_PREFIX, 'Failed to build series view model:', err?.message || err);
    return null;
  }
}

function createPaneStack(viewModel){
  if(typeof document === 'undefined') return null;
  const article = document.createElement('article');
  article.className = 'v3-shell';
  article.dataset.modalv3Shell = '1';

  const head = createHead(viewModel);
  const headRoot = head?.root || null;
  const closeButton = head?.elements?.close || headRoot?.querySelector('#action-close');
  if(closeButton){
    closeButton.hidden = false;
    closeButton.removeAttribute('hidden');
    closeButton.addEventListener('click', closeDetailV3);
  }
  const poster = createPosterCard(viewModel);
  const posterRoot = poster?.root || null;
  const posterSlot = headRoot?.querySelector('[data-v3-head-poster-slot]');
  if(posterSlot && posterRoot){
    posterSlot.appendChild(posterRoot);
  }else if(headRoot && posterRoot){
    headRoot.appendChild(posterRoot);
  }

  if(headRoot) article.appendChild(headRoot);

  const body = document.createElement('div');
  body.className = 'v3-shell__body';

  const main = document.createElement('div');
  main.className = 'v3-shell-main';
  const tabs = document.createElement('div');
  tabs.className = 'v3-tabs';
  tabs.dataset.v3Tabs = '1';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Detailbereiche');
  const stack = document.createElement('div');
  stack.className = 'v3-pane-stack';
  main.append(tabs, stack);

  body.append(main);
  article.appendChild(body);

  const tabEntries = Array.isArray(viewModel?.tabs) && viewModel.tabs.length ? viewModel.tabs : [{ id: 'overview', label: 'Überblick' }];
  const defaultTab = viewModel?.defaultTab || tabEntries[0]?.id || 'overview';
  const paneMap = new Map();

  tabEntries.forEach((tab, index) => {
    const id = normalizeTabId(tab?.id, index);
    const label = normalizeTabLabel(tab?.label, id);
    const button = document.createElement('button');
    button.className = 'v3-tab';
    button.dataset.tab = id;
    const tabId = `v3-tab-${id}`;
    const paneId = `v3-pane-${id}`;
    button.id = tabId;
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', paneId);
    const isDefault = id === defaultTab || (!defaultTab && index === 0);
    button.setAttribute('aria-selected', isDefault ? 'true' : 'false');
    button.classList.toggle('active', isDefault);
    button.tabIndex = isDefault ? 0 : -1;
    button.textContent = label;
    tabs.appendChild(button);

    const panel = document.createElement('section');
    panel.className = 'v3-pane';
    panel.dataset.pane = id;
    panel.id = paneId;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tabId);
    panel.hidden = !isDefault;
    panel.setAttribute('aria-hidden', isDefault ? 'false' : 'true');

    const paneTitle = document.createElement('h2');
    paneTitle.className = 'v3-pane__title';
    paneTitle.textContent = label;
    const paneContent = document.createElement('div');
    paneContent.className = 'v3-pane__content';
    panel.append(paneTitle, paneContent);
    stack.appendChild(panel);

    paneMap.set(id, { tab: button, panel, content: paneContent });
  });

  if(paneMap.has('overview')){
    renderOverview(paneMap.get('overview').content, viewModel);
  }
  if(paneMap.has('details')){
    renderDetails(paneMap.get('details').content, viewModel);
  }
  if(paneMap.has('cast')){
    renderCast(paneMap.get('cast').content, viewModel);
  }
  if(paneMap.has('seasons')){
    renderSeasons(paneMap.get('seasons').content, viewModel);
  }

  paneMap.forEach((entry, id) => {
    if(id === 'overview' || id === 'details') return;
    if(entry.content.childElementCount > 0) return;
    const fallback = document.createElement('p');
    fallback.textContent = 'Inhalt folgt …';
    entry.panel.classList.add('v3-pane--muted');
    entry.content.appendChild(fallback);
  });

  return { root: article, tabs, paneMap };
}

function ensureOverlayListeners(){
  const shell = getShell();
  if(!shell) return;
  const { overlay } = shell;
  if(overlay && !overlay.dataset.modalv3Click){
    overlay.addEventListener('click', onOverlayClick);
    overlay.dataset.modalv3Click = '1';
  }
}

function onOverlayClick(ev){
  const shell = getShell();
  if(!shell) return;
  const { overlay } = shell;
  const target = ev.target;
  if(target === overlay || (target && target.classList && target.classList.contains('modalv3-backdrop'))){
    closeDetailV3();
  }
}

export function showLoading(message = 'Details werden geladen …'){
  ensureOverlayListeners();
  const shell = openShell({ onRequestClose: closeDetailV3 });
  if(!shell) return null;
  const { root } = shell;
  if(!root) return null;
  root.hidden = false;
  root.removeAttribute('hidden');
  const loading = document.createElement('div');
  loading.className = 'modalv3-loading';
  loading.textContent = String(message || 'Details werden geladen …');
  root.replaceChildren(loading);
  focusInitial();
  return root;
}

function resolveNodes(content){
  if(content == null) return [];
  const nodeCtor = typeof Node !== 'undefined' ? Node : null;
  if(nodeCtor && content instanceof nodeCtor){
    return [content];
  }
  if(Array.isArray(content)){
    const nodes = [];
    for(const item of content){
      if(nodeCtor && item instanceof nodeCtor){
        nodes.push(item);
      }
    }
    return nodes;
  }
  return null;
}

function resolveTargetElement(target){
  const elementCtor = typeof HTMLElement !== 'undefined' ? HTMLElement : null;
  if(!target) return null;
  if(elementCtor && target instanceof elementCtor) return target;
  if(typeof target === 'string' && typeof document !== 'undefined'){
    try{ return document.querySelector(target); }
    catch(err){ console.warn(LOG_PREFIX, 'Failed to query target element:', err?.message || err); }
  }
  if(elementCtor && target.root instanceof elementCtor) return target.root;
  if(elementCtor && target.content instanceof elementCtor) return target.content;
  return null;
}

export function renderMediaDetail(target, viewModel, options = {}){
  if(!isViewModelCandidate(viewModel)) return null;
  const container = resolveTargetElement(target);
  if(!container) return null;
  const { layout = 'modal', replace = true, className, onRendered } = options || {};
  const view = createPaneStack(viewModel);
  if(!view?.root) return null;
  view.root.hidden = false;
  view.root.removeAttribute('hidden');
  if(layout === 'standalone'){
    view.root.classList.add('v3-shell--standalone');
  }
  if(className){
    const classes = Array.isArray(className) ? className : String(className).split(/\s+/);
    classes.filter(Boolean).forEach(cls => view.root.classList.add(cls));
  }
  if(replace){
    container.replaceChildren(view.root);
  }else{
    container.appendChild(view.root);
  }
  applyTabs(view.root);
  if(typeof onRendered === 'function'){
    try{ onRendered(view); }
    catch(err){ console.warn(LOG_PREFIX, 'renderMediaDetail onRendered failed:', err?.message || err); }
  }
  return view;
}

export function renderDetail(content, options = {}){
  const { token, media, kind } = options || {};
  if(token && !isCurrentRender(token)) return null;
  if(kind != null || media != null){
    const current = getActiveItem();
    const resolvedKind = kind != null ? kind : current.kind;
    const resolvedMedia = media != null ? media : current.item;
    setActiveItem(resolvedKind, resolvedMedia);
  }
  ensureOverlayListeners();
  const shell = openShell({ onRequestClose: closeDetailV3 });
  if(!shell) return null;
  const { root } = shell;
  if(!root) return null;
  root.hidden = false;
  root.removeAttribute('hidden');

  let handledByViewModel = false;
  if(isViewModelCandidate(content)){
    const rendered = renderMediaDetail(root, content, { replace: true, layout: 'modal' });
    handledByViewModel = Boolean(rendered);
  }

  if(!handledByViewModel){
    const nodes = resolveNodes(content);
    if(nodes){
      root.replaceChildren(...nodes);
    }else if(typeof content === 'string'){
      root.innerHTML = content;
    }else if(content != null){
      root.textContent = String(content);
    }else{
      root.innerHTML = '';
    }

    if(root.querySelector('.v3-tabs')){
      applyTabs(root);
    }
  }

  focusInitial();
  return root;
}

function renderDetailError(message, options = {}){
  const root = renderDetail(String(message || 'Details konnten nicht geladen werden.'), options);
  clearActiveItem();
  return root;
}

export async function openMovieDetailV3(payload = null, options = {}){
  console.log(LOG_PREFIX, 'openMovieDetailV3 called with payload:', payload);
  captureLastFocused();
  const token = startRender('movie', payload);
  showLoading();
  try{
    const viewModel = await loadMovieDetailViewModel(payload, options);
    console.log(LOG_PREFIX, 'Movie ViewModel loaded:', viewModel);
    if(!isCurrentRender(token)) return token;
    if(!viewModel){
      renderDetailError('Film konnte nicht geladen werden.', { token });
      return token;
    }
    console.log(LOG_PREFIX, 'Movie backdrop:', viewModel.backdrop);
    console.log(LOG_PREFIX, 'Movie cast count:', viewModel.cast?.length || 0);
    renderDetail(viewModel, { token, kind: 'movie', media: viewModel.item });
  }catch(err){
    console.warn(LOG_PREFIX, 'Failed to open movie detail:', err?.message || err);
    if(isCurrentRender(token)){
      renderDetailError('Film konnte nicht geladen werden.', { token });
    }
  }
  return token;
}

export async function openSeriesDetailV3(payload = null, options = {}){
  console.log(LOG_PREFIX, 'openSeriesDetailV3 called with payload:', payload);
  captureLastFocused();
  const token = startRender('show', payload);
  showLoading();
  try{
    const viewModel = await loadSeriesDetailViewModel(payload, options);
    console.log(LOG_PREFIX, 'Series ViewModel loaded:', viewModel);
    if(!isCurrentRender(token)) return token;
    if(!viewModel){
      renderDetailError('Seriendetails konnten nicht geladen werden.', { token });
      return token;
    }
    console.log(LOG_PREFIX, 'Series backdrop:', viewModel.backdrop);
    console.log(LOG_PREFIX, 'Series cast count:', viewModel.cast?.length || 0);
    renderDetail(viewModel, { token, kind: 'show', media: viewModel.item });
  }catch(err){
    console.warn(LOG_PREFIX, 'Failed to open series detail:', err?.message || err);
    if(isCurrentRender(token)){
      renderDetailError('Seriendetails konnten nicht geladen werden.', { token });
    }
  }
  return token;
}

export function closeDetailV3(){
  cancelRender();
  closeShell();
  restoreLastFocused();
  clearActiveItem();
  resetDetailHash();
}

function resetDetailHash(){
  if(typeof window === 'undefined') return;
  const currentHash = window.location.hash || '';
  if(!/^#\/(movie|show)\//.test(currentHash)) return;
  const state = getAppState();
  const view = state?.view === 'shows' ? '#/shows' : '#/movies';
  const fallbackHash = view || '#/movies';
  if(currentHash === fallbackHash) return;
  try{
    if(window.history && typeof window.history.replaceState === 'function'){
      window.history.replaceState(null, '', fallbackHash);
    }else if(window.location.hash !== fallbackHash){
      window.location.hash = fallbackHash;
    }
  }catch(err){
    console.warn(`${LOG_PREFIX} Failed to reset hash after closing detail:`, err?.message || err);
  }
}

export { closeDetailV3 as hideDetailV3 };
export { loadMovieDetailViewModel, loadSeriesDetailViewModel };
