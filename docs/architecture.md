# Architekturleitfaden

Dieser Leitfaden skizziert den Aufbau der Plex-Exporter-Weboberfläche, das neue Backend-Grundgerüst sowie wichtige Datenflüsse und Erweiterungspunkte.

## Backend-Grundlagen (`apps/backend`)

* **Server (`src/server.ts`):** Startet einen Express-Server, hängt gemeinsame Middleware ein und bindet Routen (zunächst `/health`). Der Standard-Port beträgt `4000`; `npm run start --workspace @plex-exporter/backend` bootet den Server ohne Watch-Mode, `npm run dev --workspace @plex-exporter/backend` aktiviert Hot-Reload über `tsx`.
* **Health-Route (`src/routes/health.ts`):** Liefert einen minimalen JSON-Status (`{ status: 'ok', timestamp }`). Diese Route eignet sich für Container-Liveness-Checks sowie Monitoring.
* **Tests (`tests/`):** Enthält Platzhalter für künftige Unit-, Integrations- oder Contract-Tests.
* **Shared Models:** Das Backend greift perspektivisch auf Interfaces aus `packages/shared` zu, um API-Antworten und Exportdaten konsistent zum Frontend zu halten.

## State-Management (`apps/frontend/src/core/state.js`)

* Der zentrale Store (`S`) hält den aktuellen View-State (`view`), die geladenen Kataloge (`movies`, `shows`), vorberechnete Facetten (`facets`), gefilterte Ergebnislisten (`filtered`) sowie Laufzeitkonfiguration (`cfg`).
* `getState()` liefert eine schreibgeschützte Referenz auf das State-Objekt und wird in nahezu allen Modulen zum Lesen des aktuellen Zustands verwendet.
* `setState(patch)` merged partielle Updates in den Store und informiert alle registrierten Listener. Es ist die einzige Stelle, an der Mutationen stattfinden sollten.
* `subscribe(fn)` erlaubt Modulen (z. B. Filter oder UI-Komponenten), auf State-Änderungen zu reagieren. Der Rückgabewert entfernt den Listener wieder.

## Hero-Policy & Pipeline (`apps/frontend/src/features/hero/...`)

* **Policy-Layer (`hero/policy.js`):** Lädt `hero.policy.json` ohne Browser-Cache, wendet Defaults an und protokolliert Validierungswarnungen (`getValidationIssues()`). Die Policy definiert Poolgrößen, Slot-Quoten, Diversitätsgewichtungen, Rotationsintervalle und Cache-Laufzeiten. Über `getCacheTtl()` wird eine TTL/Grace-Zeit für gespeicherte Pools abgeleitet.
* **Pool-Layer (`hero/pool.js`):** Aggregiert Hero-Kandidaten aus State und Policy. Beim Aufruf von `ensureHeroPool(kind, items, { policy })` wird zunächst geprüft, ob ein gültiger Cache vorliegt (siehe Storage-Layer). Andernfalls werden Slots nach Policy quotiert, Diversität gewichtet und Historie/Fehlschläge berücksichtigt. Fortschritt wird über `hero:pool-progress` Events gesendet.
* **Normalizer (`hero/normalizer.js`):** Konvertiert Rohdaten (inkl. optionaler TMDb-Details) in ein vereinheitlichtes Schema mit Text-Clamps, IDs, Backdrops und Meta-Tags. Der Normalizer kann TMDb-Daten synchronisieren (`fetchDetailsForItem`) und versieht Ergebnisse mit Quellenangaben.
* **Storage & Cache (`hero/storage.js`):** Persistiert Pools, Historie und Fehlschlag-Listen parallel in `localStorage` (dauerhaft) und `sessionStorage` (tab-lokaler Schnellstart). Pools enthalten `expiresAt` und `policyHash`; nur Treffer innerhalb der TTL (`policy.cache.ttlHours`) oder der Grace-Periode (`policy.cache.graceMinutes`) werden rehydriert. Ein täglicher Refresh entsteht dadurch automatisch: nach Ablauf der TTL wird beim nächsten Rendern ein neuer Pool gebaut.
* **Feature-Flags (`hero/pipeline.js`):** Der Pipeline-State liest zuerst `localStorage.feature.heroPipeline` (manueller Toggle). Fehlt er, werden `config.heroPipelineEnabled` und `config.features.heroPipeline` herangezogen. Ohne explizites Flag bleibt die Pipeline aktiv. Beim Deaktivieren rendert das System das statische Fallback (`showHeroFallback()`). Pipeline-Status, Cache-Herkunft und TMDb-Rate-Limits werden über `hero:pipeline-update` Events und das Debug-Overlay sichtbar gemacht.

## Datenpfade und Normalisierung (`apps/frontend/src/js/data.js`)

* `loadMovies()` und `loadShows()` greifen ausschließlich auf die Backend-Endpoints `/api/v1/movies` bzw. `/api/v1/series` zu. Erfolgreiche Antworten werden via `fetchJson()` zwischengespeichert und in `lastSources` mit dem Präfix `api:` protokolliert (`getSources()`).
* `loadShowDetail(item)` lädt Detailseiten für Serien über `/api/v1/series/:id`, cached Ergebnisse per `cacheKeys()` in `showDetailCache` und verhindert dadurch wiederholte Requests beim Öffnen des Modals.
* `prefixMovieThumb()`, `prefixShowThumb()` und `prefixShowTree()` normalisieren Poster-Pfade auf die Thumbnail-API (`/api/thumbnails/...`) und sorgen für konsistente `thumbFile`-Attribute im Grid.

## Filter- und Rendering-Layer (`apps/frontend/src/features/filter/index.js`, `apps/frontend/src/features/grid/index.js`)

### Filter

* `computeFacets(movies, shows)` sammelt Genres, Jahrgänge und Collection-Tags aus beiden Bibliotheken und erzeugt die UI-Optionen.
* `renderFacets()` schreibt die Auswahlkomponenten (Dropdowns, Chips) in den DOM.
* `initFilters()` verbindet Suchfeld, Checkboxen und Dropdowns mit `updateFiltersAndGrid()` und sorgt für Rücksetzen einzelner Filter.
* `applyFilters()` erstellt die aktive Ergebnisliste basierend auf Suchbegriff, Jahrgangsbereich, Genres, Collections sowie Sortierung. Die gefilterten Elemente werden im State abgelegt (`setState({ filtered })`).

### Grid

* `renderGrid(view)` liest aus dem State die aktuelle Sicht (`movies` oder `shows`) bzw. das gefilterte Ergebnis und erzeugt Karten (`cardEl`) mit Postern, Metadaten und Aktionen.
* Collection-Gruppierung (`groupCollectionsIfEnabled()`) baut bei aktivierter Option virtuelle Sammlungs-Karten. Klicks auf Karten delegieren in die Detailansicht (`location.hash`).
* Interaktionen mit der Watchlist (`Watch.toggle`) und TMDB-Poster (`useTmdbOn()` aus `utils.js`) sind direkt in den Karten verdrahtet.

## Watchlist-, TMDB- und Debug-Module

* Watchlist (`apps/frontend/src/features/watchlist/index.js`)
  * Speichert Einträge unter `watchlist:v1` in `localStorage` und identifiziert Titel anhand kombinierter Schlüssel (`movie|show` + ID).
  * `initUi()` bindet Buttons im Header/Panel, aktualisiert `watchlistCount` und erlaubt Export/Clear-Operationen.
* TMDB-Service (`apps/frontend/src/services/tmdb.js`)
  * `hydrateOptional(movies, shows, cfg)` läuft idle und reichert Titel optional mit Poster/Backdrop-URLs an, sofern `cfg.tmdbEnabled` und ein Token (`localStorage.tmdbToken` oder `cfg.tmdbApiKey`) vorhanden sind.
  * Ergebnisse werden in einem lokalen Cache (`tmdbCache`) persistiert; `clearCache()` leert diesen.
* Debug-Overlay (`apps/frontend/src/js/debug.js`)
  * `initDebugUi()` hängt das Panel an den DOM, zeigt State-Zusammenfassungen (`getState()`) sowie Datenquellen (`getSources()`) an und erlaubt das Kopieren eines JSON-Reports.

## Serien-Split-Workflow (`tools/split_series.mjs`)

1. Erwartet ein Serien-Export-JSON und ein Ausgabeverzeichnis (`node tools/split_series.mjs <input> <out>`).
2. Normalisiert Serien-, Staffel- und Episodenobjekte (`normalizeSeriesObject`, `normalizeSeasonObject`, `normalizeEpisodeObject`).
3. Schreibt pro Serie eine Detaildatei nach `<out>/details/<ratingKey>.json` und baut einen sortierten Index (`series_index.json`) für das Frontend.
4. Protokolliert mögliche Warnungen (z. B. sehr große Detail-Dateien) auf `stderr`.

## Boot-Sequenz (`apps/frontend/src/main.js`)

1. `boot()` setzt zunächst Motion-Preferences (`applyReduceMotionPref()`), zeigt Loader/Skeleton.
2. Lädt `config/frontend.json` (`fetch`) und setzt `cfg` + Start-View im State. Parallel wird `HeroPolicy.initHeroPolicy()` gestartet; Validierungsfehler erscheinen im Debug-Overlay.
3. Ruft sequentiell `Data.loadMovies()` und `Data.loadShows()` auf; Fortschrittstexte werden via `setLoader()` aktualisiert.
4. Konfiguriert die Hero-Pipeline (`HeroPipeline.configure({ cfg, policy })`). Ist das Feature deaktiviert, wechselt das UI sofort in den Fallback-Modus; andernfalls prüft die Pipeline vorhandene Cache-Pools und feuert asynchrone Aufbauten an.
5. Berechnet Facetten (`Filter.computeFacets()`), speichert Kataloge & Facetten im State und initialisiert Filter-UI (`Filter.renderFacets()`, `Filter.initFilters()`).
6. Baut die Ansicht (`renderSwitch()`, `renderStats(true)`, `renderFooterMeta()`, `renderGrid()`) und versteckt anschließend den Loader.
7. Startet optionale Module: TMDB-Hydration (per `requestIdleCallback`), Watchlist (`Watch.initUi()`), Settings-Overlay (inkl. TMDb-Troubleshooting), Advanced-Filter-Toggle, Header/Scroll-Helfer sowie Debug-Overlay. Das automatische Ausblenden von Hero und Filterbar läuft primär über Scroll-Driven CSS-Animationen (`animation-timeline: scroll`); `initFilterBarAutoHideFallback()` aktiviert ein rAF-basiertes JS-Fallback in Browsern ohne Scroll-Timeline-Unterstützung und respektiert dabei Fokus-/Pointer-Interaktionen sowie die Reduce-Motion-Präferenz.
8. Ein `hashchange`-Listener unterstützt View-Wechsel (`#/movies`, `#/shows`) und öffnet bei `#/movie/<id>` bzw. `#/show/<id>` die neue Detailansicht (`openMovieDetailV3()`/`openSeriesDetailV3()`). Zusätzlich löst das Event `HeroPipeline.ensureHeroPool()` aus, um bei Bibliothekswechseln keine redundanten Requests zu erzeugen.

## Detail-System (`apps/frontend/src/features/modal/modalV3/index.js`)

* **Zentrale Steuerung:**
  * Module importieren `openMovieDetailV3()` und `openSeriesDetailV3()` direkt aus `apps/frontend/src/features/modal/modalV3/index.js`. Beide Funktionen akzeptieren IDs oder bereits geladene Datensätze, kümmern sich um Demo- und TMDB-Hydration und steuern Render-Sessions über Tokens (`startRender()`/`isCurrentRender()`).
  * `renderMediaDetail(target, viewModel, options)` rendert den Pane-Stack außerhalb des Modals (z. B. auf `apps/frontend/public/details.html`). Standardmäßig wird das Markup ersetzt; `options.layout = 'standalone'` aktiviert einen eigenständigen Card-Look.
  * Die Anwendung nutzt ausschließlich die V3-Renderer; die alten V2-Module werden nicht mehr dynamisch geladen.

* **Cinematic Shell (`apps/frontend/src/features/modal/modalV3`)**
  * `createPaneStack()` erzeugt das semantische Grundgerüst (Header, Poster-Sidebar, Tab-Stack). Spezialisierte Renderer (`header.js`, `overview.js`, `details.js`, `cast.js`, `seasons.js`) füllen die einzelnen Segmente.
  * Die Tab-Navigation (`applyTabs()`) setzt ARIA-Rollen, Tastatur-Shortcuts (Links/Rechts, Home/End) und steuert Sichtbarkeit/Focus der Pane-Inhalte (`data-pane`). Damit lassen sich Überblick, Details, Staffeln und Cast parallel vorhalten – identisch zur V2-UX, aber modularisiert.
  * `loadMovieDetailViewModel()`/`loadSeriesDetailViewModel()` kombinieren State-Daten, `Data.loadMovies()`/`Data.loadShows()`, optionale `loadShowDetail()`-Requests und TMDB-Anreicherungen (`metadataService`). Das Resultat ist das strukturierte `MediaDetailViewModel`, das Layout, Badges, Chips und Metadaten vorbefüllt.
  * Demo-Datensätze für Debug- und Showcase-Szenarien liegen weiterhin in `apps/frontend/src/js/modal/demoData.js` und werden erst bei Bedarf via Dynamic Import geladen (`openMovieDetailV3('demo')`/`openSeriesDetailV3('demo')`).

* **Hilfsmodule & Zusammenspiel:**
  * Staffel-/Episodenlisten rendert `apps/frontend/src/features/modal/modalV3/seasons.js` (Lazy-Poster, Episoden-Badges, Toggle-Verhalten). Das Modal bindet die Ausgabe im Tab „Staffeln“ über `renderSeasons()` ein.
  * Neue Tabs werden zentral über `createPaneStack()` + `applyTabs()` erweitert. Zusätzliche Abschnitte müssen nur einen Button + Pane definieren; die Tab-Logik übernimmt Fokus- und Sichtbarkeitsverwaltung automatisch.

## Erweiterungspunkte

* **Weitere Datenquellen:** `apps/frontend/src/js/data.js` ist der zentrale Einstieg; neue Loader (z. B. für Musikbibliotheken) können nach dem Muster von `loadMovies()`/`loadShows()` implementiert und im State abgelegt werden.
* **Neue Filterkriterien:** Ergänzungen lassen sich in `apps/frontend/src/features/filter/index.js` (u. a. `getFilterOpts()` und `applyFilters()`) integrieren. UI-Elemente können über `renderFacets()` bzw. zusätzliche DOM-Knoten angebunden werden.
* **Rendering-Erweiterungen:** Spezialkarten oder zusätzliche Aktionen können in `apps/frontend/src/features/grid/index.js` über neue Helper (`cardEl`-Varianten) eingebunden werden. Exportierte Utilities (`renderGrid`, `groupCollectionsIfEnabled`) erleichtern Wiederverwendung.
* **Services & Integrationen:** Neue Hintergrunddienste (z. B. weitere Metadaten-Anbieter) können als Module unter `apps/frontend/src/services/` abgelegt werden. `boot()` ist der passende Ort, sie nach Bedarf zu initialisieren.
* **Watchlist-Änderungen:** `Watch.toggle`, `Watch.renderPanel` und `Watch.exportJson` liefern Einstiegspunkte für alternative Persistenz (z. B. Remote-API). Ein eigener Storage-Adapter ließe sich an den Aufrufen in `apps/frontend/src/features/watchlist/index.js` austauschen.
* **Debug/Diagnostics:** `apps/frontend/src/js/debug.js` kann erweitert werden, um zusätzliche State- oder Umgebungsinformationen bereitzustellen. `getSources()` dient dabei als Referenz für Datenpfade.

## Shared Models (`packages/shared/src/index.ts`)

* `MediaItem` und `MediaLibrary` beschreiben den strukturierten Plex-Export aus Sicht beider Anwendungen.
* `TmdbCredentials` vereinheitlicht die Übergabe von TMDB-Zugangsdaten (API-Key oder v4-Token).
* `HealthStatus` kann sowohl für interne Checks als auch externe Monitoring-Endpunkte verwendet werden.

## Build- und Startbefehle

* Frontend bauen: `npm run build --workspace @plex-exporter/frontend`
* Frontend-Tests: `npm run test --workspace @plex-exporter/frontend`
* Backend starten: `npm run start --workspace @plex-exporter/backend`
* Backend-Entwicklung: `npm run dev --workspace @plex-exporter/backend`
* Werkzeuge (z. B. Serien splitten): `npm run split:series --workspace @plex-exporter/tools`

Weiterführende Referenzen:

* `apps/frontend/src/main.js`
* `apps/frontend/src/core/state.js`
* `apps/frontend/src/features/filter/index.js`
* `apps/frontend/src/features/grid/index.js`
* `apps/frontend/src/services/tmdb.js`
* `apps/frontend/src/features/watchlist/index.js`
* `apps/frontend/src/js/debug.js`
* `tools/split_series.mjs`

