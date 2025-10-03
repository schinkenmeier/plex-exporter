import { getState, setState } from './state.js';
import { qs } from './dom.js';

function humanYear(item){
  if(item.year) return item.year;
  if(item.originallyAvailableAt) return String(item.originallyAvailableAt).slice(0,4);
  return '';
}

function collectionTags(item){
  return ((item && item.collections) || [])
    .map(entry=>entry && (entry.tag || entry.title || entry.name || ''))
    .filter(Boolean);
}

function isNew(item){
  if(!item?.addedAt) return false;
  const added = new Date(item.addedAt).getTime();
  if(!Number.isFinite(added)) return false;
  const cfg = getState().cfg || {};
  const days = Number(cfg.newDays || 30);
  return Date.now() - added <= days * 24*60*60*1000;
}

function norm(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }

function matches(item, opts){
  const query = norm(opts.query||'');
  const onlyNew = !!opts.onlyNew;
  const yearFrom = Number(opts.yearFrom)||null;
  const yearTo = Number(opts.yearTo)||null;
  const genresActive = opts.genres || new Set();
  const selectedCollection = opts.collection || '';

  if(query){
    const haystack = norm([
      item.title,
      item.originalTitle,
      item.summary,
      item.studio,
      (item.genres||[]).map(g=>g&&g.tag).join(' '),
      (item.roles||[]).map(r=>r && (r.tag||r.role||r.name)).join(' '),
      collectionTags(item).join(' '),
    ].filter(Boolean).join(' '));
    if(!haystack.includes(query)) return false;
  }

  if(onlyNew && !isNew(item)) return false;

  const year = Number(humanYear(item)) || null;
  if(yearFrom && (!year || year < yearFrom)) return false;
  if(yearTo && (!year || year > yearTo)) return false;

  if(genresActive.size){
    const itemGenres = new Set((item.genres||[]).map(g=>g && g.tag));
    for(const g of genresActive){ if(!itemGenres.has(g)) return false; }
  }

  if(selectedCollection){
    const tags = new Set(collectionTags(item));
    if(!tags.has(selectedCollection)) return false;
  }

  return true;
}

function sortItems(items, key){
  const arr = items.slice();
  switch(key){
    case 'year-desc':
      arr.sort((a,b)=> (Number(humanYear(b))||0) - (Number(humanYear(a))||0) || String(a.title||'').localeCompare(String(b.title||''),'de')); break;
    case 'year-asc':
      arr.sort((a,b)=> (Number(humanYear(a))||0) - (Number(humanYear(b))||0) || String(a.title||'').localeCompare(String(b.title||''),'de')); break;
    case 'title-desc':
      arr.sort((a,b)=> String(b.title||'').localeCompare(String(a.title||''),'de')); break;
    case 'added-desc':
      arr.sort((a,b)=> new Date(b.addedAt||0)-new Date(a.addedAt||0)); break;
    case 'title-asc':
    default:
      arr.sort((a,b)=> String(a.title||'').localeCompare(String(b.title||''),'de'));
  }
  return arr;
}

export function computeFacets(movies, shows){
  const genres = new Set();
  const years = new Set();
  const collections = new Set();
  const add = (arr)=> (arr||[]).forEach(x=>{
    (x.genres||[]).forEach(g=>{ if(g&&g.tag) genres.add(g.tag); });
    const y = x.year || (x.originallyAvailableAt?String(x.originallyAvailableAt).slice(0,4):'');
    if(y) years.add(Number(y));
    collectionTags(x).forEach(c=>collections.add(c));
  });
  add(movies); add(shows);
  const ys = [...years].sort((a,b)=>a-b);
  return { genres:[...genres].sort(), years:ys, collections:[...collections].sort((a,b)=>a.localeCompare(b,'de')) };
}

export function renderFacets(f){
  // years
  const yFrom = qs('#yearFrom'); const yTo = qs('#yearTo');
  if(yFrom){ yFrom.replaceChildren(new Option('Ab Jahr',''), ...f.years.map(y=>new Option(String(y), String(y)))); }
  if(yTo){ yTo.replaceChildren(new Option('Bis Jahr',''), ...f.years.map(y=>new Option(String(y), String(y)))); }
  // collections
  const col = qs('#collectionFilter');
  if(col){ col.replaceChildren(new Option('Alle Collections',''), ...f.collections.map(c=>new Option(c,c))); }
  // genres
  const gRoot = qs('#genreFilters');
  if(gRoot){
    const chips = f.genres.map(name=>{
      const b = document.createElement('button'); b.type='button'; b.className='chip'; b.textContent=name; b.dataset.name=name; return b;
    });
    gRoot.replaceChildren(...chips);
    updateGenreFilterState();
  }
}

function getFilterOpts(){
  const searchInput = document.getElementById('search') || document.getElementById('q');
  const query = (searchInput?.value || '').trim();
  const onlyNew = qs('#onlyNew')?.checked || false;
  const yearFrom = qs('#yearFrom')?.value || '';
  const yearTo = qs('#yearTo')?.value || '';
  const collection = qs('#collectionFilter')?.value || '';
  const sort = qs('#sort')?.value || 'title-asc';
  const genres = new Set();
  document.querySelectorAll('#genreFilters .chip.active').forEach(n=>genres.add(n.dataset.name));
  return { query, onlyNew, yearFrom, yearTo, collection, genres, sort };
}

export function applyFilters(){
  const s = getState();
  const view = s.view;
  const pool = view==='shows' ? s.shows : s.movies;
  const opts = getFilterOpts();
  const filtered = (pool||[]).filter(item=>matches(item, opts));
  const ordered = sortItems(filtered, opts.sort);
  setState({ filtered: ordered });
  return ordered;
}

let gridModulePromise = null;
function renderGridForCurrentView(){
  if(!gridModulePromise){
    gridModulePromise = import('./grid.js');
  }
  gridModulePromise.then(mod=>{
    const fn = mod && mod.renderGrid;
    if(typeof fn === 'function') fn(getState().view);
  }).catch(console.error);
}

export function updateFiltersAndGrid(){
  const result = applyFilters();
  renderGridForCurrentView();
  notifyFiltersUpdated(result);
  return result;
}

function notifyFiltersUpdated(items){
  try{
    const payload = Array.isArray(items) ? items.slice() : [];
    const detail = { items: payload, view: getState().view };
    window.dispatchEvent(new CustomEvent('filters:updated', { detail }));
  }catch{}
}

function updateGenreFilterState(){
  const root = document.getElementById('genreFilters');
  if(!root) return;
  const activeCount = root.querySelectorAll('.chip.active').length;
  root.dataset.state = activeCount > 0 ? 'active' : 'empty';
  root.dataset.count = String(activeCount);
}

export function initFilters(){
  // populate sort options
  const sortSel = qs('#sort');
  if(sortSel && sortSel.options.length===0){
    [['title-asc','Titel A–Z'],['title-desc','Titel Z–A'],['year-desc','Jahr ↓'],['year-asc','Jahr ↑'],['added-desc','Zuletzt hinzugefügt']]
      .forEach(([v,l])=> sortSel.add(new Option(l, v)));
  }

  const bind = (sel, ev='input')=>{
    const n = qs(sel);
    if(!n) return;
    n.addEventListener(ev, ()=>{ updateFiltersAndGrid(); });
    if(ev === 'input' && n instanceof HTMLInputElement && n.type === 'search'){
      n.addEventListener('search', ()=>{ updateFiltersAndGrid(); });
    }
  };
  bind('#search');
  bind('#q');
  bind('#onlyNew','change'); bind('#yearFrom','change'); bind('#yearTo','change'); bind('#collectionFilter','change'); bind('#sort','change'); bind('#groupCollections','change');
  const yrReset = qs('#yearReset'); if(yrReset){ yrReset.addEventListener('click',()=>{ const a=qs('#yearFrom'); const b=qs('#yearTo'); if(a) a.value=''; if(b) b.value=''; updateFiltersAndGrid(); }); }
  const gRoot = qs('#genreFilters');
  if(gRoot){
    gRoot.addEventListener('click', ev=>{
      const t = ev.target;
      if(!(t instanceof HTMLElement)) return;
      if(!t.classList.contains('chip')) return;
      t.classList.toggle('active');
      updateGenreFilterState();
      updateFiltersAndGrid();
    });
    updateGenreFilterState();
  }
}

