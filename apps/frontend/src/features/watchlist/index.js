import { getState } from '../../core/state.js';

const STORAGE_KEY = 'watchlist:v1';
const LOG_PREFIX = '[watchlist]';
let saved = new Set();

function load(){
  try{
    saved = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]'));
  }catch(err){
    console.warn(`${LOG_PREFIX} Failed to load entries from storage:`, err?.message || err);
    saved = new Set();
  }
}
function persist(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(saved.values())));
  }catch(err){
    console.warn(`${LOG_PREFIX} Failed to persist entries to storage:`, err?.message || err);
  }
}

function resolvePrimaryId(item){
  if(!item) return '';
  const ids = item.ids && typeof item.ids === 'object'
    ? Object.entries(item.ids)
    : [];
  const orderedKeys = ['imdb', 'slug', 'ratingKey', 'guid'];
  const candidates = [];
  orderedKeys.forEach(key => {
    const match = ids.find(([entryKey]) => entryKey === key);
    if(match && match[1] != null){
      candidates.push(match[1]);
    }
  });
  ids.forEach(([key, value]) => {
    if(key === 'tmdb' || key === 'themoviedb') return;
    if(value != null) candidates.push(value);
  });
  candidates.push(item.ratingKey, item.rating_key, item.id);
  for(const value of candidates){
    if(value == null) continue;
    const str = String(value).trim();
    if(str) return str;
  }
  return '';
}

function idFor(item){
  if(!item) return '';
  const kind = (item.type==='tv' || item.libraryType==='show') ? 'show' : 'movie';
  const id = resolvePrimaryId(item);
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

const API_BASE = typeof window !== 'undefined' && window.PLEX_EXPORTER_API_BASE
  ? window.PLEX_EXPORTER_API_BASE
  : 'http://localhost:4000';

export async function sendEmail(email){
  const items = listItems();
  if(items.length === 0){
    showToast('Keine Einträge in der Merkliste', 'error');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/watchlist/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        items: items.map(item => ({
          title: item.title,
          type: item.type === 'tv' ? 'tv' : 'movie',
          year: item.year,
          summary: item.summary,
          poster: item.poster
        }))
      })
    });

    if(!response.ok){
      const error = await response.json();
      throw new Error(error.error || 'Fehler beim E-Mail-Versand');
    }

    const result = await response.json();
    showToast('E-Mail erfolgreich versendet!', 'success');
    return result.emailId;
  } catch(err){
    console.error(`${LOG_PREFIX} Failed to send email:`, err);
    showToast(err.message || 'Fehler beim E-Mail-Versand', 'error');
    throw err;
  }
}

export function showEmailDialog(){
  const email = prompt('E-Mail-Adresse für Merkliste:');
  if(email && email.includes('@')){
    sendEmail(email);
  } else if(email){
    showToast('Ungültige E-Mail-Adresse', 'error');
  }
}

function showToast(message, type = 'info'){
  if(typeof window.showErrorToast === 'function'){
    window.showErrorToast(message);
  } else {
    console.log(`[${type}] ${message}`);
  }
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
      const id = resolvePrimaryId(item);
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
  const emailBtn = document.getElementById('emailWatchlist');
  openBtn && openBtn.addEventListener('click', ()=>{ openPanel(); setExpanded(true); });
  toggleBtn && toggleBtn.addEventListener('click', ()=>{ const p=document.getElementById('watchlistPanel'); if(p && !p.hidden){ closePanel(); } else { openPanel(); setExpanded(true); } });
  closeBtn && closeBtn.addEventListener('click', ()=>{ closePanel(); });
  clearBtn && clearBtn.addEventListener('click', ()=>{ clear(); });
  exportBtn && exportBtn.addEventListener('click', ()=>{ exportJson(); });
  emailBtn && emailBtn.addEventListener('click', ()=>{ showEmailDialog(); });
}

function setExpanded(on){ const t=document.getElementById('watchlistToggle'); if(t) t.setAttribute('aria-expanded', on?'true':'false'); }
