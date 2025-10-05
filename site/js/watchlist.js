import { getState } from './state.js';

const STORAGE_KEY = 'watchlist:v1';
let saved = new Set();

function load(){
  try{ saved = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]')); }catch{ saved = new Set(); }
}
function persist(){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(saved.values()))); }catch{} }

function idFor(item){
  if(!item) return '';
  const kind = (item.type==='tv' || item.libraryType==='show') ? 'show' : 'movie';
  const id = item.ids?.imdb || item.ids?.tmdb || String(item.ratingKey||'');
  return id ? `${kind}:${id}` : '';
}

export function isSaved(item){ return saved.has(idFor(item)); }
export function count(){ return saved.size; }
export function toggle(item){
  const k=idFor(item);
  if(!k) return;
  if(saved.has(k)) saved.delete(k); else saved.add(k);
  persist();
  renderCount();
  const panel=document.getElementById('watchlistPanel');
  if(panel && !panel.hidden) renderPanel();
}

export function renderCount(){ const el=document.getElementById('watchlistCount'); if(el) el.textContent = String(count()); }

export function openPanel(){
  const p=document.getElementById('watchlistPanel');
  if(p) {
    p.hidden=false;
    p.setAttribute('aria-hidden','false');
    renderPanel();
  }
}

export function closePanel(){
  const p=document.getElementById('watchlistPanel');
  if(p){
    p.hidden=true;
    p.setAttribute('aria-hidden','true');
  }
  setExpanded(false);
}

export function clear(){ saved.clear(); persist(); renderCount(); renderPanel(); }

export function exportJson(){
  const items = listItems();
  const data = JSON.stringify(items, null, 2);
  const blob = new Blob([data], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'watchlist.json';
  document.body.append(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
}

function listItems(){
  const s = getState();
  const pool = (s.movies||[]).concat(s.shows||[]);
  const map = new Map(pool.map(it=>[idFor(it), it]));
  return Array.from(saved.values()).map(k=>map.get(k)).filter(Boolean);
}

export function renderPanel(){
  const list = document.getElementById('watchlistItems');
  const empty = document.getElementById('watchlistEmpty');
  if(!list || !empty) return;
  const items = listItems();
  if(items.length===0){ list.replaceChildren(); empty.hidden=false; return; }
  empty.hidden=true;
  const frag = document.createDocumentFragment();
  items.forEach(item=>{
    const li = document.createElement('li');
    li.className = 'watchlist-item';
    const t = document.createElement('span');
    t.className='title';
    t.textContent = item.title || '';
    const rm = document.createElement('button');
    rm.textContent = 'Entfernen';
    rm.addEventListener('click', ()=>{ toggle(item); renderPanel(); });
    const open = document.createElement('button');
    open.textContent = 'Öffnen';
    open.addEventListener('click', ()=>{
      const kind = (item.type==='tv') ? 'show' : 'movie';
      const id = item.ids?.imdb || item.ids?.tmdb || String(item.ratingKey||'');
      if(id) location.hash = `#/${kind}/${id}`;
    });
    li.append(t, open, rm);
    frag.append(li);
  });
  list.replaceChildren(frag);
}

export function initUi(){
  load();
  renderCount();
  const openBtn = document.getElementById('openWatchlist');
  const toggleBtn = document.getElementById('watchlistToggle');
  const closeBtn = document.getElementById('closeWatchlist');
  const clearBtn = document.getElementById('clearWatchlist');
  const exportBtn = document.getElementById('exportWatchlist');
  openBtn && openBtn.addEventListener('click', ()=>{ openPanel(); setExpanded(true); });
  toggleBtn && toggleBtn.addEventListener('click', ()=>{ const p=document.getElementById('watchlistPanel'); if(p && !p.hidden){ closePanel(); } else { openPanel(); setExpanded(true); } });
  closeBtn && closeBtn.addEventListener('click', ()=>{ closePanel(); });
  clearBtn && clearBtn.addEventListener('click', ()=>{ clear(); });
  exportBtn && exportBtn.addEventListener('click', ()=>{ exportJson(); });
}

function setExpanded(on){ const t=document.getElementById('watchlistToggle'); if(t) t.setAttribute('aria-expanded', on?'true':'false'); }
