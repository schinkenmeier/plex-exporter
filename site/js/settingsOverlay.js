import { getState } from './state.js';
import { renderGrid } from './grid.js';

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
  headerSettingsBtn && headerSettingsBtn.addEventListener('click', openOverlay);
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
          try{ localStorage.removeItem('tmdbToken'); }
          catch(err){ console.warn('[settingsOverlay] Failed to remove tmdbToken from storage:', err?.message || err); }
          if(tmdbInput) tmdbInput.value = '';
          setUseTmdbAvailability(true);
          const m = 'Ungültiger Token entfernt. Verwende API Key aus config.json.';
          tmdbStatus.textContent = m;
          tmdbStatus.dataset.kind = 'info';
          if(tmdbBadge){ tmdbBadge.dataset.kind = 'info'; tmdbBadge.title = m; }
        }
      }
    }catch(err){ console.warn('[settingsOverlay] Failed to reset TMDB status state:', err?.message || err); }
  }

  function setUseTmdbAvailability(allowed){
    if(!useTmdb) return;
    useTmdb.disabled = !allowed;
    useTmdb.title = useTmdb.disabled ? 'Nur verfügbar mit gültigem Token oder API Key.' : '';
    if(!allowed && useTmdb.checked){
      try{ localStorage.setItem('useTmdb', '0'); }
      catch(err){ console.warn('[settingsOverlay] Failed to persist TMDB toggle state:', err?.message || err); }
      useTmdb.checked = false;
      renderGrid(getState().view);
      notifyHeroRefresh();
    }
  }

  function syncSettingsUi(){
    let token = '';
    try{ tmdbInput && (tmdbInput.value = token = (localStorage.getItem('tmdbToken')||'')); }
    catch(err){ console.warn('[settingsOverlay] Failed to read stored tmdbToken:', err?.message || err); }
    try{ reduce && (reduce.checked = localStorage.getItem('prefReduceMotion')==='1'); }
    catch(err){ console.warn('[settingsOverlay] Failed to read reduce-motion preference:', err?.message || err); }
    try{ if(useTmdb){
      useTmdb.checked = localStorage.getItem('useTmdb')==='1';
      useTmdb.disabled = !token;
      useTmdb.title = useTmdb.disabled ? 'Nur verfügbar mit gültigem Token.' : '';
    } }
    catch(err){ console.warn('[settingsOverlay] Failed to sync TMDB toggle from storage:', err?.message || err); }
    try{ setUseTmdbAvailability(!!token || !!(cfg&&cfg.tmdbApiKey)); }
    catch(err){ console.warn('[settingsOverlay] Failed to update TMDB availability:', err?.message || err); }
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
    try{ localStorage.setItem('tmdbToken', raw); }
    catch(err){ console.warn('[settingsOverlay] Failed to persist tmdbToken:', err?.message || err); }
    if(!raw){ setTmdbStatus('Kein Token hinterlegt. TMDB ist deaktiviert.', 'info'); setUseTmdbAvailability(!!(cfg&&cfg.tmdbApiKey)); return; }
    setTmdbStatus('Prüfe Token...', 'pending');
    try{
      const svc = await import('./services/tmdb.js');
      const res = await svc.validateToken?.(raw);
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
    try{ localStorage.setItem('prefReduceMotion', reduce.checked ? '1' : '0'); }
    catch(err){ console.warn('[settingsOverlay] Failed to store reduce-motion preference:', err?.message || err); }
    notifyReduceMotion(reduce.checked);
  });
  useTmdb && useTmdb.addEventListener('change', ()=>{
    try{ localStorage.setItem('useTmdb', useTmdb.checked ? '1' : '0'); }
    catch(err){ console.warn('[settingsOverlay] Failed to store TMDB usage preference:', err?.message || err); }
    // Start TMDB hydration when enabling the toggle (if not already started)
    if(useTmdb.checked && !window.__tmdbHydrationStarted){
      window.__tmdbHydrationStarted = 1;
      import('./services/tmdb.js').then(m=>{
        const s = getState();
        m.hydrateOptional?.(s.movies, s.shows, s.cfg);
      }).catch(err=>{ console.warn('[settingsOverlay] Failed to hydrate TMDB data:', err?.message || err); });
      // Re-render a bit later to reflect incoming posters
      setTimeout(()=>{ if(useTmdb.checked) renderGrid(getState().view); }, 1200);
      setTimeout(()=>{ if(useTmdb.checked) renderGrid(getState().view); }, 3000);
    }
    renderGrid(getState().view);
    notifyHeroRefresh();
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
      notifyHeroRefresh(result);
    });
  });
}

