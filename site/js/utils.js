import { getState } from './state.js';

export function getGenreNames(genres){
  const seen = new Set();
  const names = [];
  (genres || []).forEach(entry=>{
    let name = '';
    if(typeof entry === 'string'){
      name = entry;
    }else if(entry && typeof entry === 'object'){
      name = entry.tag || entry.title || entry.name || '';
    }
    const str = String(name || '').trim();
    if(str && !seen.has(str)){
      seen.add(str);
      names.push(str);
    }
  });
  return names;
}

export function renderChipsLimited(container, values, limit=6){
  if(!container) return;
  const vals = (values||[]).filter(Boolean);
  const head = vals.slice(0, limit);
  const rest = vals.slice(limit);
  const chips = head.map(text=>chip(text));
  if(rest.length){
    const more = chip(`+${rest.length} mehr`);
    more.classList.add('more');
    // store extra chips to reveal on click
    more._extraChips = rest.map(text=>chip(text));
    chips.push(more);
  }
  container.replaceChildren(...chips);
  enableMoreChipBehavior(container);
}

export function enableMoreChipBehavior(root = document){
  try{
    root.querySelectorAll('.chips .chip.more').forEach(btn=>{
      if(btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', ()=>{
        const hidden = btn._extraChips || [];
        try{ hidden.forEach(ch => btn.before(ch)); }catch{}
        btn.remove();
      });
    });
  }catch{}
}

export function humanYear(item){
  if(item?.year) return item.year;
  if(item?.originallyAvailableAt) return String(item.originallyAvailableAt).slice(0,4);
  return '';
}

export function formatRating(val){
  if(val === undefined || val === null || val === '') return '';
  const num = Number(val);
  if(Number.isFinite(num)){
    const fixed = num.toFixed(1);
    return fixed.endsWith('.0') ? fixed.slice(0,-2) : fixed;
  }
  return String(val).trim();
}

function chip(text){ const s=document.createElement('span'); s.className='chip'; s.textContent=String(text||''); return s; }

export function isNew(item){
  if(!item?.addedAt) return false;
  const added = new Date(item.addedAt).getTime();
  if(!Number.isFinite(added)) return false;
  const cfg = getState().cfg || {};
  const days = Number(cfg.newDays || 30);
  return Date.now() - added <= days * 24*60*60*1000;
}

export function useTmdbOn(){ try{ return localStorage.getItem('useTmdb')==='1'; }catch{ return false; } }
