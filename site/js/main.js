import { setState, getState } from './state.js';
import { showLoader, setLoader, hideLoader, showSkeleton, clearSkeleton } from './loader.js';
import * as Data from './data.js';
import * as Filter from './filter.js';
import { renderGrid } from './grid.js';
import { openMovieModalV2, openSeriesModalV2 } from './modalV2.js';
import { hydrateOptional } from './services/tmdb.js';
import * as Watch from './watchlist.js';
import * as Debug from './debug.js';
import { humanYear, formatRating, useTmdbOn } from './utils.js';

let currentHeroItem = null;
let heroDefaults = null;

function setFooterStatus(message, busy=true){
  const footer = document.getElementById('footerMeta');
  if(footer){
    footer.textContent = message;
    footer.dataset.state = busy ? 'loading' : 'ready';
  }
  const grid = document.getElementById('grid');
  if(grid){
    grid.setAttribute('aria-busy', busy ? 'true' : 'false');
  }
}

async function boot(){
  applyReduceMotionPref();
  showLoader();
  setFooterStatus('Initialisiere …', true);
  setLoader('Initialisiere …', 8);
  showSkeleton(18);

  const cfg = await fetch('config.json').then(r=>r.json()).catch(()=>({ startView:'movies', tmdbEnabled:false }));
  setState({ cfg, view: cfg.startView || 'movies' });

  setFooterStatus('Filme laden …', true);
  setLoader('Filme laden …', 25);
  const movies = await Data.loadMovies();
  setFooterStatus('Serien laden …', true);
  setLoader('Serien laden …', 45);
  const shows  = await Data.loadShows();

  setFooterStatus('Filter vorbereiten …', true);
  setLoader('Filter vorbereiten …', 60);
  // build facets (richer set via Filter)
  const facets = Filter.computeFacets(movies, shows);
  setState({ movies, shows, facets });

  setFooterStatus('Ansicht aufbauen …', true);
  setLoader('Ansicht aufbauen …', 85);
  clearSkeleton();
  renderSwitch();
  Filter.renderFacets(facets);
  Filter.initFilters();
  Filter.applyFilters();
  renderStats(true);
  renderGrid(getState().view);
  renderFooterMeta();

  hideLoader();

  if(cfg.tmdbEnabled) (window.requestIdleCallback || setTimeout)(()=> hydrateOptional?.(movies, shows, cfg), 400);

  Watch.initUi();
  initSettingsOverlay(cfg);
  initAdvancedToggle();
  initHeaderInteractions();
  initScrollProgress();
  initScrollTop();
  renderHeroHighlight();
  Debug.initDebugUi();
  // Re-render grid on TMDB hydration progress to reveal new posters
  let tmdbRaf;
  window.addEventListener('tmdb:chunk', ()=>{
    if(tmdbRaf) return; // throttle to animation frame
    tmdbRaf = requestAnimationFrame(()=>{
      tmdbRaf = null;
      try{
        if(localStorage.getItem('useTmdb')==='1'){
          renderGrid(getState().view);
          renderHeroHighlight();
        }
      }catch{}
    });
  });
  window.addEventListener('tmdb:done', ()=>{
    try{
      if(localStorage.getItem('useTmdb')==='1'){
        renderGrid(getState().view);
        renderHeroHighlight();
      }
    }catch{}
  });
}

window.addEventListener('hashchange', ()=>{
  if(window.__skipNextHashNavigation){
    try{ window.__skipNextHashNavigation = false; }
    catch{}
    return;
  }
  const hash = location.hash || '';
  // deep link to views
  if(/^#\/(movies|shows)$/.test(hash)){
    const view = hash.includes('shows') ? 'shows' : 'movies';
    setState({ view });
    const result = Filter.applyFilters();
    renderSwitch();
    renderGrid(view);
    renderHeroHighlight(result);
    return;
  }
  // item details
  const m = hash.match(/^#\/(movie|show)\/(.+)/);
  if(!m) return;
  const [ , kind, id ] = m;
  const pool = kind==='movie' ? getState().movies : getState().shows;
  const item = (pool||[]).find(x => (x?.ids?.imdb===id || x?.ids?.tmdb===id || String(x?.ratingKey)===id));
  if(!item) return;
  if(kind === 'show') openSeriesModalV2(item);
  else openMovieModalV2(item);
});

function renderSwitch(){
  const root = document.getElementById('libraryTabs');
  if(!root) return;
  const buttons = Array.from(root.querySelectorAll('[data-lib]'));
  const current = getState().view === 'shows' ? 'shows' : 'movies';
  buttons.forEach(btn => {
    const target = btn.dataset.lib === 'series' ? 'shows' : 'movies';
    const isActive = current === target;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    if(btn.dataset.bound === 'true') return;
    btn.addEventListener('click', () => {
      const view = btn.dataset.lib === 'series' ? 'shows' : 'movies';
      if(getState().view === view) return;
      setState({ view });
      try{ window.__skipNextHashNavigation = true; }catch{}
      location.hash = view === 'movies' ? '#/movies' : '#/shows';
      renderSwitch();
      const result = Filter.applyFilters();
      renderGrid(view);
      renderHeroHighlight(result);
    });
    btn.dataset.bound = 'true';
  });
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
  el.dataset.state = 'ready';
  const grid = document.getElementById('grid');
  if(grid){ grid.setAttribute('aria-busy', 'false'); }
}

function renderHeroHighlight(listOverride){
  const hero = document.getElementById('hero');
  const title = document.getElementById('heroTitle');
  const subtitle = document.getElementById('heroSubtitle');
  const cta = document.getElementById('heroCta');
  if(!hero || !title || !subtitle || !cta) return;

  ensureHeroDefaults();
  const candidate = selectHeroItem(listOverride);

  if(!candidate){
    currentHeroItem = null;
    title.textContent = heroDefaults.title;
    subtitle.textContent = heroDefaults.subtitle;
    subtitle.dataset.taglinePaused = '0';
    delete subtitle.dataset.heroBound;
    subtitle.classList.remove('is-fading');
    cta.textContent = heroDefaults.cta;
    cta.disabled = true;
    cta.setAttribute('aria-disabled', 'true');
    cta.removeAttribute('aria-label');
    cta.onclick = null;
    hero.style.backgroundImage = '';
    hero.classList.remove('has-poster');
    hero.dataset.heroKind = '';
    hero.dataset.heroId = '';
    return;
  }

  currentHeroItem = candidate;
  const kind = candidate.type === 'tv' ? 'show' : 'movie';
  const heroId = resolveHeroId(candidate);

  title.textContent = candidate.title || heroDefaults.title;
  subtitle.textContent = heroSubtitleText(candidate);
  subtitle.dataset.taglinePaused = '1';
  subtitle.dataset.heroBound = '1';
  subtitle.classList.remove('is-fading');

  const ctaLabel = kind === 'show' ? 'Serien-Details öffnen' : 'Film-Details öffnen';
  cta.textContent = ctaLabel;
  cta.disabled = false;
  cta.setAttribute('aria-disabled', 'false');
  cta.setAttribute('aria-label', candidate.title ? `${ctaLabel}: ${candidate.title}` : ctaLabel);
  cta.onclick = ()=> openHeroModal(candidate, kind, heroId);

  hero.dataset.heroKind = kind;
  hero.dataset.heroId = heroId || '';

  const background = resolveHeroBackdrop(candidate);
  if(background){
    hero.style.backgroundImage = `url(${background})`;
    hero.classList.add('has-poster');
  }else{
    hero.style.backgroundImage = '';
    hero.classList.remove('has-poster');
  }
}

function ensureHeroDefaults(){
  if(heroDefaults) return;
  heroDefaults = {
    title: document.getElementById('heroTitle')?.textContent || '',
    subtitle: document.getElementById('heroSubtitle')?.textContent || '',
    cta: document.getElementById('heroCta')?.textContent || '',
  };
}

function selectHeroItem(listOverride){
  if(Array.isArray(listOverride)){
    const playableOverride = listOverride.filter(isPlayableHeroItem);
    if(!playableOverride.length) return null;
    return chooseHeroCandidate(playableOverride);
  }
  const source = heroCandidatesFromState();
  const playable = source.filter(isPlayableHeroItem);
  if(!playable.length) return null;
  return chooseHeroCandidate(playable);
}

function chooseHeroCandidate(list){
  if(list.length === 1) return list[0];
  const index = Math.floor(Math.random() * list.length);
  const candidate = list[index];
  if(currentHeroItem && list.length > 1 && candidate === currentHeroItem){
    const alt = list.find(item=> item !== currentHeroItem);
    return alt || candidate;
  }
  return candidate;
}

function heroCandidatesFromState(){
  const state = getState();
  const view = state.view === 'shows' ? 'shows' : 'movies';
  const filtered = Array.isArray(state.filtered) && state.filtered.length ? state.filtered : null;
  const list = filtered || (view === 'shows' ? state.shows : state.movies) || [];
  return Array.isArray(list) ? list : [];
}

function isPlayableHeroItem(item){
  return Boolean(item) && typeof item === 'object' && !item.isCollectionGroup && item.type !== 'collection';
}

function heroSubtitleText(item){
  const meta = [];
  const year = humanYear(item);
  if(year) meta.push(String(year));
  const runtime = heroRuntimeText(item);
  if(runtime) meta.push(runtime);
  const rating = Number(item?.rating ?? item?.audienceRating);
  if(Number.isFinite(rating)) meta.push(`★ ${formatRating(rating)}`);
  const genres = heroGenres(item, 2);
  if(genres.length) meta.push(genres.join(', '));
  const summary = heroSummaryText(item);
  if(summary) return meta.length ? `${meta.join(' • ')} — ${summary}` : summary;
  return meta.length ? meta.join(' • ') : heroDefaults?.subtitle || '';
}

function heroRuntimeText(item){
  const raw = item?.runtimeMin ?? item?.durationMin ?? (item?.duration ? Math.round(Number(item.duration) / 60000) : null);
  const minutes = Number(raw);
  if(!Number.isFinite(minutes) || minutes <= 0) return '';
  if(item?.type === 'tv') return `~${minutes} min/Ep`;
  return `${minutes} min`;
}

function heroGenres(item, limit=3){
  const list = Array.isArray(item?.genres) ? item.genres : [];
  const names = [];
  list.forEach(entry=>{
    if(!entry) return;
    if(typeof entry === 'string'){ names.push(entry); return; }
    const name = entry.tag || entry.title || entry.name || entry.label || '';
    if(name) names.push(name);
  });
  const unique = Array.from(new Set(names));
  return unique.slice(0, Math.max(0, limit));
}

function heroSummaryText(item){
  const sources = [item?.tagline, item?.summary, item?.plot, item?.overview];
  for(const raw of sources){
    if(typeof raw !== 'string') continue;
    const text = raw.trim();
    if(text) return truncateText(text, 220);
  }
  return '';
}

function truncateText(text, maxLength){
  const str = String(text || '').trim();
  if(!str) return '';
  if(str.length <= maxLength) return str;
  return `${str.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function resolveHeroId(item){
  if(!item) return '';
  if(item?.ids?.imdb) return String(item.ids.imdb);
  if(item?.ids?.tmdb) return String(item.ids.tmdb);
  if(item?.ratingKey != null) return String(item.ratingKey);
  return '';
}

function openHeroModal(item, kind, heroId){
  if(heroId) navigateToItemHash(kind, heroId);
  if(kind === 'show') openSeriesModalV2(item);
  else openMovieModalV2(item);
}

function navigateToItemHash(kind, id){
  if(!kind || !id) return;
  const hash = `#/${kind}/${id}`;
  try{
    if(history && typeof history.pushState === 'function'){
      if(location.hash === hash && typeof history.replaceState === 'function') history.replaceState(null, '', hash);
      else history.pushState(null, '', hash);
      return;
    }
  }catch{}
  try{ window.__skipNextHashNavigation = true; }catch{}
  location.hash = hash;
}

function resolveHeroBackdrop(item){
  if(!item) return '';
  const tmdbEnabled = useTmdbOn();
  const tmdbCandidates = [
    item?.tmdb?.backdrop,
    item?.tmdb?.backdrop_path,
    item?.tmdb?.backdropPath,
    item?.tmdb?.background,
    item?.tmdb?.art,
  ];
  const localCandidates = [
    item?.art,
    item?.background,
    item?.thumbBackground,
    item?.coverArt,
    item?.thumb,
    item?.thumbFile,
  ];
  if(tmdbEnabled){
    const tmdb = tmdbCandidates.find(isValidMediaPath);
    if(tmdb) return tmdb;
  }
  const local = localCandidates.find(isValidMediaPath);
  return local || '';
}

function isValidMediaPath(value){
  return typeof value === 'string' && value.trim().length > 0;
}

window.addEventListener('filters:updated', ev=>{
  const detail = ev?.detail;
  const items = Array.isArray(detail?.items) ? detail.items : null;
  renderHeroHighlight(items);
});

boot();

// Fallback: ensure the loading overlay is not left visible
// in case an error interrupts the boot sequence.
window.addEventListener('load', ()=>{ try{ hideLoader(); }catch{} });

function initSettingsOverlay(cfg){
  const overlay = document.getElementById('settingsOverlay');
  const dialog = overlay?.querySelector('.settings-dialog');
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

  if(overlay && overlay.hidden) overlay.setAttribute('aria-hidden', 'true');

  let restoreFocus = null;
  let previousOverflow = '';
  let isOpen = false;
  const backgroundState = new Map();
  const focusSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function getFocusable(){
    if(!overlay) return [];
    return Array.from(overlay.querySelectorAll(focusSelector)).filter(el=> !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');
  }

  function focusDialog(){
    if(dialog && typeof dialog.focus === 'function') dialog.focus({ preventScroll:true });
    else if(overlay && typeof overlay.focus === 'function') overlay.focus({ preventScroll:true });
  }

  function setBackgroundInert(active){
    if(!overlay) return;
    const nodes = Array.from(document.body.children).filter(node=> node !== overlay);
    if(active){
      nodes.forEach(node=>{
        if(!backgroundState.has(node)){
          backgroundState.set(node, {
            ariaHidden: node.hasAttribute('aria-hidden') ? node.getAttribute('aria-hidden') : null,
            inert: node.hasAttribute('inert')
          });
        }
        node.setAttribute('aria-hidden', 'true');
        node.setAttribute('inert', '');
      });
    }else{
      nodes.forEach(node=>{
        const state = backgroundState.get(node);
        if(state){
          if(state.ariaHidden === null || state.ariaHidden === undefined) node.removeAttribute('aria-hidden');
          else node.setAttribute('aria-hidden', state.ariaHidden);
          if(state.inert) node.setAttribute('inert', '');
          else node.removeAttribute('inert');
          backgroundState.delete(node);
        }else{
          node.removeAttribute('aria-hidden');
          node.removeAttribute('inert');
        }
      });
      backgroundState.clear();
    }
  }

  function openOverlay(){
    if(!overlay || isOpen) return;
    isOpen = true;
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setBackgroundInert(true);
    syncSettingsUi();
    requestAnimationFrame(focusDialog);
  }

  function closeOverlay(){
    if(!overlay || !isOpen) return;
    isOpen = false;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    setBackgroundInert(false);
    document.body.style.overflow = previousOverflow;
    if(restoreFocus && typeof restoreFocus.focus === 'function'){ restoreFocus.focus(); }
    restoreFocus = null;
  }

  function handleKeydown(ev){
    if(!isOpen) return;
    if(ev.key === 'Escape'){
      ev.preventDefault();
      closeOverlay();
      return;
    }
    if(ev.key !== 'Tab') return;
    const focusable = getFocusable();
    if(!focusable.length){
      ev.preventDefault();
      focusDialog();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if(ev.shiftKey){
      if(active === first || !overlay.contains(active)){
        ev.preventDefault();
        last.focus();
      }
    }else if(active === last){
      ev.preventDefault();
      first.focus();
    }
  }

  open1 && open1.addEventListener('click', openOverlay);
  open2 && open2.addEventListener('click', ()=>{ openOverlay(); });
  close2 && close2.addEventListener('click', closeOverlay);
  overlay && overlay.addEventListener('click', (ev)=>{ if(ev.target===overlay) closeOverlay(); });
  overlay && overlay.addEventListener('keydown', handleKeydown);

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
    renderHeroHighlight();
  });
  resetFilters && resetFilters.addEventListener('click', ()=>{
    const search = document.getElementById('search'); if(search) search.value='';
    const q = document.getElementById('q'); if(q) q.value='';
    const onlyNew = document.getElementById('onlyNew'); if(onlyNew) onlyNew.checked=false;
    const yf = document.getElementById('yearFrom'); const yt = document.getElementById('yearTo'); if(yf) yf.value=''; if(yt) yt.value='';
    const col = document.getElementById('collectionFilter'); if(col) col.value='';
    document.querySelectorAll('#genreFilters .chip.active').forEach(n=>n.classList.remove('active'));
    const genreRoot = document.getElementById('genreFilters');
    if(genreRoot){
      genreRoot.dataset.state = 'empty';
      genreRoot.dataset.count = '0';
    }
    import('./filter.js').then(F=>{
      const result = F.applyFilters();
      renderGrid(getState().view);
      renderHeroHighlight(result);
    });
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
      const titleEl = document.querySelector('.site-header__brand-text .site-header__label');
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
