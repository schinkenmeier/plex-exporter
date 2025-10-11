import { openShell, closeShell, getShell, focusInitial } from './shell.js';
import { startRender, isCurrentRender, cancelRender, clearActiveItem, captureLastFocused, restoreLastFocused, setActiveItem, getActiveItem } from './state.js';

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
