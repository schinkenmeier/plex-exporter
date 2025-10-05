# Architekturleitfaden

Dieser Leitfaden skizziert den Aufbau der Plex-Exporter-Weboberfläche sowie wichtige Datenflüsse und Erweiterungspunkte.

## State-Management (`site/js/state.js`)

* Der zentrale Store (`S`) hält den aktuellen View-State (`view`), die geladenen Kataloge (`movies`, `shows`), vorberechnete Facetten (`facets`), gefilterte Ergebnislisten (`filtered`) sowie Laufzeitkonfiguration (`cfg`).
* `getState()` liefert eine schreibgeschützte Referenz auf das State-Objekt und wird in nahezu allen Modulen zum Lesen des aktuellen Zustands verwendet.
* `setState(patch)` merged partielle Updates in den Store und informiert alle registrierten Listener. Es ist die einzige Stelle, an der Mutationen stattfinden sollten.
* `subscribe(fn)` erlaubt Modulen (z. B. Filter oder UI-Komponenten), auf State-Änderungen zu reagieren. Der Rückgabewert entfernt den Listener wieder.

## Datenpfade und Normalisierung (`site/js/data.js`)

* `loadMovies()` und `loadShows()` laden JSON-Daten bevorzugt aus `site/data/...` und fallen bei Bedarf auf eingebettete `<script>`-Tags, globale Variablen oder alternative Legacy-Pfade zurück. Jede erfolgreiche Quelle wird in `lastSources` protokolliert (`getSources()`).
* `loadShowDetail(item)` lädt Detailseiten für Serien lazy nach und cached Ergebnisse per `cacheKeys()` in `showDetailCache`, damit Modals nicht erneut angefragt werden müssen.
* `prefixMovieThumb()`, `prefixShowThumb()` und `prefixShowTree()` normalisieren Poster-Pfade (inkl. URL-Encoding), sodass das Grid konsistent auf `thumbFile` zugreifen kann.
* `buildFacets()` existiert aus Kompatibilitätsgründen; die aktuelle UI verwendet `Filter.computeFacets()` für erweiterte Aggregationen.

## Filter- und Rendering-Layer (`site/js/filter.js`, `site/js/grid.js`)

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

* Watchlist (`site/js/watchlist.js`)
  * Speichert Einträge unter `watchlist:v1` in `localStorage` und identifiziert Titel anhand kombinierter Schlüssel (`movie|show` + ID).
  * `initUi()` bindet Buttons im Header/Panel, aktualisiert `watchlistCount` und erlaubt Export/Clear-Operationen.
* TMDB-Service (`site/js/services/tmdb.js`)
  * `hydrateOptional(movies, shows, cfg)` läuft idle und reichert Titel optional mit Poster/Backdrop-URLs an, sofern `cfg.tmdbEnabled` und ein Token (`localStorage.tmdbToken` oder `cfg.tmdbApiKey`) vorhanden sind.
  * Ergebnisse werden in einem lokalen Cache (`tmdbCache`) persistiert; `clearCache()` leert diesen.
* Debug-Overlay (`site/js/debug.js`)
  * `initDebugUi()` hängt das Panel an den DOM, zeigt State-Zusammenfassungen (`getState()`) sowie Datenquellen (`getSources()`) an und erlaubt das Kopieren eines JSON-Reports.

## Serien-Split-Workflow (`tools/split_series.mjs`)

1. Erwartet ein Serien-Export-JSON und ein Ausgabeverzeichnis (`node tools/split_series.mjs <input> <out>`).
2. Normalisiert Serien-, Staffel- und Episodenobjekte (`normalizeSeriesObject`, `normalizeSeasonObject`, `normalizeEpisodeObject`).
3. Schreibt pro Serie eine Detaildatei nach `<out>/details/<ratingKey>.json` und baut einen sortierten Index (`series_index.json`) für das Frontend.
4. Protokolliert mögliche Warnungen (z. B. sehr große Detail-Dateien) auf `stderr`.

## Boot-Sequenz (`site/js/main.js`)

1. `boot()` setzt zunächst Motion-Preferences (`applyReduceMotionPref()`), zeigt Loader/Skeleton.
2. Lädt `config.json` (`fetch`) und setzt `cfg` + Start-View im State.
3. Ruft sequentiell `Data.loadMovies()` und `Data.loadShows()` auf; Fortschrittstexte werden via `setLoader()` aktualisiert.
4. Berechnet Facetten (`Filter.computeFacets()`), speichert Kataloge & Facetten im State und initialisiert Filter-UI (`Filter.renderFacets()`, `Filter.initFilters()`).
5. Baut die Ansicht (`renderSwitch()`, `renderStats(true)`, `renderFooterMeta()`, `renderGrid()`) und versteckt anschließend den Loader.
6. Startet optionale Module: TMDB-Hydration (per `requestIdleCallback`), Watchlist (`Watch.initUi()`), Settings-Overlay, Advanced-Filter-Toggle, Header/Scroll-Helfer sowie Debug-Overlay. Der Scroll-Orchestrator respektiert `prefers-reduced-motion` bzw. den Einstellungen-Toggle und deaktiviert in diesem Fall das automatische Ausblenden von Hero & Filterbar.
7. Ein `hashchange`-Listener unterstützt View-Wechsel (`#/movies`, `#/shows`) und öffnet bei `#/movie/<id>` bzw. `#/show/<id>` die Detail-Modal (`openMovieModalV2()`/`openSeriesModalV2()`).

## Modal-System (`site/js/modalV2.js`)

* **Zentrale Steuerung:**
  * Module importieren `openMovieModalV2()` und `openSeriesModalV2()` direkt aus `site/js/modalV2.js`. Das Cinematic-Modal ist die einzige Detailansicht und benötigt keinen zusätzlichen Wrapper.

* **Cinematic-Modal (`site/js/modalV2.js`):**
  * Baut die strukturierte Oberfläche aus Kopfbereich, Schnellinfos, Tabs und Content-Panes. `renderModalV2()` erzeugt das Markup und delegiert an spezialisierte Updater (`populateHead()`, `updateOverview()`, `updateDetails()`, `updateCast()`).
  * Die Tab-Navigation (`applyTabs()`) setzt ARIA-Rollen, Tastatur-Shortcuts (Links/Rechts, Home/End) und steuert Sichtbarkeit/Focus der Pane-Inhalte (`data-pane`). Damit lassen sich Überblick, Detail-Gitter, Staffeln und Cast parallel vorhalten.
  * `updateDetails()` generiert das mehrspaltige „Details-Grid“ (Sektionen für Allgemein, Genres, Credits). `updateCast()` erstellt Cast-Karten inkl. TMDB/Thumb-Auflösung, fallback auf Initialen sowie Rollenbeschriftung. `populateHead()` liefert Schnellinfos, Chip-Gruppen und Poster-Handling inklusive Lazy-Loading-Indikator.
  * Einbettung externer Aktionen geschieht zentral in `setExternalLinks()`: Die Funktion aktiviert/deaktiviert TMDB-/IMDb-Links und Trailer-Button (öffnet neues Tab via `window.open`).
  * Demo-Datensätze für Debug- und Showcase-Szenarien liegen ausgelagert in `site/js/modal/demoData.js` und werden erst bei Bedarf via Dynamic Import geladen (`openMovieModalV2('demo')`/`openSeriesModalV2('demo')`). Reguläre Builds werden so nicht mit den Beispielpayloads gebündelt.

* **Hilfsmodule & Zusammenspiel:**
  * Staffel-/Episodenlisten rendert `site/js/modal/seasonsAccordion.js`, das aus Staffel-Objekten Akkordeon-Karten mit Lazy-Poster, Episoden-Badges und Toggle-Verhalten erzeugt. Das Cinematic-Modal bindet die Ausgabe im Tab „Staffeln“ über `renderSeasonsAccordion()` ein.
  * Neue externe Links/Tabs werden zentral über `setExternalLinks()` und `applyTabs()` in `modalV2.js` gepflegt. Für zusätzliche Tabs genügt es, in `renderModalV2()` einen weiteren Button + Pane anzulegen und ihn im Tab-Controller zu berücksichtigen. Externe Aktionen folgen dem bestehenden Muster: Button oder Link markieren, Attribut-/`hidden`-Status dynamisch setzen.

## Erweiterungspunkte

* **Weitere Datenquellen:** `site/js/data.js` ist der zentrale Einstieg; neue Loader (z. B. für Musikbibliotheken) können nach dem Muster von `loadMovies()`/`loadShows()` implementiert und im State abgelegt werden.
* **Neue Filterkriterien:** Ergänzungen lassen sich in `Filter.getFilterOpts()` und `Filter.applyFilters()` integrieren. UI-Elemente können über `renderFacets()` bzw. zusätzliche DOM-Knoten angebunden werden.
* **Rendering-Erweiterungen:** Spezialkarten oder zusätzliche Aktionen können in `site/js/grid.js` über neue Helper (`cardEl`-Varianten) eingebunden werden. Exportierte Utilities (`renderGrid`, `groupCollectionsIfEnabled`) erleichtern Wiederverwendung.
* **Services & Integrationen:** Neue Hintergrunddienste (z. B. weitere Metadaten-Anbieter) können als Module unter `site/js/services/` abgelegt werden. `boot()` ist der passende Ort, sie nach Bedarf zu initialisieren.
* **Watchlist-Änderungen:** `Watch.toggle`, `Watch.renderPanel` und `Watch.exportJson` liefern Einstiegspunkte für alternative Persistenz (z. B. Remote-API). Ein eigener Storage-Adapter ließe sich an den Aufrufen in `watchlist.js` austauschen.
* **Debug/Diagnostics:** `site/js/debug.js` kann erweitert werden, um zusätzliche State- oder Umgebungsinformationen bereitzustellen. `getSources()` dient dabei als Referenz für Datenpfade.

Weiterführende Referenzen:

* `site/js/main.js`
* `site/js/filter.js`
* `site/js/grid.js`
* `site/js/services/tmdb.js`
* `site/js/watchlist.js`
* `site/js/debug.js`
* `tools/split_series.mjs`

