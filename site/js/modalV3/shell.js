import { bindFocusTrap, unbindFocusTrap, bindEscape, unbindEscape, focusInitial as focusDialog, getFocusableElements } from './focusTrap.js';

let overlayContainer = null;
let dialogEl = null;
let scrollContainer = null;
let backdropEl = null;
let rootEl = null;

function ensureContainer(){
  if(typeof document === 'undefined') return null;
  if(overlayContainer) return overlayContainer;
  const container = document.getElementById('modal-root-v2');
  if(!container) return null;
  overlayContainer = container;
  container.classList.add('modalv2-overlay');
  if(!container.hasAttribute('hidden')) container.setAttribute('hidden', '');
  if(!container.hasAttribute('aria-hidden')) container.setAttribute('aria-hidden', 'true');
  container.dataset.modalv3Ready = '1';

  if(!container.querySelector('.modalv2-dialog')){
    container.innerHTML = `
      <div class="modalv2-backdrop" data-modalv2-backdrop="1"></div>
      <div class="modalv2-dialog" role="dialog" aria-modal="true">
        <div class="modalv2-scroll" data-modalv2-scroll></div>
      </div>
    `;
  }

  dialogEl = container.querySelector('.modalv2-dialog');
  if(dialogEl && !dialogEl.hasAttribute('tabindex')) dialogEl.setAttribute('tabindex', '-1');
  scrollContainer = container.querySelector('[data-modalv2-scroll]');
  backdropEl = container.querySelector('[data-modalv2-backdrop]');

  if(scrollContainer){
    rootEl = scrollContainer.querySelector('[data-modalv3-root]');
    if(!rootEl){
      rootEl = document.createElement('div');
      rootEl.dataset.modalv3Root = '1';
      rootEl.className = 'modalv3';
      rootEl.setAttribute('hidden', '');
      scrollContainer.appendChild(rootEl);
    }
  }

  return overlayContainer;
}

function ensureShell(){
  const container = ensureContainer();
  if(!container || !dialogEl || !rootEl) return null;
  return { overlay: container, dialog: dialogEl, scroll: scrollContainer, backdrop: backdropEl, root: rootEl };
}

export function openShell({ onRequestClose } = {}){
  const shell = ensureShell();
  if(!shell) return null;
  const { overlay, scroll, dialog } = shell;
  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');
  if(typeof document !== 'undefined' && document.body){
    document.body.classList.add('modalv2-open');
  }
  if(scroll) scroll.scrollTop = 0;
  bindFocusTrap(dialog);
  bindEscape(onRequestClose);
  return shell;
}

export function closeShell(){
  if(!overlayContainer) return;
  overlayContainer.hidden = true;
  overlayContainer.setAttribute('aria-hidden', 'true');
  if(typeof document !== 'undefined' && document.body){
    document.body.classList.remove('modalv2-open');
  }
  unbindFocusTrap();
  unbindEscape();
  if(rootEl){
    rootEl.innerHTML = '';
    rootEl.setAttribute('hidden', '');
  }
  if(scrollContainer) scrollContainer.scrollTop = 0;
}

export function getShell(){
  return ensureShell();
}

export function focusInitial(){
  if(!dialogEl) return;
  focusDialog(dialogEl);
}

export function getRoot(){
  const shell = ensureShell();
  return shell ? shell.root : null;
}

export function getOverlay(){
  const shell = ensureShell();
  return shell ? shell.overlay : null;
}

export function getBackdrop(){
  const shell = ensureShell();
  return shell ? shell.backdrop : null;
}

export function getDialog(){
  const shell = ensureShell();
  return shell ? shell.dialog : null;
}

export function clearContent(){
  if(rootEl){
    rootEl.innerHTML = '';
  }
}

export function getFocusable(){
  if(!dialogEl) return [];
  return getFocusableElements(dialogEl);
}
