import { openShell, closeShell, getShell, focusInitial } from './shell.js';
import { startRender, isCurrentRender, cancelRender, clearActiveItem, captureLastFocused, restoreLastFocused, setActiveItem, getActiveItem } from './state.js';
import { createHead, createPosterCard } from './header.js';
import { renderOverview } from './overview.js';
import { renderDetails } from './details.js';
import { renderCast } from './cast.js';
import { applyTabs } from './tabs.js';

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

function isViewModelCandidate(content){
  if(!content || typeof content !== 'object' || Array.isArray(content)) return false;
  if(!Array.isArray(content.tabs)) return false;
  return typeof content.kind === 'string' || typeof content.title === 'string';
}

function createPaneStack(viewModel){
  if(typeof document === 'undefined') return null;
  const article = document.createElement('article');
  article.className = 'v3-shell';
  article.dataset.modalv3Shell = '1';

  const head = createHead(viewModel);
  const headRoot = head?.root || null;
  if(headRoot) article.appendChild(headRoot);

  const body = document.createElement('div');
  body.className = 'v3-shell__body';
  const columns = document.createElement('div');
  columns.className = 'v3-shell-columns';

  const aside = document.createElement('aside');
  aside.className = 'v3-shell-aside';
  const poster = createPosterCard(viewModel);
  const posterRoot = poster?.root || null;
  if(posterRoot) aside.appendChild(posterRoot);

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

  columns.append(aside, main);
  body.append(columns);
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
  if(target === overlay || (target && target.dataset && target.dataset.modalv2Backdrop)){
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
  loading.className = 'modalv2-loading';
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

  let didBuildView = false;
  if(isViewModelCandidate(content)){
    const view = createPaneStack(content);
    if(view?.root){
      content = view.root;
      didBuildView = true;
    }
  }

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

  if(didBuildView || root.querySelector('.v3-tabs')){
    applyTabs(root);
  }

  focusInitial();
  return root;
}

export function openMovieDetailV3(payload = null){
  captureLastFocused();
  const token = startRender('movie', payload);
  showLoading();
  return token;
}

export function openSeriesDetailV3(payload = null){
  captureLastFocused();
  const token = startRender('show', payload);
  showLoading();
  return token;
}

export function closeDetailV3(){
  cancelRender();
  closeShell();
  restoreLastFocused();
  clearActiveItem();
}

export { closeDetailV3 as hideDetailV3 };
