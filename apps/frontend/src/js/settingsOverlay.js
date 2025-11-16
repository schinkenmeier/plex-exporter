import { getState } from '../core/state.js';
import { renderGrid } from '../features/grid/index.js';
import * as HeroPipeline from '../features/hero/pipeline.js';

let heroRefreshHandler = null;
let reduceMotionHandler = null;

export function setHeroRefreshHandler(handler){
  heroRefreshHandler = typeof handler === 'function' ? handler : null;
}

export function setReduceMotionHandler(handler){
  reduceMotionHandler = typeof handler === 'function' ? handler : null;
}

function notifyHeroRefresh(items){
  if(heroRefreshHandler){
    try{
      heroRefreshHandler(items);
    }catch(err){
      console.warn('[settingsOverlay] Failed to trigger hero refresh handler:', err?.message);
    }
  }
}

function notifyReduceMotion(enabled){
  if(reduceMotionHandler){
    try{
      reduceMotionHandler(enabled);
    }catch(err){
      console.warn('[settingsOverlay] Failed to trigger reduce motion handler:', err?.message);
    }
  }
}

export function initSettingsOverlay(cfg){
  const overlay = document.getElementById('settingsOverlay');
  const dialog = overlay?.querySelector('.settings-dialog');
  const open1 = document.getElementById('settingsBtn');
  const open2 = document.getElementById('openSettings');
  const headerSettingsBtn = document.getElementById('headerSettingsBtn');
  const close2 = document.getElementById('settingsClose2');
  const reduce = document.getElementById('prefReduceMotion');
  const resetFilters = document.getElementById('resetFilters');
  const body = overlay?.querySelector('.settings-body');

  let heroStatus = document.getElementById('heroCacheStatus');
  let heroRefreshMovies = document.getElementById('heroRefreshMovies');
  let heroRefreshShows = document.getElementById('heroRefreshShows');
  let heroRefreshAll = document.getElementById('heroRefreshAll');

  if(!heroStatus && body){
    const heroRow = document.createElement('div');
    heroRow.className = 'settings-row';
    heroRow.innerHTML = `
      <div class="settings-inline" id="heroRefreshControls">
        <button type="button" id="heroRefreshMovies" class="secondary">Highlights Filme aktualisieren</button>
        <button type="button" id="heroRefreshShows" class="secondary">Highlights Serien aktualisieren</button>
        <button type="button" id="heroRefreshAll" class="secondary">Alle Highlights aktualisieren</button>
      </div>
      <p class="settings-help" id="heroCacheStatus" aria-live="polite"></p>
    `;
    body.append(heroRow);
    heroStatus = heroRow.querySelector('#heroCacheStatus');
    heroRefreshMovies = heroRow.querySelector('#heroRefreshMovies');
    heroRefreshShows = heroRow.querySelector('#heroRefreshShows');
    heroRefreshAll = heroRow.querySelector('#heroRefreshAll');
  }

  const heroButtons = [heroRefreshMovies, heroRefreshShows, heroRefreshAll].filter(Boolean);
  let heroTask = null;

  function setHeroButtonsDisabled(disabled, reason){
    heroButtons.forEach(btn => {
      if(!btn) return;
      btn.disabled = disabled || !HeroPipeline.isEnabled();
      if(btn.disabled && reason){ btn.dataset.heroBusy = reason; }
      else { btn.removeAttribute('data-hero-busy'); }
    });
  }

  function formatUpdated(ts){
    if(!Number.isFinite(ts) || ts <= 0) return 'unbekannt';
    try {
      return new Date(ts).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch (_err) {
      return 'unbekannt';
    }
  }

  function formatExpiry(ts){
    if(!Number.isFinite(ts) || ts <= 0) return 'kein Ablauf';
    const diff = ts - Date.now();
    if(diff <= 0) return 'abgelaufen';
    const minutes = diff / 60000;
    if(minutes < 1) return 'läuft in <1 Min ab';
    if(minutes < 60) return `läuft in ${Math.round(minutes)} Min ab`;
    const hours = minutes / 60;
    if(hours < 24) return `läuft in ${Math.round(hours)} Std ab`;
    const days = hours / 24;
    return `läuft in ${Math.round(days)} Tg ab`;
  }

  function describeHeroStatus(label, status){
    if(!status) return `${label}: keine Daten`;
    if(status.state === 'disabled') return `${label}: deaktiviert`;
    if(status.state === 'loading' || status.regenerating) return `${label}: wird aktualisiert …`;
    if(status.state === 'error') return `${label}: Fehler (${status.lastError || 'unbekannt'})`;
    if(status.state === 'stale'){
      return `${label}: ${status.size} Einträge (Pool veraltet)`;
    }
    const updated = formatUpdated(status.updatedAt);
    const expiry = formatExpiry(status.expiresAt);
    return `${label}: ${status.size} Einträge (Update ${updated}, ${expiry})`;
  }

  function updateHeroStatus(snapshot){
    if(!heroStatus) return;
    if(!snapshot || !HeroPipeline.isEnabled() || snapshot.enabled === false){
      heroStatus.textContent = 'Hero-Pipeline deaktiviert – statisches Fallback aktiv.';
      setHeroButtonsDisabled(true, 'disabled');
      return;
    }
    const busy = !!(snapshot.status?.movies?.regenerating || snapshot.status?.series?.regenerating);
    setHeroButtonsDisabled(busy, busy ? 'busy' : '');
    const segments = [];
    segments.push(describeHeroStatus('Filme', snapshot.status?.movies));
    segments.push(describeHeroStatus('Serien', snapshot.status?.series));
    if(snapshot.featureSource){
      segments.push(`Feature-Flag: ${snapshot.featureSource}`);
    }
    heroStatus.textContent = segments.join(' • ');
  }

  async function runHeroRegeneration(kind='all', label='Highlights aktualisieren …'){
    if(!HeroPipeline.isEnabled()) return;
    if(heroTask){
      try{ await heroTask; }catch(_err){}
    }
    if(heroStatus && label){ heroStatus.textContent = label; }
    setHeroButtonsDisabled(true, 'busy');
    const action = (kind === 'movies' || kind === 'series') ? HeroPipeline.refreshKind(kind) : HeroPipeline.refreshAll();
    heroTask = action.then(()=>{
      notifyHeroRefresh();
    }).catch(err => {
      console.warn('[settingsOverlay] Hero regeneration failed:', err?.message || err);
    }).finally(()=>{
      heroTask = null;
      setHeroButtonsDisabled(false);
    });
    return heroTask;
  }

  HeroPipeline.subscribe(updateHeroStatus);

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
  headerSettingsBtn && headerSettingsBtn.addEventListener('click', openOverlay);
  close2 && close2.addEventListener('click', closeOverlay);
  overlay && overlay.addEventListener('click', (ev)=>{ if(ev.target===overlay) closeOverlay(); });
  overlay && overlay.addEventListener('keydown', handleKeydown);

  function syncSettingsUi(){
    try{
      if(reduce){
        reduce.checked = localStorage.getItem('prefReduceMotion') === '1';
      }
    }catch(err){
      console.warn('[settingsOverlay] Failed to read reduce-motion preference:', err?.message || err);
    }
  }

  reduce && reduce.addEventListener('change', ()=>{
    try{ localStorage.setItem('prefReduceMotion', reduce.checked ? '1' : '0'); }
    catch(err){ console.warn('[settingsOverlay] Failed to store reduce-motion preference:', err?.message || err); }
    notifyReduceMotion(reduce.checked);
  });
  heroRefreshMovies && heroRefreshMovies.addEventListener('click', ()=>{
    void runHeroRegeneration('movies', 'Highlights Filme aktualisieren …');
  });
  heroRefreshShows && heroRefreshShows.addEventListener('click', ()=>{
    void runHeroRegeneration('series', 'Highlights Serien aktualisieren …');
  });
  heroRefreshAll && heroRefreshAll.addEventListener('click', ()=>{
    void runHeroRegeneration('all', 'Alle Highlights aktualisieren …');
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
    import('../features/filter/index.js').then(F=>{
      const result = F.applyFilters();
      renderGrid(getState().view);
      notifyHeroRefresh(result);
    });
  });
}
