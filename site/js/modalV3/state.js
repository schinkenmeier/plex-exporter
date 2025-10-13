const state = {
  renderSequence: 0,
  activeRenderToken: 0,
  activeKind: null,
  activeItem: null,
  lastFocused: null,
};

export function startRender(kind = null, item = null){
  state.renderSequence += 1;
  state.activeRenderToken = state.renderSequence;
  state.activeKind = kind || null;
  state.activeItem = item || null;
  return state.activeRenderToken;
}

export function isCurrentRender(token){
  if(!token) return false;
  return token === state.activeRenderToken;
}

export function getRenderToken(){
  return state.activeRenderToken;
}

export function cancelRender(){
  state.renderSequence += 1;
  state.activeRenderToken = 0;
  return state.renderSequence;
}

export function setActiveItem(kind = null, item = null){
  state.activeKind = kind || null;
  state.activeItem = item || null;
}

export function getActiveItem(){
  return { kind: state.activeKind, item: state.activeItem };
}

export function clearActiveItem(){
  state.activeKind = null;
  state.activeItem = null;
}

export function captureLastFocused(){
  if(typeof document === 'undefined'){
    state.lastFocused = null;
    return null;
  }
  const active = document.activeElement;
  const elementCtor = typeof HTMLElement !== 'undefined' ? HTMLElement : null;
  state.lastFocused = elementCtor && active instanceof elementCtor ? active : null;
  return state.lastFocused;
}

export function restoreLastFocused(){
  const target = state.lastFocused;
  state.lastFocused = null;
  const elementCtor = typeof HTMLElement !== 'undefined' ? HTMLElement : null;
  if(target && (!elementCtor || target instanceof elementCtor) && typeof target.focus === 'function'){
    try{ target.focus(); }
    catch(err){ console.warn('[modalV3] Failed to restore focus to last active element:', err?.message || err); }
  }
}

export function getLastFocused(){
  return state.lastFocused;
}

export function resetState(){
  state.activeKind = null;
  state.activeItem = null;
  state.activeRenderToken = 0;
  state.lastFocused = null;
}

export function getState(){
  return { ...state };
}
