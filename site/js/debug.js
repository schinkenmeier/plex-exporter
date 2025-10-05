import { getState } from './state.js';
import { getSources } from './data.js';
import { getCacheStats, clearAllCache, clearExpiredCache } from './cache.js';
import * as HeroPolicy from './hero/policy.js';

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
        <div class="debug-body">
          <pre id="debugPre" class="debug-pre"></pre>
          <div class="debug-cache-controls">
            <h3>Cache-Verwaltung</h3>
            <div id="cacheStats" class="cache-stats"></div>
            <div class="cache-buttons">
              <button id="debugClearExpired" class="btn">Abgelaufene löschen</button>
              <button id="debugClearAll" class="btn">Alles löschen</button>
            </div>
          </div>
        </div>
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
  document.getElementById('debugClearExpired')?.addEventListener('click', ()=>{
    clearExpiredCache();
    render();
  }, { once:true });
  document.getElementById('debugClearAll')?.addEventListener('click', ()=>{
    if(confirm('Wirklich den gesamten Cache löschen?')){
      clearAllCache();
      render();
    }
  }, { once:true });
}

function closePanel(){ const overlay = document.getElementById('debugOverlay'); if(overlay) overlay.hidden = true; }

function render(){
  const pre = document.getElementById('debugPre'); if(!pre) return;
  const s = getState();
  const src = getSources();
  const cfg = s.cfg||{};
  const cacheStats = getCacheStats();
  const heroPolicy = HeroPolicy.getHeroPolicy();
  const heroPolicyIssues = HeroPolicy.getValidationIssues();

  const report = {
    view: s.view,
    counts: { movies: (s.movies||[]).length, shows: (s.shows||[]).length, filtered: (s.filtered||[]).length },
    dataSources: src,
    cache: cacheStats,
    heroPolicy: {
      policy: heroPolicy,
      language: HeroPolicy.getPolicyLanguage(),
      pools: HeroPolicy.getPoolSizes(),
      slots: HeroPolicy.getSlotConfig(),
      diversity: HeroPolicy.getDiversityWeights(),
      rotation: HeroPolicy.getRotationConfig(),
      textClamp: HeroPolicy.getTextClampConfig(),
      fallback: HeroPolicy.getFallbackPreference(),
      cache: HeroPolicy.getCacheTtl(),
      loadedAt: HeroPolicy.getPolicyLoadedAt(),
      issues: heroPolicyIssues
    },
    tmdb: { enabled: !!cfg.tmdbEnabled, lang: cfg.lang, tokenPresent: !!(localStorage.getItem('tmdbToken')||cfg.tmdbApiKey) },
    useTmdbImages: localStorage.getItem('useTmdb')==='1',
    reduceMotion: localStorage.getItem('prefReduceMotion')==='1',
    locationHash: location.hash,
    userAgent: navigator.userAgent,
  };
  pre.textContent = JSON.stringify(report, null, 2);

  // Update cache stats display
  const statsEl = document.getElementById('cacheStats');
  if(statsEl && cacheStats){
    statsEl.innerHTML = `
      <p>Einträge gesamt: <strong>${cacheStats.totalEntries}</strong></p>
      <p>Gültig: <strong>${cacheStats.validEntries}</strong> | Abgelaufen: <strong>${cacheStats.expiredEntries}</strong></p>
      <p>Größe: <strong>${cacheStats.totalSizeMB} MB</strong></p>
    `;
  }
}

function copyReport(){
  const pre = document.getElementById('debugPre'); if(!pre) return;
  const txt = pre.textContent || '';
  navigator.clipboard?.writeText(txt).catch(err=>{
    console.warn('[debug] Clipboard API write failed, using fallback:', err?.message || err);
    try{
      const ta=document.createElement('textarea');
      ta.value=txt;
      document.body.append(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }catch(fallbackErr){
      console.warn('[debug] Fallback clipboard copy failed:', fallbackErr?.message || fallbackErr);
    }
  });
}

