import { qs, el } from './dom.js';

let overlay;
let bar;
let msgEl;
let skeletonRoot;

function ensure(){
  if(overlay) return;
  overlay = qs('#loaderOverlay');
  if(!overlay){
    overlay = el('div','loader-overlay');
    overlay.id = 'loaderOverlay';
    // Start hidden by default so a partially executed boot sequence
    // does not leave a dark overlay on screen.
    overlay.hidden = true;
    const box = el('div','loader');
    msgEl = el('div','msg','');
    bar = el('div','bar');
    box.append(msgEl, bar);
    overlay.append(box);
    document.body.append(overlay);
  }
}

export function showLoader(){ ensure(); overlay.hidden = false; }
export function setLoader(msg, p){ ensure(); if(msgEl) msgEl.textContent = msg||''; if(bar) bar.style.width = (p||0)+"%"; }
export function hideLoader(){ ensure(); overlay.hidden = true; }

export function showSkeleton(count=18){
  const grid = qs('#grid');
  if(!grid) return;
  skeletonRoot = el('div','skeleton');
  for(let i=0;i<count;i++){ skeletonRoot.append(el('div','skel')); }
  grid.replaceChildren(skeletonRoot);
}
export function clearSkeleton(){
  if(skeletonRoot && skeletonRoot.parentElement){ skeletonRoot.parentElement.removeChild(skeletonRoot); }
  skeletonRoot = null;
}
