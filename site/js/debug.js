import { getState } from './state.js';
import { getSources } from './data.js';

export function initDebugUi(){
  const open = document.getElementById('openDebug');
  if(open){ open.addEventListener('click', ()=>{ openPanel(); }); }
}

function openPanel(){
  let overlay = document.getElementById('debugOverlay');
  if(!overlay){ overlay = document.createElement('div'); overlay.id='debugOverlay'; overlay.className='debug-overlay';
    overlay.innerHTML = `
      <div class="debug-dialog">
        <div class="debug-header"><h2>Debug</h2></div>
        <div class="debug-body"><pre id="debugPre" class="debug-pre"></pre></div>
        <div class="debug-actions">
          <button id="debugCopy" class="btn">Copy report</button>
          <button id="debugClose" class="btn">Schließen</button>
        </div>
      </div>`;
    document.body.append(overlay);
  }
  overlay.hidden = false;
  render();
  overlay.addEventListener('click', (ev)=>{ if(ev.target===overlay) closePanel(); });
  document.getElementById('debugClose')?.addEventListener('click', closePanel, { once:true });
  document.getElementById('debugCopy')?.addEventListener('click', copyReport, { once:true });
}

function closePanel(){ const overlay = document.getElementById('debugOverlay'); if(overlay) overlay.hidden = true; }

function render(){
  const pre = document.getElementById('debugPre'); if(!pre) return;
  const s = getState();
  const src = getSources();
  const cfg = s.cfg||{};
  const report = {
    view: s.view,
    counts: { movies: (s.movies||[]).length, shows: (s.shows||[]).length, filtered: (s.filtered||[]).length },
    dataSources: src,
    tmdb: { enabled: !!cfg.tmdbEnabled, lang: cfg.lang, tokenPresent: !!(localStorage.getItem('tmdbToken')||cfg.tmdbApiKey) },
    useTmdbImages: localStorage.getItem('useTmdb')==='1',
    reduceMotion: localStorage.getItem('prefReduceMotion')==='1',
    locationHash: location.hash,
    userAgent: navigator.userAgent,
  };
  pre.textContent = JSON.stringify(report, null, 2);
}

function copyReport(){
  const pre = document.getElementById('debugPre'); if(!pre) return;
  const txt = pre.textContent || '';
  navigator.clipboard?.writeText(txt).catch(()=>{
    try{ const ta=document.createElement('textarea'); ta.value=txt; document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); }catch{}
  });
}

