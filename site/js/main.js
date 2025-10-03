import { setState, getState } from './state.js';
import { showLoader, setLoader, hideLoader, showSkeleton, clearSkeleton } from './loader.js';
import * as Data from './data.js';
import * as Filter from './filter.js';
import { renderGrid } from './grid.js';
import { openModal, getModalLayout, setModalLayout } from './modal/index.js';
import { hydrateOptional } from './services/tmdb.js';
import * as Watch from './watchlist.js';
import * as Debug from './debug.js';

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
  renderStats(true);
  renderFooterMeta();
  renderGrid(getState().view);

  hideLoader();

  if(cfg.tmdbEnabled) (window.requestIdleCallback || setTimeout)(()=> hydrateOptional?.(movies, shows, cfg), 400);

  Watch.initUi();
  initSettingsOverlay(cfg);
  initAdvancedToggle();
  initHeaderInteractions();
  initScrollProgress();
  initScrollTop();
  Debug.initDebugUi();
  // Re-render grid on TMDB hydration progress to reveal new posters
  let tmdbRaf;
  window.addEventListener('tmdb:chunk', ()=>{
    if(tmdbRaf) return; // throttle to animation frame
    tmdbRaf = requestAnimationFrame(()=>{
      tmdbRaf = null;
      try{ if(localStorage.getItem('useTmdb')==='1') renderGrid(getState().view); }catch{}
    });
  });
  window.addEventListener('tmdb:done', ()=>{
    try{ if(localStorage.getItem('useTmdb')==='1') renderGrid(getState().view); }catch{}
  });
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

function renderStats(animate=false){
  const root = document.getElementById('heroStats');
  if(!root) return;
  const s = getState();
  const movies = (s.movies||[]).length;
  const shows = (s.shows||[]).length;
  // ensure inner spans for animation
  if(!root.querySelector('#statMovies') || !root.querySelector('#statShows')){
    root.innerHTML = `<span id="statMovies">0</span> Filme | <span id="statShows">0</span> Serien`;
  }
  const elM = document.getElementById('statMovies');
  const elS = document.getElementById('statShows');
  if(animate){ countTo(elM, movies); countTo(elS, shows); }
  else { if(elM) elM.textContent=String(movies); if(elS) elS.textContent=String(shows); }
}

function countTo(el, target){
  if(!el) return;
  const start = Number(el.textContent)||0;
  const end = Number(target)||0;
  if(start===end){ el.textContent = String(end); return; }
  const dur = 480; // ms
  const t0 = performance.now();
  function step(t){
    const p = Math.min(1, (t - t0) / dur);
    const val = Math.round(start + (end - start) * (p<0.5 ? 2*p*p : -1 + (4 - 2*p) * p));
    el.textContent = String(val);
    if(p < 1) requestAnimationFrame(step); else el.textContent = String(end);
  }
  requestAnimationFrame(step);
}

function renderFooterMeta(){
  const el = document.getElementById('footerMeta');
  if(!el) return;
  const s = getState();
  const movies = (s.movies||[]); const shows=(s.shows||[]);
  const mCount = movies.length; const sCount = shows.length;
  // derive latest date from addedAt if available, else use today
  const times = movies.concat(shows).map(x=> new Date(x.addedAt||0).getTime()).filter(Number.isFinite);
  const latest = times.length ? new Date(Math.max(...times)) : new Date();
  const date = latest.toISOString().slice(0,10);
  el.textContent = `Filme ${mCount} | Serien ${sCount} — Stand: ${date}`;
}

boot();

function initSettingsOverlay(cfg){
  const overlay = document.getElementById('settingsOverlay');
  const open1 = document.getElementById('settingsBtn');
  const open2 = document.getElementById('openSettings');
  const close2 = document.getElementById('settingsClose2');
  const tmdbInput = document.getElementById('tmdbTokenInput');
  const tmdbSave = document.getElementById('tmdbSave');
  const tmdbTest = document.getElementById('tmdbTest');
  const tmdbStatus = document.getElementById('tmdbStatus');
  const tmdbClear = document.getElementById('tmdbClearCache');
  const tmdbBadge = document.getElementById('tmdbStatusBadge');
  const reduce = document.getElementById('prefReduceMotion');
  const useTmdb = document.getElementById('useTmdbSetting');
  const resetFilters = document.getElementById('resetFilters');
  const modalLayoutRadios = overlay ? overlay.querySelectorAll('input[name="modalLayout"]') : [];

  const show = ()=>{ if(overlay) overlay.hidden=false; syncSettingsUi(); };
  const hide = ()=>{ if(overlay) overlay.hidden=true; };
  open1 && open1.addEventListener('click', show);
  open2 && open2.addEventListener('click', ev=>{ ev.preventDefault(); show(); });
  close2 && close2.addEventListener('click', hide);
  overlay && overlay.addEventListener('click', (ev)=>{ if(ev.target===overlay) hide(); });

  function setTmdbStatus(msg='', kind=''){
    if(!tmdbStatus) return;
    tmdbStatus.textContent = msg;
    tmdbStatus.dataset.kind = kind; // kind: success|error|info|pending
    if(tmdbBadge){ tmdbBadge.dataset.kind = kind || ''; tmdbBadge.title = msg || ''; }
    // Auto-Fallback: Bei Fehler und vorhandenem v3 API Key, gespeicherten ungültigen Token entfernen
    try{
      if(kind==='error' && cfg && cfg.tmdbApiKey){
        const stored = String(localStorage.getItem('tmdbToken')||'').trim();
        const currentInput = String(tmdbInput?.value||'').trim();
        if(stored && currentInput){
          try{ localStorage.removeItem('tmdbToken'); }catch{}
          if(tmdbInput) tmdbInput.value = '';
          setUseTmdbAvailability(true);
          const m = 'Ungültiger Token entfernt. Verwende API Key aus config.json.';
          tmdbStatus.textContent = m;
          tmdbStatus.dataset.kind = 'info';
          if(tmdbBadge){ tmdbBadge.dataset.kind = 'info'; tmdbBadge.title = m; }
        }
      }
    }catch{}
  }

  function setUseTmdbAvailability(allowed){
    if(!useTmdb) return;
    useTmdb.disabled = !allowed;
    useTmdb.title = useTmdb.disabled ? 'Nur verfügbar mit gültigem Token oder API Key.' : '';
    if(!allowed && useTmdb.checked){
      try{ localStorage.setItem('useTmdb', '0'); }catch{}
      useTmdb.checked = false;
      renderGrid(getState().view);
    }
  }

  function syncSettingsUi(){
    let token = '';
    try{ tmdbInput && (tmdbInput.value = token = (localStorage.getItem('tmdbToken')||'')); }catch{}
    try{ reduce && (reduce.checked = localStorage.getItem('prefReduceMotion')==='1'); }catch{}
    try{ if(useTmdb){
      useTmdb.checked = localStorage.getItem('useTmdb')==='1';
      useTmdb.disabled = !token;
      useTmdb.title = useTmdb.disabled ? 'Nur verfügbar mit gültigem Token.' : '';
    } }catch{}
    try{ setUseTmdbAvailability(!!token || !!(cfg&&cfg.tmdbApiKey)); }catch{}
    setTmdbStatus('', '');
    if(!token){ setTmdbStatus('Kein Token hinterlegt. TMDB ist deaktiviert.', 'info'); }
    if(!cfg?.tmdbEnabled){ setTmdbStatus('Hinweis: TMDB in config.json deaktiviert (tmdbEnabled=false).', 'info'); }
    // Optional: Auto-Check bei geöffnetem Dialog
    if(token){
      (async()=>{
        setTmdbStatus('Prüfe Token...', 'pending');
        try{
          const svc = await import('./services/tmdb.js');
          const res = await svc.validateToken?.(token);
          if(res && res.ok){
            setUseTmdbAvailability(true);
            if(res.as==='bearer') setTmdbStatus('Token gültig (v4 Bearer).', 'success');
            else if(res.as==='apikey') setTmdbStatus('API Key gültig (v3). Tipp: dauerhaft in site/config.json unter "tmdbApiKey" eintragen.', 'success');
          }else{
            setUseTmdbAvailability(false);
            if(res?.hint==='looksV3') setTmdbStatus('Eingegebener Wert sieht wie ein v3 API Key aus. Bitte in config.json als "tmdbApiKey" eintragen oder v4 Bearer Token verwenden.', 'error');
            else setTmdbStatus('Token ungültig oder keine Berechtigung (401).', 'error');
          }
        }catch(e){ setTmdbStatus('Prüfung fehlgeschlagen. Netzwerk/Browser-Konsole prüfen.', 'error'); }
      })();
    } else { setUseTmdbAvailability(!!(cfg&&cfg.tmdbApiKey)); }
    try{
      const layout = getModalLayout();
      modalLayoutRadios.forEach(radio=>{ radio.checked = radio.value === layout; });
    }catch{}
  }

  tmdbSave && tmdbSave.addEventListener('click', async ()=>{
    const raw = String(tmdbInput?.value||'').trim();
    try{ localStorage.setItem('tmdbToken', raw); }catch{}
    if(!raw){ setTmdbStatus('Kein Token hinterlegt. TMDB ist deaktiviert.', 'info'); setUseTmdbAvailability(!!(cfg&&cfg.tmdbApiKey)); return; }
    setTmdbStatus('Prüfe Token...', 'pending');
    try{
      const svc = await import('./services/tmdb.js');
      const res = await svc.validateToken?.(raw);
      if(res && res.ok){
        setUseTmdbAvailability(true);
        setUseTmdbAvailability(true);
        if(res.as==='bearer') setTmdbStatus('Token gültig (v4 Bearer).', 'success');
        else if(res.as==='apikey') setTmdbStatus('API Key gültig (v3). Tipp: dauerhaft in site/config.json unter "tmdbApiKey" eintragen.', 'success');
      }else{
        setUseTmdbAvailability(false);
        setUseTmdbAvailability(false);
        if(res?.hint==='looksV3') setTmdbStatus('Eingegebener Wert sieht wie ein v3 API Key aus. Bitte in config.json als "tmdbApiKey" eintragen oder v4 Bearer Token verwenden.', 'error');
        else setTmdbStatus('Token ungültig oder keine Berechtigung (401).', 'error');
      }
    }catch(e){ setTmdbStatus('Prüfung fehlgeschlagen. Netzwerk/Browser-Konsole prüfen.', 'error'); }
  });

  tmdbTest && tmdbTest.addEventListener('click', async ()=>{
    const raw = String(tmdbInput?.value||'').trim();
    if(!raw){ setTmdbStatus('Bitte Token eingeben.', 'error'); return; }
    setTmdbStatus('Prüfe Token...', 'pending');
    try{
      const svc = await import('./services/tmdb.js');
      const res = await svc.validateToken?.(raw);
      if(res && res.ok){
        if(res.as==='bearer') setTmdbStatus('Token gültig (v4 Bearer).', 'success');
        else if(res.as==='apikey') setTmdbStatus('API Key gültig (v3). Tipp: dauerhaft in site/config.json unter "tmdbApiKey" eintragen.', 'success');
      }else{
        if(res?.hint==='looksV3') setTmdbStatus('Eingegebener Wert sieht wie ein v3 API Key aus. Dieser funktioniert hier nicht als Bearer. Bitte in config.json als "tmdbApiKey" eintragen oder v4 Bearer Token verwenden.', 'error');
        else setTmdbStatus('Token ungültig oder keine Berechtigung (401).', 'error');
      }
    }catch(e){ setTmdbStatus('Prüfung fehlgeschlagen. Netzwerk/Browser-Konsole prüfen.', 'error'); }
  });
  tmdbClear && tmdbClear.addEventListener('click', ()=>{ import('./services/tmdb.js').then(m=>m.clearCache?.()); });
  reduce && reduce.addEventListener('change', ()=>{
    try{ localStorage.setItem('prefReduceMotion', reduce.checked ? '1' : '0'); }catch{}
    document.documentElement.classList.toggle('reduce-motion', reduce.checked);
  });
  useTmdb && useTmdb.addEventListener('change', ()=>{
    try{ localStorage.setItem('useTmdb', useTmdb.checked ? '1' : '0'); }catch{}
    // Start TMDB hydration when enabling the toggle (if not already started)
    if(useTmdb.checked && !window.__tmdbHydrationStarted){
      window.__tmdbHydrationStarted = 1;
      import('./services/tmdb.js').then(m=>{
        const s = getState();
        m.hydrateOptional?.(s.movies, s.shows, s.cfg);
      }).catch(()=>{});
      // Re-render a bit later to reflect incoming posters
      setTimeout(()=>{ if(useTmdb.checked) renderGrid(getState().view); }, 1200);
      setTimeout(()=>{ if(useTmdb.checked) renderGrid(getState().view); }, 3000);
    }
    renderGrid(getState().view);
  });
  modalLayoutRadios.forEach(radio=>{
    radio.addEventListener('change', ()=>{
      if(!radio.checked) return;
      setModalLayout(radio.value === 'v2' ? 'v2' : 'v1');
    });
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
