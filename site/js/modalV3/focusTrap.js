const selectors = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

let boundDialog = null;
let focusTrapHandler = null;
let escapeHandler = null;
let escapeCallback = null;

function isElementVisible(el){
  if(!el) return false;
  if(el.hasAttribute('disabled')) return false;
  if(el.getAttribute('aria-hidden') === 'true') return false;
  if(el.hasAttribute('hidden')) return false;
  if(el.offsetParent === null) return false;
  return true;
}

export function getFocusableElements(container){
  const elementCtor = typeof HTMLElement !== 'undefined' ? HTMLElement : null;
  if(!elementCtor || !(container instanceof elementCtor)) return [];
  return Array.from(container.querySelectorAll(selectors)).filter(isElementVisible);
}

export function bindFocusTrap(container){
  const elementCtor = typeof HTMLElement !== 'undefined' ? HTMLElement : null;
  if(!elementCtor || !(container instanceof elementCtor)) return;
  if(boundDialog && focusTrapHandler){
    boundDialog.removeEventListener('keydown', focusTrapHandler);
  }
  const handler = (ev)=>{
    if(ev.key !== 'Tab') return;
    const focusables = getFocusableElements(container);
    if(!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    if(ev.shiftKey){
      if(active === first){
        ev.preventDefault();
        last.focus();
      }
      return;
    }
    if(active === last){
      ev.preventDefault();
      first.focus();
    }
  };
  container.addEventListener('keydown', handler);
  boundDialog = container;
  focusTrapHandler = handler;
}

export function unbindFocusTrap(){
  if(boundDialog && focusTrapHandler){
    boundDialog.removeEventListener('keydown', focusTrapHandler);
  }
  boundDialog = null;
  focusTrapHandler = null;
}

export function bindEscape(callback){
  if(typeof window === 'undefined') return;
  if(escapeHandler){
    window.removeEventListener('keydown', escapeHandler);
  }
  escapeCallback = typeof callback === 'function' ? callback : null;
  const handler = (ev)=>{
    if(ev.key !== 'Escape') return;
    ev.preventDefault();
    if(escapeCallback){
      try{ escapeCallback(ev); }
      catch(err){ console.warn('[modalV3] Failed to handle escape key:', err?.message || err); }
    }
  };
  escapeHandler = handler;
  window.addEventListener('keydown', handler);
}

export function unbindEscape(){
  if(typeof window === 'undefined') return;
  if(escapeHandler){
    window.removeEventListener('keydown', escapeHandler);
  }
  escapeHandler = null;
  escapeCallback = null;
}

export function focusInitial(container){
  const elementCtor = typeof HTMLElement !== 'undefined' ? HTMLElement : null;
  if(!elementCtor || !(container instanceof elementCtor)) return;
  const closeBtn = container.querySelector('#action-close');
  const focusables = getFocusableElements(container);
  let target = (closeBtn && !closeBtn.hasAttribute('hidden')) ? closeBtn : focusables[0];
  if(!target) target = container;
  const focusFn = ()=>{
    try{ target.focus(); }
    catch(err){ console.warn('[modalV3] Failed to focus target element:', err?.message || err); }
  };
  const schedule = typeof window !== 'undefined' && window.requestAnimationFrame ? window.requestAnimationFrame : setTimeout;
  schedule(focusFn, 0);
}
