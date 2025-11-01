// Modal V3 Debug Script – Hero Pipeline Edition
// Kopiere diesen Code in die Browser-Console, nachdem du ein Modal geöffnet hast.
// Das Script prüft Backdrop, Cast & Poster und zeigt den aktuellen Hero-Pipeline-Status.
// Es lädt zusätzlich die Live-Daten aus /api/hero/movies und /api/hero/series.
// Wiederhole den Aufruf nach einem View-Wechsel oder einer Hero-Aktualisierung.

(async function runModalDebug(){
  console.log('=== Modal V3 Debug Script ===');

  // 1. Prüfe ob ein Modal offen ist
  const shell = document.querySelector('[data-modalv3-shell]');
  console.log('Modal gefunden:', !!shell);

  if (!shell) {
    console.error('❌ Kein Modal V3 gefunden! Bitte öffne zuerst ein Film/Serien-Modal.');
    console.log('\n=== Debug Script Ende ===');
    return;
  }

  console.log('✅ Modal V3 ist geöffnet');

  // 2. Prüfe Backdrop
  const backdrop = shell.querySelector('[data-v3-head-backdrop]');
  console.log('\n--- Backdrop ---');
  console.log('Backdrop Element:', backdrop);
  console.log('Backdrop background-image:', backdrop?.style.backgroundImage);
  console.log('Backdrop data-state:', backdrop?.dataset.state);
  console.log('Backdrop data-src:', backdrop?.dataset.src);
  console.log('Backdrop data-source:', backdrop?.dataset.source);

  // 3. Prüfe Cast-Bilder
  const castCards = shell.querySelectorAll('.v3-cast-card');
  console.log('\n--- Cast ---');
  console.log('Anzahl Cast-Karten gefunden:', castCards.length);

  if (castCards.length > 0) {
    const firstCard = castCards[0];
    const img = firstCard.querySelector('img');
    console.log('Erste Cast-Karte:', firstCard);
    console.log('Erstes Cast-Bild:', img);
    console.log('Cast-Bild src:', img?.src);
    console.log('Cast-Bild alt:', img?.alt);
    console.log('Cast-Bild loading-Status:', img?.complete ? 'geladen' : 'lädt noch');

    // Zeige alle Cast-Bild-URLs
    const allCastImages = Array.from(castCards).map((card, i) => {
      const img = card.querySelector('img');
      return {
        index: i,
        name: card.getAttribute('aria-label'),
        src: img?.src || 'KEIN BILD',
        hasImage: card.querySelector('.has-image') !== null
      };
    });
    console.table(allCastImages);
  } else {
    console.warn('⚠️ Keine Cast-Karten gefunden');
  }

  // 4. Prüfe Poster
  const posterImg = shell.querySelector('[data-v3-poster-image]');
  console.log('\n--- Poster ---');
  console.log('Poster Bild:', posterImg);
  console.log('Poster src:', posterImg?.src);
  console.log('Poster data-poster-url:', posterImg?.dataset.posterUrl);

  // 5. Hero-Pipeline-Zustand einlesen
  console.log('\n--- Hero Pipeline (Frontend) ---');
  const globalPipeline = getGlobalHeroPipeline();
  if (globalPipeline) {
    console.log('window.__PLEX_EXPORTER__.heroPipeline:', globalPipeline);
  } else {
    console.warn('⚠️ Kein Hero-Pipeline-State auf window.__PLEX_EXPORTER__ gefunden.');
  }

  const pipelineModule = await loadHeroPipelineModule();
  if (pipelineModule && typeof pipelineModule.getDebugSnapshot === 'function') {
    try {
      const snapshot = pipelineModule.getDebugSnapshot();
      console.log('HeroPipeline.getDebugSnapshot():', snapshot);
    } catch (err) {
      console.warn('⚠️ Konnte HeroPipeline.getDebugSnapshot() nicht ausführen:', err?.message || err);
    }
  } else {
    console.warn('⚠️ HeroPipeline-Modul konnte nicht geladen werden.');
  }

  // 6. Live-API-Daten der Hero-Pipeline abrufen
  console.log('\n--- Hero Pipeline (API) ---');
  await logHeroApi('movies');
  await logHeroApi('series');

  console.log('\n=== Debug Script Ende ===');
  console.log('Wenn keine Bilder geladen werden, prüfe:');
  console.log('1. Sind backdrop_path/profile_path in den API-Daten vorhanden?');
  console.log('2. Wird HeroPipeline.getDebugSnapshot() korrekt aktualisiert?');
  console.log('3. Gibt es Netzwerk- oder CORS-Fehler im Netzwerk-Tab?');
})().catch(err => {
  console.error('❌ Debug Script abgebrochen:', err?.message || err);
});

function getGlobalHeroPipeline(){
  try {
    return window?.__PLEX_EXPORTER__?.heroPipeline || null;
  } catch (_err) {
    return null;
  }
}

async function loadHeroPipelineModule(){
  const globalModule = getGlobalHeroPipeline();
  if (globalModule && typeof globalModule.getDebugSnapshot === 'function') {
    return globalModule;
  }

  const moduleKeys = [
    'apps/frontend/src/features/hero/pipeline.js',
    '/apps/frontend/src/features/hero/pipeline.js',
    './features/hero/pipeline.js',
    'features/hero/pipeline',
    'hero/pipeline'
  ];

  const registries = [
    window.__PlexExporterModules,
    window.__PLEX_EXPORTER_MODULES__,
    window?.__PLEX_EXPORTER__?.modules,
    window?.__PLEX_EXPORTER__?.debug?.modules
  ].filter(Boolean);

  for (const registry of registries) {
    for (const key of moduleKeys) {
      try {
        let entry = typeof registry.get === 'function' ? registry.get(key) : registry[key];
        if (!entry) continue;
        if (typeof entry.then === 'function') {
          entry = await entry;
        } else if (typeof entry === 'function') {
          entry = await entry();
        }
        if (!entry) continue;
        if (typeof entry.getDebugSnapshot === 'function') {
          return entry;
        }
        if (entry.default && typeof entry.default.getDebugSnapshot === 'function') {
          return entry.default;
        }
      } catch (err) {
        console.warn('⚠️ Konnte HeroPipeline-Modul nicht aus Registry laden:', err?.message || err);
      }
    }
  }

  try {
    const module = await import(/* webpackIgnore: true */ '/dist/features/hero/pipeline.js');
    if (module?.getDebugSnapshot) return module;
    if (module?.default?.getDebugSnapshot) return module.default;
  } catch (_err) {
    // Ignorieren: Fallback nicht verfügbar
  }

  return globalModule;
}

async function logHeroApi(kind){
  const base = resolveHeroApiBase();
  const url = `${base}/${kind}`;
  try {
    const response = await fetch(url, { headers: { 'accept': 'application/json' } });
    console.log(`Hero API [${kind}] Antwort:`, {
      ok: response.ok,
      status: response.status,
      url: response.url,
      cacheControl: response.headers.get('cache-control'),
      cacheState: response.headers.get('x-cache-state'),
      contentType: response.headers.get('content-type')
    });
    const payload = await safeJson(response);
    if (payload) {
      console.log(`Hero API [${kind}] Payload:`, payload);
    } else {
      console.warn(`⚠️ Hero API [${kind}] lieferte keine JSON-Daten.`);
    }
  } catch (err) {
    console.error(`❌ Hero API [${kind}] Anfrage fehlgeschlagen:`, err?.message || err);
  }
}

function resolveHeroApiBase(){
  const override = [
    window.PLEX_EXPORTER_API_BASE,
    window.__PLEX_EXPORTER_API_BASE,
    window?.__PLEX_EXPORTER__?.apiBase
  ].find(Boolean);
  if (override) {
    try {
      const normalized = String(override).replace(/\/$/, '');
      if (normalized) {
        return `${normalized}/api/hero`;
      }
    } catch (_err) {
      // Ignorieren – fallback unten
    }
  }
  return '/api/hero';
}

async function safeJson(response){
  try {
    return await response.clone().json();
  } catch (err) {
    console.warn('⚠️ Konnte JSON nicht parsen:', err?.message || err);
    return null;
  }
}
