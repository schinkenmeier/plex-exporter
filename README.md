# Plex Exporter – API-gestützter Katalog

## Überblick
Der Plex Exporter stellt einen webfähigen Katalog deiner Plex-Bibliotheken bereit, der seine Inhalte zur Laufzeit vom Backend bezieht. Die Weboberfläche lebt unter `apps/frontend/` – das auslieferbare HTML befindet sich in `apps/frontend/public/`, die Quellmodule in `apps/frontend/src/`. Das Backend (`apps/backend/`) liefert konfigurierte API-Endpunkte aus (`/api/v1/movies`, `/api/v1/series`, `/api/v1/filter`) und stellt die Frontend-Bundles bereit. Gemeinsame Typdefinitionen werden unter `packages/shared/` vorgehalten und stehen sowohl Frontend als auch Backend zur Verfügung.

## Funktionsumfang
- Umschaltbare Film- und Serienansichten inklusive Deep-Linking über die URL-Fragmentnavigation (`#/movies`, `#/shows`).
- Umfangreiche Filter mit Genres, Jahrspannenauswahl, Sortierung und flexibler Kartendarstellung (gesteuert in `apps/frontend/src/main.js` und `apps/frontend/src/features/filter/index.js`).
- Schnelle Datenladewege über die Backend-Endpoints (`/api/v1/movies`, `/api/v1/series`, `/api/v1/filter`) mit integrierter Cache-Strategie (`apps/frontend/src/js/data.js`).
- Watchlist mit Export- und Importmöglichkeiten (lokal im Browser gespeichert, Logik in `apps/frontend/src/features/watchlist/index.js`).
- Debug-Overlay zur Fehlersuche mit Quellinformationen, Hero-Pipeline-Status und Filterzusammenfassung (`apps/frontend/src/js/debug.js`).
- Cinematic-Detailansicht (Modal V3) für Filme & Serien mit Sticky-Poster, Schnellinfos, Tabs und optional reduzierter Bewegung (implementiert in `apps/frontend/src/features/modal/modalV3/`).

## Projektstruktur

**Detaillierte Struktur-Dokumentation:** [docs/structure.md](docs/structure.md)

### Überblick

| Pfad | Beschreibung |
| --- | --- |
| `apps/frontend/public/index.html` | Einstiegspunkt und UI-Markup für den Katalog (wird vom Backend ausgeliefert). |
| `apps/frontend/public/details.html` | Standalone-Detailansicht, die dieselben Renderer wie das Modal nutzt und über das Backend erreichbar ist. |
| `apps/backend/src/server.ts` | Express-Server mit vorbereiteten Middleware-Hooks und Health-Routing. |
| `apps/backend/src/routes/health.ts` | Health-Check-Endpunkt für Betriebs- und Monitoring-Checks. |
| `apps/backend/tests/` | Platz für Unit- und Integrations-Tests des Backends. |
| `apps/backend/README.md` | Einstieg in das neue Backend-Paket (Ziele, nächste Schritte). |
| `apps/frontend/package.json` | npm-Skripte und Dev-Abhängigkeiten für das Frontend. |
| `apps/frontend/config/frontend.json` | Laufzeitkonfiguration (Startansicht, Sprache) für Deployments; das Build spiegelt sie nach `apps/frontend/public/config/frontend.json`. |
| `apps/frontend/config/frontend.json.sample` | Beispielkonfiguration; das Frontend-Build legt sie als `apps/frontend/public/config/frontend.json.sample` ab und nutzt sie als Fallback, falls keine reale Konfiguration existiert. |
| `apps/frontend/src/main.js` | Bootstrapping der Anwendung, Initialisierung von Filtern, Watchlist, Debug und Einstellungen. |
| `apps/frontend/public/hero.policy.json` | Steuerdatei für die Hero-Rotation (Poolgrößen, Slots, Cache-Laufzeiten). |
| `apps/frontend/src/core/` | Fundamentale Infrastruktur (State-Management, Loader, DOM-/Error-Helfer, Konfigurations- und Metadatenservice). |
| `apps/frontend/src/features/` | Feature-spezifische Module für Filter, Grid, Hero, Modals und Watchlist. |
| `apps/frontend/src/features/hero/…` | Pipeline für Hero-Highlights (Policy, Pooling, Normalisierung, Storage). |
| `apps/frontend/src/services/` | Integrationslayer für externe APIs (derzeit leer, wird bei Bedarf ergänzt). |
| `apps/frontend/src/shared/` | Gemeinsame Utilities wie Cache-Layer und Helferfunktionen. |
| `apps/frontend/src/ui/` | Präsentationsnahe Komponenten (Loader, Skeletons, Error-Toast). |
| `apps/frontend/src/js/data.js` | Datenlader für die `/api/v1/*`-Endpoints inklusive Cache-, Fehler- und Thumbnail-Normalisierung. |
| `apps/frontend/src/js/…` | Browser-nahe Helfer & Brückenmodule (Debug-Overlay, Settings-Overlay, Fallback-Skripte, Demodaten). |
| `data/exports/movies/` | Exportierte Filmdaten (`movies.json`) und optionale Posterordner (`Movie - … .images`). |
| `data/exports/series/` | Serienindex (`series_index.json`), Detaildateien (`details/<ratingKey>.json`) und Posterordner (`Show - … .images`). |
| `apps/frontend/public/assets/` | Statische Assets wie Favicons und Illustrationen. |
| `packages/shared/src/index.ts` | Gemeinsame Interfaces (z. B. `MediaItem`, `TmdbCredentials`) für Frontend & Backend. |
| `packages/shared/README.md` | Dokumentation der teilbaren Modelle. |
| `tools/split_series.mjs` | Hilfsskript zum Aufteilen großer Serien-JSONs in Index- und Detaildateien. |
| `tools/package.json` | npm-Skripte für Werkzeuge (z. B. `split:series`, Bundle-Analyse). |
| `package.json` | Workspace-Konfiguration mit Frontend-, Backend- und Shared-Paketen. |

## Workspaces & Entwicklung
Das Repository ist als npm-Workspace organisiert. Relevante Befehle:

| Befehl | Beschreibung |
| --- | --- |
| `npm run build --workspace @plex-exporter/frontend` | Baut das Frontend mit `esbuild`. |
| `npm run build:watch --workspace @plex-exporter/frontend` | Startet das inkrementelle Frontend-Build. |
| `npm run test --workspace @plex-exporter/frontend` | Führt die Frontend-Test-Suite aus. |
| `npm run start --workspace @plex-exporter/backend` | Startet den Backend-API-Server (Standard-Port `4000`). |
| `npm run dev --workspace @plex-exporter/backend` | Beobachtet den Backend-Server mit automatischem Reload. |
| `npm run split:series --workspace @plex-exporter/tools` | Teilt eine Serien-Exportdatei in Index- und Detaildateien auf. |

## Konfiguration (`apps/frontend/config/frontend.json`)
| Schlüssel | Typ | Beschreibung |
| --- | --- | --- |
| `startView` | String (`"movies"`\|`"shows"`) | Legt fest, welche Bibliothek nach dem Laden angezeigt wird. |
| `lang` | String | Sprache für UI-Texte und Datumsausgaben. |
| `features.*` | Objekt | Optionale Feature-Flags (z. B. `heroPipeline`), die beim Frontend-Boot berücksichtigt werden. |

## Datenpflege
### Filme aktualisieren
1. Exportiere deine Filmbibliothek aus Plex (oder Tautulli) als `movies.json` und kopiere die Datei nach `data/exports/movies/movies.json`.
2. Lege Poster oder Backdrops optional in eigenen Unterordnern ab (`data/exports/movies/Movie - <Titel> [<ratingKey>].images/`). Die Anwendung referenziert Pfade automatisch relativ zum Datenverzeichnis.
3. Starte das Backend (`npm run dev --workspace @plex-exporter/backend`) und rufe den Katalog anschließend im Browser auf (Standard: `http://localhost:4000`). Änderungen an den Daten werden beim nächsten Laden der API sichtbar.

### Serien aktualisieren
1. Exportiere deine Serienbibliothek als vollständige JSON-Datei (z. B. aus Plex) und speichere sie als `data/exports/series/series_full.json`.
2. Erzeuge Index- und Detaildateien mit `npm run split:series`. Das Skript `tools/split_series.mjs` erstellt `series_index.json` sowie einzelne Dateien unter `data/exports/series/details/`.
3. Kopiere Poster/Staffelbilder in passende Unterordner (`data/exports/series/Show - <Titel> [<ratingKey>].images/`). Die Anwendung verknüpft Staffel- und Episodenbilder automatisch über `apps/frontend/src/js/data.js`.
4. Aktualisiere die Ansicht über den laufenden Backend-Server (`http://localhost:4000`), um die Änderungen im Katalog zu prüfen.

### Datenspeicherung und Fallbacks
- `apps/frontend/src/js/data.js` ruft ausschließlich die `/api/v1/*`-Endpoints auf und nutzt den gemeinsamen Cache-Layer (`fetchJson()`). Fehlerfälle blenden UI-Hinweise ein und liefern leere Listen, damit das Grid weiterhin reagiert.
- Detailansichten laden zusätzliche JSON-Dateien erst beim Öffnen eines Elements, um die Initialladezeit niedrig zu halten.

### Produktive Bereitstellung von Exporten
- Lege reale Plex-Exporte dauerhaft unter `data/exports/movies/` und `data/exports/series/` ab. Der Backend-Build kann diese Verzeichnisse nach Bedarf versionieren oder in eine Artefakt-Pipeline übernehmen.
- Biete die JSON-Dateien und Bilder über das Backend an (z. B. über `/api/v1/*` oder begleitende statische Routen). Damit bleiben URLs im Frontend stabil, egal ob lokal oder im Deployment.
- Nutze Automatisierungen im Backend-Build, um Exporte zu synchronisieren (z. B. Copy-Schritte in CI/CD, Container-Mounts oder Assets aus einem CDN/Bucket).

## Watchlist & Debugging
- Die Watchlist speichert Einträge in `localStorage` (`watchlist:v1`). Über die Buttons im UI kannst du Einträge hinzufügen, entfernen, exportieren oder die Liste leeren. Beim Export wird eine `watchlist.json` im Browser heruntergeladen.
- Das Debug-Overlay (Button "Debug" in den Einstellungen) zeigt Informationen über aktuelle Filter, Datenquellen und den Status der Hero-Pipeline. Die Ausgabe lässt sich direkt kopieren, um Fehlerberichte zu erleichtern.

## Hero-Rotation & Policy-Datei
- Die Hero-Fläche liest ihre Steuerung aus `apps/frontend/public/hero.policy.json`. Die Datei definiert Poolgrößen (`poolSizeMovies`, `poolSizeSeries`), Slot-Quoten (`slots.*`), Diversitäts-Gewichte, Rotations-Intervalle sowie bevorzugte Fallback-Quellen und Text-Limits.
- `cache.ttlHours` und `cache.graceMinutes` steuern die Wiederverwendung bereits berechneter Hero-Pools. Innerhalb der TTL (Standard 24 Stunden) liefert das Backend seine letzte Berechnung mit `fromCache: true`; die Grace-Periode erlaubt einen sanften Übergang, bevor ein Neuaufbau erzwungen wird.
- `apps/frontend/src/features/hero/policy.js` lädt die Policy (mit Fallback auf eingebaute Defaults), validiert Werte und stellt abgeleitete Helfer (`getPoolSizes()`, `getCacheTtl()`, …) bereit. Die Datei akzeptiert Hot-Reload ohne Seitenneustart: Änderungen an `hero.policy.json` werden beim nächsten `initHeroPolicy()`-Aufruf übernommen.
- Die Hero-Pipeline nutzt ausschließlich das Backend (`/api/hero/<kind>`), um vorberechnete Pools samt Metadaten (Quelle, Ablaufzeit, Slot-Zusammenfassung) zu beziehen. Serverseitige TTLs werden über `cache.ttlHours`/`cache.graceMinutes` gesteuert und in der API-Antwort reflektiert (`expiresAt`, `fromCache`).
- Ein Feature-Flag steuert den gesamten Pipeline-Pfad: `apps/frontend/src/features/hero/pipeline.js` liest zuerst einen lokalen Override (`localStorage.feature.heroPipeline`), fällt dann auf `apps/frontend/config/frontend.json` (`heroPipelineEnabled` oder `features.heroPipeline`) zurück und aktiviert die Pipeline standardmäßig, wenn kein Flag gesetzt ist. Wird die Pipeline deaktiviert, blendet das Frontend automatisch das statische Fallback-Hero ein.

## Fallbacks, Fehlerbehandlung & Sprachindikator
- Netzwerkfehler, Rate Limits oder ungültige Antworten werden abgefangen, im Log markiert und blockieren die UI nicht; Hero-Rotation und Modals signalisieren stattdessen Statusmeldungen bzw. nutzen vorhandene Caches.

## Nützliche Befehle
| Befehl | Beschreibung |
| --- | --- |
| `npm run split:series` | Ruft `tools/split_series.mjs` auf, verarbeitet `data/exports/series/series_full.json` und erzeugt `series_index.json` sowie Detaildateien. |

### Bundle-Größen-Limits
- `npm run build` bzw. das Skript `apps/frontend/scripts/build.mjs` überprüft die Größe der erzeugten Bundles.
- Standardlimits: maximal **250 KB** für JavaScript (`main.js`) und **150 KB** für die kombinierten CSS-Dateien.
- Passe die Limits bei Bedarf über Umgebungsvariablen an, z. B. `MAX_JS_KB=300 MAX_CSS_KB=180 npm run build`.
- Die gleichen Standardwerte gelten lokal und in der CI, solange keine Variablen gesetzt werden.

Viel Spaß beim Verteilen deines Plex-Katalogs!
