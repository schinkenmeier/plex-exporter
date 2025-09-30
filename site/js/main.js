import { setState, getState } from './state.js';
import { showLoader, setLoader, hideLoader, showSkeleton, clearSkeleton } from './loader.js';
import * as Data from './data.js';
import * as Filter from './filter.js';
import { renderGrid } from './grid.js';
import { openModal } from './modal/index.js';
import { hydrateOptional } from './services/tmdb.js';
import * as Watch from './watchlist.js';

async function boot(){
  applyReduceMotionPref();
  showLoader(); setLoader('Initialisiere …', 8); showSkeleton(18);

  const cfg = await fetch('config.json').then(r=>r.json()).catch(()=>({ startView:'movies', tmdbEnabled:false }));
  setState({ cfg, view: cfg.startView || 'movies' });

  setLoader('Filme laden …', 25);
  const movies = await Data.loadMovies();
  setLoader('Serien laden …', 45);
  const shows  = await Data.loadShows();

  setLoader('Filter vorbereiten …', 60);
  // build facets (richer set via Filter)
  const facets = Filter.computeFacets(movies, shows);
  setState({ movies, shows, facets });

  setLoader('Ansicht aufbauen …', 85);
  clearSkeleton();
  renderSwitch();
  Filter.renderFacets(facets);
  Filter.initFilters();
  Filter.applyFilters();
  renderStats();
  renderGrid(getState().view);

  hideLoader();

  if(cfg.tmdbEnabled) (window.requestIdleCallback || setTimeout)(()=> hydrateOptional?.(movies, shows, cfg), 400);

  Watch.initUi();
  initSettingsOverlay(cfg);
  initAdvancedToggle();
  initHeaderInteractions();
  initScrollProgress();
  initScrollTop();
}

window.addEventListener('hashchange', ()=>{
  const hash = location.hash || '';
  // deep link to views
  if(/^#\/(movies|shows)$/.test(hash)){
    const view = hash.includes('shows') ? 'shows' : 'movies';
    setState({ view });
    Filter.applyFilters();
    renderSwitch();
    renderGrid(view);
    return;
  }
  // item details
  const m = hash.match(/^#\/(movie|show)\/(.+)/);
  if(!m) return;
  const [ , kind, id ] = m;
  const pool = kind==='movie' ? getState().movies : getState().shows;
  const item = (pool||[]).find(x => (x?.ids?.imdb===id || x?.ids?.tmdb===id || String(x?.ratingKey)===id));
  if(item) openModal(item);
});

function renderSwitch(){
  const root = document.getElementById('librarySwitch');
  if(!root) return;
  root.replaceChildren();
  const mk = (key,label)=>{
    const b = document.createElement('button');
    b.textContent = label; b.dataset.key = key;
    if(getState().view === (key==='movies'?'movies':'shows')) b.classList.add('active');
    b.addEventListener('click',()=>{
      const view = key==='movies'?'movies':'shows';
      setState({ view });
      location.hash = view==='movies' ? '#/movies' : '#/shows';
      renderSwitch();
      Filter.applyFilters();
      renderGrid(view);
    });
    return b;
  };
  root.append(
    mk('movies','Filme'),
    mk('shows','Serien'),
  );
}

function renderStats(){
  const el = document.getElementById('heroStats');
  const s = getState();
  if(el) el.textContent = `${(s.movies||[]).length} Filme | ${(s.shows||[]).length} Serien`;
}

boot();

function initSettingsOverlay(cfg){
  const overlay = document.getElementById('settingsOverlay');
  const open1 = document.getElementById('settingsBtn');
  const open2 = document.getElementById('openSettings');
  const close2 = document.getElementById('settingsClose2');
  const tmdbInput = document.getElementById('tmdbTokenInput');
  const tmdbSave = document.getElementById('tmdbSave');
  const tmdbClear = document.getElementById('tmdbClearCache');
  const reduce = document.getElementById('prefReduceMotion');
  const useTmdb = document.getElementById('useTmdbSetting');
  const resetFilters = document.getElementById('resetFilters');

  const show = ()=>{ if(overlay) overlay.hidden=false; syncSettingsUi(); };
  const hide = ()=>{ if(overlay) overlay.hidden=true; };
  open1 && open1.addEventListener('click', show);
  open2 && open2.addEventListener('click', ev=>{ ev.preventDefault(); show(); });
  close2 && close2.addEventListener('click', hide);
  overlay && overlay.addEventListener('click', (ev)=>{ if(ev.target===overlay) hide(); });

  function syncSettingsUi(){
    let token = '';
    try{ tmdbInput && (tmdbInput.value = token = (localStorage.getItem('tmdbToken')||'')); }catch{}
    try{ reduce && (reduce.checked = localStorage.getItem('prefReduceMotion')==='1'); }catch{}
    try{ if(useTmdb){ useTmdb.checked = localStorage.getItem('useTmdb')==='1'; useTmdb.disabled = !token; } }catch{}
  }

  tmdbSave && tmdbSave.addEventListener('click', ()=>{
    try{ const t=String(tmdbInput.value||'').trim(); localStorage.setItem('tmdbToken', t); }catch{}
    hide();
  });
  tmdbClear && tmdbClear.addEventListener('click', ()=>{ import('./services/tmdb.js').then(m=>m.clearCache?.()); });
  reduce && reduce.addEventListener('change', ()=>{
    try{ localStorage.setItem('prefReduceMotion', reduce.checked ? '1' : '0'); }catch{}
    document.documentElement.classList.toggle('reduce-motion', reduce.checked);
  });
  useTmdb && useTmdb.addEventListener('change', ()=>{
    try{ localStorage.setItem('useTmdb', useTmdb.checked ? '1' : '0'); }catch{}
    renderGrid(getState().view);
  });
  resetFilters && resetFilters.addEventListener('click', ()=>{
    const q = document.getElementById('q'); if(q) q.value='';
    const onlyNew = document.getElementById('onlyNew'); if(onlyNew) onlyNew.checked=false;
    const yf = document.getElementById('yearFrom'); const yt = document.getElementById('yearTo'); if(yf) yf.value=''; if(yt) yt.value='';
    const col = document.getElementById('collectionFilter'); if(col) col.value='';
    document.querySelectorAll('#genreFilters .chip.active').forEach(n=>n.classList.remove('active'));
    import('./filter.js').then(F=>{ F.applyFilters(); renderGrid(getState().view); });
  });
}

function applyReduceMotionPref(){
  try{ const pref = localStorage.getItem('prefReduceMotion')==='1'; document.documentElement.classList.toggle('reduce-motion', pref); }catch{}
}

function initAdvancedToggle(){
  const btn = document.getElementById('toggleAdvanced');
  const panel = document.getElementById('advancedFilters');
  if(!btn || !panel) return;
  btn.addEventListener('click', ()=>{
    const now = panel.hasAttribute('hidden');
    if(now) panel.removeAttribute('hidden'); else panel.setAttribute('hidden','');
    btn.setAttribute('aria-expanded', String(now));
  });
}

function initHeaderInteractions(){
  const siteLogo = document.getElementById('siteLogo');
  if(siteLogo){
    siteLogo.addEventListener('error', ()=>{
      siteLogo.classList.add('logo-missing');
      const titleEl = document.querySelector('.site-header__meta h1');
      if(titleEl) titleEl.classList.remove('sr-only');
    });
  }
  const subtitle = document.getElementById('heroSubtitle');
  const TAGLINES = [
    'Offline stöbern & Wunschlisten teilen',
    'Filter. Finden. Freuen.',
    'Filme & Serien – stressfrei sichtbar',
    'Schneller als jeder SMB-Share',
    'Merkliste zuerst, Streit später'
  ];
  let idx = 0; if(subtitle) subtitle.textContent = TAGLINES[idx];
  function rotate(){
    if(!subtitle || subtitle.dataset.taglinePaused==='1') return;
    subtitle.classList.add('is-fading');
    setTimeout(()=>{
      if(!subtitle || subtitle.dataset.taglinePaused==='1'){ subtitle && subtitle.classList.remove('is-fading'); return; }
      idx = (idx+1)%TAGLINES.length; subtitle.textContent = TAGLINES[idx]; subtitle.classList.remove('is-fading');
    }, 280);
  }
  if(subtitle){ subtitle.dataset.taglinePaused='0'; if(!window.__taglineTicker){ window.__taglineTicker = setInterval(rotate, 6000); setTimeout(rotate, 3000); } }
}

function initScrollProgress(){
  const bar = document.getElementById('scrollProgress');
  if(!bar) return;
  const update = ()=>{
    const scrollTop = document.documentElement.scrollTop || document.body.scrollTop || 0;
    const height = (document.documentElement.scrollHeight - document.documentElement.clientHeight) || 1;
    const pct = Math.max(0, Math.min(100, (scrollTop/height)*100));
    bar.style.width = pct + '%';
  };
  addEventListener('scroll', update, { passive:true });
  update();
}

function initScrollTop(){
  const btn = document.getElementById('scrollTop');
  if(!btn) return;
  const toggle = ()=>{ const y = window.scrollY||0; btn.style.display = y>300 ? 'block' : 'none'; };
  addEventListener('scroll', toggle, { passive:true });
  toggle();
  btn.addEventListener('click', ()=> window.scrollTo({ top:0, behavior:'smooth' }));
}
