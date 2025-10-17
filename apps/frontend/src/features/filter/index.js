import { getState, setState } from '../../core/state.js';
import { qs } from '../../core/dom.js';
import { fetchCatalogFacets, searchLibrary } from '../../js/data.js';
import {
  computeFacets as computeSharedFacets,
  filterMediaItems as filterSharedMediaItems,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from '@plex-exporter/shared';

export async function computeFacets(movies = [], shows = []){
  try{
    const facets = await fetchCatalogFacets();
    return normalizeFacets(facets);
  }catch(err){
    console.warn('[filter] Failed to fetch facets from API:', err?.message || err);
    try{
      return normalizeFacets(computeSharedFacets(movies, shows));
    }catch(innerErr){
      console.warn('[filter] Failed to compute fallback facets:', innerErr?.message || innerErr);
      return { genres: [], years: [], collections: [] };
    }
  }
}

function normalizeFacets(facets){
  const safe = facets && typeof facets === 'object' ? facets : {};
  const genres = Array.isArray(safe.genres) ? safe.genres.slice() : [];
  const years = Array.isArray(safe.years) ? safe.years.slice() : [];
  const collections = Array.isArray(safe.collections) ? safe.collections.slice() : [];
  genres.sort((a,b)=> String(a||'').localeCompare(String(b||''),'de'));
  years.sort((a,b)=> Number(a) - Number(b));
  collections.sort((a,b)=> String(a||'').localeCompare(String(b||''),'de'));
  return { genres, years, collections };
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

function parseYearValue(value){
  if(!value) return undefined;
  const str = String(value).trim();
  if(!str) return undefined;
  const num = Number(str);
  return Number.isFinite(num) ? num : undefined;
}

function toFilterPayload(opts, cfg){
  const genres = Array.from(opts.genres || []).filter(Boolean);
  const payload = {
    query: opts.query || undefined,
    onlyNew: !!opts.onlyNew,
    yearFrom: parseYearValue(opts.yearFrom),
    yearTo: parseYearValue(opts.yearTo),
    collection: opts.collection || undefined,
    sort: opts.sort || 'title-asc',
    genres,
  };
  const days = Number(cfg?.newDays);
  if(Number.isFinite(days) && days > 0){
    payload.newDays = days;
  }
  return payload;
}

const DEFAULT_PAGE = 1;
const MAX_PAGE = 1000;
let activeFilterRequest = 0;

export function applyFilters(pagination = {}){
  const state = getState();
  const view = state.view;
  if(view !== 'movies' && view !== 'shows'){
    setState({ filtered: [], filteredMeta: { page: DEFAULT_PAGE, pageSize: DEFAULT_PAGE_SIZE, total: 0 } });
    return [];
  }

  const opts = getFilterOpts();
  const payload = toFilterPayload(opts, state.cfg || {});
  const pool = view === 'shows' ? state.shows : state.movies;
  const fallback = Array.isArray(pool) ? filterSharedMediaItems(pool, payload, Date.now()) : [];

  const previousMeta = state.filteredMeta || { page: DEFAULT_PAGE, pageSize: DEFAULT_PAGE_SIZE, total: 0 };
  const clampPageSize = (value) => {
    const num = Number(value);
    if(!Number.isFinite(num)) return DEFAULT_PAGE_SIZE;
    const int = Math.floor(num);
    if(int < 1) return 1;
    if(int > MAX_PAGE_SIZE) return MAX_PAGE_SIZE;
    return int;
  };
  const clampPage = (value) => {
    const num = Number(value);
    if(!Number.isFinite(num) || num < DEFAULT_PAGE) return DEFAULT_PAGE;
    const int = Math.floor(num);
    if(int > MAX_PAGE) return MAX_PAGE;
    return int;
  };

  const desiredPageSize = clampPageSize(
    pagination && Object.prototype.hasOwnProperty.call(pagination, 'pageSize')
      ? pagination.pageSize
      : previousMeta.pageSize,
  );
  const desiredPage = clampPage(
    pagination && Object.prototype.hasOwnProperty.call(pagination, 'page')
      ? pagination.page
      : DEFAULT_PAGE,
  );

  const fallbackMeta = {
    page: desiredPage,
    pageSize: desiredPageSize,
    total: fallback.length,
  };

  setState({ filtered: fallback, filteredMeta: fallbackMeta });

  const requestId = ++activeFilterRequest;
  searchLibrary(view, payload, { includeFacets: false, page: desiredPage, pageSize: desiredPageSize })
    .then((response) => {
      if(requestId !== activeFilterRequest) return;
      if(!response || !Array.isArray(response.items)) return;
      const total = Number.isFinite(response.total) && response.total >= 0 ? response.total : response.items.length;
      const resolvedMeta = {
        page: clampPage(response.page ?? desiredPage),
        pageSize: clampPageSize(response.pageSize ?? desiredPageSize),
        total,
      };
      setState({ filtered: response.items, filteredMeta: resolvedMeta });
      renderGridForCurrentView();
      notifyFiltersUpdated(response.items);
    })
    .catch(err => {
      console.error('[filter] Failed to fetch filtered items:', err?.message || err);
    });

  return fallback;
}

let gridModulePromise = null;
function renderGridForCurrentView(){
  if(!gridModulePromise){
    gridModulePromise = import('../grid/index.js');
  }
  gridModulePromise.then(mod=>{
    const fn = mod && mod.renderGrid;
    if(typeof fn === 'function') fn(getState().view);
  }).catch(console.error);
}

let filtersUpdatedHandler = null;

export function setFiltersUpdatedHandler(handler){
  filtersUpdatedHandler = typeof handler === 'function' ? handler : null;
}

export function updateFiltersAndGrid(pagination){
  const result = applyFilters(pagination);
  renderGridForCurrentView();
  notifyFiltersUpdated(result);
  return result;
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

  const triggerUpdate = () => {
    try{
      updateFiltersAndGrid();
    }catch(err){
      console.warn('[filter] Failed to update grid after filter change:', err?.message || err);
    }
  };

  const bind = (sel, ev='input')=>{
    const n = qs(sel);
    if(!n) return;
    n.addEventListener(ev, ()=>{ triggerUpdate(); });
    if(ev === 'input' && n instanceof HTMLInputElement && n.type === 'search'){
      n.addEventListener('search', ()=>{ triggerUpdate(); });
    }
  };
  bind('#search');
  bind('#q');
  bind('#onlyNew','change'); bind('#yearFrom','change'); bind('#yearTo','change'); bind('#collectionFilter','change'); bind('#sort','change'); bind('#groupCollections','change');
  const yrReset = qs('#yearReset'); if(yrReset){ yrReset.addEventListener('click',()=>{ const a=qs('#yearFrom'); const b=qs('#yearTo'); if(a) a.value=''; if(b) b.value=''; triggerUpdate(); }); }
  const gRoot = qs('#genreFilters');
  if(gRoot){
    gRoot.addEventListener('click', ev=>{
      const t = ev.target;
      if(!(t instanceof HTMLElement)) return;
      if(!t.classList.contains('chip')) return;
      t.classList.toggle('active');
      updateGenreFilterState();
      triggerUpdate();
    });
    updateGenreFilterState();
  }
}

function notifyFiltersUpdated(items){
  if(!filtersUpdatedHandler) return;
  try{
    const payload = Array.isArray(items) ? items.slice() : [];
    const meta = { ...(getState().filteredMeta || {}) };
    filtersUpdatedHandler(payload, getState().view, meta);
  }catch(err){
    console.warn('[filter] Failed to notify filters handler:', err?.message);
  }
}

